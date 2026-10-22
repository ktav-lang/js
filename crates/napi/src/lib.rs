//! N-API bindings for the Ktav configuration format.
//!
//! Built by `napi-rs` into a platform-specific `.node` binary loadable
//! via `require()` in Node and Bun. N-API sees JS strings without the
//! UTF-16 ↔ UTF-8 copy that dominates the wasm-bindgen path, so for
//! Node/Bun consumers this is a noticeable speedup over the wasm build.
//!
//! The public shape and the Value ↔ JS conversion rules match the
//! sibling `ktav-wasm` crate exactly — see its docstring for the type
//! mapping table. Keep the two crates structurally aligned so the TS
//! facade stays thin.

use indexmap::IndexMap;
use ktav::render;
use ktav::value::{ObjectMap, Scalar, Value};
use napi::bindgen_prelude::*;
use napi::{sys, ValueType};
use napi_derive::napi;
use rustc_hash::FxBuildHasher;

fn envelope_json(err: &ktav::Error, source: &str) -> String {
    let mut env = ktav::ErrorEnvelope::from_error(err, source);
    // Spec § 6: every source-content parse error carries a 1-based line.
    // `from_error` takes the line from `Error::line()`, which is `None`
    // for an EOF-detected `UnclosedCompound` even though the error
    // carries an opener..EOF span. This layer has the source, so the
    // line is derived from the span's start (the opener line) here
    // rather than shipping a null. Errors with no source position (Io,
    // writer rejections) have no span and keep their honest nulls.
    // Ported verbatim from `rust/src/cabi/envelope.rs::envelope`.
    if env.line.is_none() && !source.is_empty() {
        if let Some(span) = env.span {
            env.line = Some(line_of_offset(source.as_bytes(), span.start as usize));
        }
    }
    env.to_json()
}

fn message_envelope(text: impl Into<String>) -> String {
    envelope_json(&ktav::Error::Message(text.into()), "")
}

/// The raw-`InvalidUtf8` envelope for the `loadsBytes` byte entry
/// (spec 0.8 § 3.1/§ 6.15). Contract mirrored from
/// `rust/src/cabi/envelope.rs::not_utf8_envelope` — the core exposes
/// `ktav::parse(&str)` only, so the binding layer performs the UTF-8
/// validation itself: class `InvalidUtf8` (never `Message`), with the
/// § 6 location computed over the ORIGINAL bytes. The span covers the
/// offending sequence (`Utf8Error::error_len`), or runs to end-of-input
/// when the sequence is truncated at EOF (`error_len` is `None`); an
/// illegal lead byte reported as one byte swallows the following
/// continuation bytes so the span covers the ill-formed region whole.
/// No valid source text exists, so `line_text` stays null while `line`
/// and `span` are filled from the raw bytes.
fn not_utf8_envelope(src: &[u8], err: std::str::Utf8Error) -> String {
    let valid_up_to = err.valid_up_to();
    let mut end = valid_up_to + err.error_len().unwrap_or(src.len() - valid_up_to);
    if err.error_len() == Some(1) {
        while src.get(end).is_some_and(|b| (0x80..=0xBF).contains(b)) {
            end += 1;
        }
    }
    let mut env = ktav::ErrorEnvelope::from_error(&ktav::Error::InvalidUtf8 { valid_up_to }, "");
    // `Span` is u32-based; a >4 GiB document is beyond what `Span` can
    // address anywhere in this crate, so saturate (same trade-off as the
    // cabi layer).
    let start = u32::try_from(valid_up_to).unwrap_or(u32::MAX);
    let end = u32::try_from(end).unwrap_or(u32::MAX);
    env.line = Some(line_of_offset(src, valid_up_to));
    env.span = Some(ktav::Span::new(start, end));
    env.body = Some(format!("input is not valid UTF-8: {err}"));
    env.to_json()
}

/// 1-based line number of raw byte offset `pos`, counting each LF, lone
/// CR and CR LF pair as exactly one terminator (spec § 3.2). Mirrors
/// `rust/src/cabi/envelope.rs::line_of_offset`; counted over the raw
/// bytes, before BOM removal or trimming (§ 6.15).
fn line_of_offset(bytes: &[u8], pos: usize) -> u32 {
    let mut line: u32 = 1;
    let mut i = 0;
    let bound = pos.min(bytes.len());
    while i < bound {
        match bytes[i] {
            b'\n' => {
                line += 1;
                i += 1;
            }
            b'\r' => {
                if bytes.get(i + 1) == Some(&b'\n') {
                    if i + 2 <= pos {
                        line += 1;
                    }
                    i += 2;
                } else {
                    line += 1;
                    i += 1;
                }
            }
            _ => i += 1,
        }
    }
    line
}

/// Parse a Ktav document and return the equivalent JavaScript value.
#[napi]
pub fn loads<'env>(env: &'env Env, s: String) -> Result<Unknown<'env>> {
    let value = ktav::parse(&s).map_err(|e| Error::from_reason(envelope_json(&e, &s)))?;
    value_to_js(env, &value)
}

/// Parse a Ktav document with strict canonical-scalar validation.
#[napi(js_name = "loadsStrict")]
pub fn loads_strict<'env>(env: &'env Env, s: String) -> Result<Unknown<'env>> {
    let value = ktav::parse_strict(&s).map_err(|e| Error::from_reason(envelope_json(&e, &s)))?;
    value_to_js(env, &value)
}

/// Parse a Ktav document from RAW BYTES (spec 0.8 § 6.15): the bytes
/// are validated as UTF-8 at this boundary and invalid input fails as
/// class `InvalidUtf8` with a byte span and 1-based line computed over
/// the original bytes — BEFORE any grammar diagnosis. The core exposes
/// `parse(&str)` only, so validation lives here (see
/// `not_utf8_envelope`, which mirrors the cabi contract). The bytes are
/// copied out of the JS ArrayBuffer up-front so the parse never aliases
/// memory the JS side could detach.
#[napi(js_name = "loadsBytes")]
pub fn loads_bytes<'env>(env: &'env Env, bytes: Uint8Array) -> Result<Unknown<'env>> {
    let bytes = bytes.to_vec();
    let text = std::str::from_utf8(&bytes)
        .map_err(|e| Error::from_reason(not_utf8_envelope(&bytes, e)))?;
    let value = ktav::parse(text).map_err(|e| Error::from_reason(envelope_json(&e, text)))?;
    value_to_js(env, &value)
}

/// Serialize a JavaScript value as a Ktav document. The top-level value
/// must be a plain object or an array — both are valid Ktav root kinds
/// since spec 0.1.1 (top-level Arrays render bare, item-per-line, with
/// no enclosing `[...]`).
#[napi]
pub fn dumps(env: &Env, obj: Unknown) -> Result<String> {
    let value = js_to_value(env, &obj)?;
    if !matches!(value, Value::Object(_) | Value::Array(_)) {
        return Err(Error::from_reason(message_envelope(
            "top-level Ktav document must be an object or array",
        )));
    }
    render_top_level(&value).map_err(|e| Error::from_reason(envelope_json(&e, "")))
}

/// Serialize a JavaScript value as a Ktav document with every scalar
/// coerced to a String — typed integers (`:i`), typed floats (`:f`),
/// booleans, and `null` are flattened to their textual form. Compounds
/// retain their structure. Useful for "everything is a string" dumps
/// for downstream consumers that don't understand the typed markers.
///
/// Exposed under the JS-idiomatic name `stringifyForceStrings` from the
/// TypeScript facade; the napi binding keeps the snake_case name to
/// stay structurally aligned with the upstream `ktav::to_string_force_strings`.
#[napi(js_name = "stringifyForceStrings")]
pub fn stringify_force_strings(env: &Env, obj: Unknown) -> Result<String> {
    let value = js_to_value(env, &obj)?;
    if !matches!(value, Value::Object(_) | Value::Array(_)) {
        return Err(Error::from_reason(
            "top-level Ktav document must be an object or array".to_string(),
        ));
    }
    let coerced = force_strings_top_level(&value);
    render_top_level(&coerced).map_err(|e| Error::from_reason(envelope_json(&e, "")))
}

/// Format a Ktav document text-to-text: every comment is preserved
/// verbatim (§ 3.4); blank-line runs collapse to one and blank padding
/// inside brackets is dropped, making the transform a fixed point; key
/// order is never changed (§ 5.9). For documents with no comments and no
/// blank lines the result equals `emitCanonical` of the parse.
#[napi(js_name = "format")]
pub fn format(s: String) -> Result<String> {
    ktav::format_str(&s).map_err(|e| Error::from_reason(envelope_json(&e, &s)))
}

/// Emit the canonical text of the parse of Ktav source text
/// (text-to-text): comments and blank-line grouping are NOT preserved
/// (canonical form has none — use `format` for that). For byte-exact
/// canonical output from an existing document use this entry point,
/// not `emitCanonical`: JS numbers cannot carry the Ktav Integer /
/// Float distinction, so `1.0` would arrive as `1` and `1e9` as
/// `1000000000` through the object-based path, while text-to-text
/// keeps the original scalar spellings byte-exactly.
#[napi(js_name = "canonicalFromSource")]
pub fn canonical_from_source(s: String) -> Result<String> {
    let value = ktav::parse(&s).map_err(|e| Error::from_reason(envelope_json(&e, &s)))?;
    ktav::emit_canonical(&value).map_err(|e| Error::from_reason(envelope_json(&e, &s)))
}

/// Emit the canonical Ktav representation of a JavaScript value.
/// Canonical form is the normalised, round-trip-stable output defined
/// by spec 0.5.0. Mirrors `ktav::emit_canonical` from the Rust crate.
#[napi(js_name = "emitCanonical")]
pub fn emit_canonical(env: &Env, obj: Unknown) -> Result<String> {
    let value = js_to_value(env, &obj)?;
    if !matches!(value, Value::Object(_) | Value::Array(_)) {
        return Err(Error::from_reason(message_envelope(
            "top-level Ktav document must be an object or array",
        )));
    }
    ktav::emit_canonical(&value).map_err(|e| Error::from_reason(envelope_json(&e, "")))
}

/// Render a top-level Value as a Ktav document string, implementing the
/// spec § 5.9.3 disambiguation rule:
///
/// - An empty top-level Array renders as `[]\n` per § 5.9.3.
/// - When a top-level Array's first item is a non-empty Array or non-empty
///   Object (which would render starting with a lone `[` or `{`, causing
///   the parser to misidentify it as the root opener), the whole top-level
///   Array is wrapped in explicit `[\n…\n]\n` brackets with each item
///   indented by 4 spaces (one indent level).
///
/// All other cases delegate directly to `render::render`.
fn render_top_level(value: &Value) -> ktav::Result<String> {
    render::render(value)
}

/// Coerce every scalar in `value` to a String, mirroring
/// `ktav::render::to_string_force_strings` but available without
/// calling through the crate API (which calls `render::render` internally
/// without the empty-array / wrap fix).
fn force_strings_top_level(value: &Value) -> Value {
    match value {
        Value::Null => Value::String(ktav::value::Scalar::from("null")),
        Value::Bool(true) => Value::String(ktav::value::Scalar::from("true")),
        Value::Bool(false) => Value::String(ktav::value::Scalar::from("false")),
        Value::Integer(s) | Value::Float(s) | Value::String(s) => Value::String(s.clone()),
        Value::Array(items) => Value::Array(items.iter().map(force_strings_top_level).collect()),
        Value::Object(obj) => {
            let mut out = ObjectMap::with_capacity_and_hasher(obj.len(), FxBuildHasher);
            for (k, v) in obj {
                out.insert(k.clone(), force_strings_top_level(v));
            }
            Value::Object(out)
        }
    }
}

/// Map a `ktav::Value` to a native JavaScript value via N-API.
///
/// Internally all construction goes through each type's `ToNapiValue`
/// impl → raw `napi_value` → `Unknown`. Going through the "new" v3
/// types (`Object<'env>`, `BigInt`, …) would be slightly more
/// idiomatic, but the raw path is uniform and keeps the converter a
/// simple recursive match — mirroring the wasm-bindgen crate.
fn value_to_js<'env>(env: &'env Env, value: &Value) -> Result<Unknown<'env>> {
    match value {
        Value::Null => from_napi_value(env, unsafe { Null::to_napi_value(env.raw(), Null)? }),
        Value::Bool(b) => from_napi_value(env, unsafe { bool::to_napi_value(env.raw(), *b)? }),
        Value::Integer(s) => integer_to_js(env, s.as_str()),
        Value::Float(s) => {
            let v: f64 = s.as_str().parse().map_err(|_| {
                Error::from_reason(message_envelope(format!(
                    "Invalid Float literal: {}",
                    s.as_str()
                )))
            })?;
            from_napi_value(env, unsafe { f64::to_napi_value(env.raw(), v)? })
        }
        Value::String(s) => {
            let owned = s.as_str().to_string();
            from_napi_value(env, unsafe { String::to_napi_value(env.raw(), owned)? })
        }
        Value::Array(items) => {
            let mut arr = env.create_array(items.len() as u32)?;
            for (i, item) in items.iter().enumerate() {
                arr.set(i as u32, value_to_js(env, item)?)?;
            }
            arr.into_unknown(env)
        }
        Value::Object(obj) => {
            let mut out = Object::new(env)?;
            for (k, v) in obj.iter() {
                let key = env.create_string(k.as_str())?;
                out.set_property(key, value_to_js(env, v)?)?;
            }
            out.into_unknown(env)
        }
    }
}

/// Encode a Ktav `Integer` scalar (stored as decimal string) as the
/// smallest JS numeric type that losslessly represents it:
///
/// - fits in i53 → `Number`
/// - fits in i128 → JS `BigInt` via `i128`'s `ToNapiValue` impl
/// - otherwise → parse via JS `BigInt(str)` so arbitrary-precision
///   literals still survive the round-trip.
fn integer_to_js<'env>(env: &'env Env, s: &str) -> Result<Unknown<'env>> {
    if let Ok(n) = s.parse::<i64>() {
        if (-(1i64 << 53)..=(1i64 << 53)).contains(&n) {
            return from_napi_value(env, unsafe { i64::to_napi_value(env.raw(), n)? });
        }
    }
    if let Ok(n) = s.parse::<i128>() {
        return from_napi_value(env, unsafe { i128::to_napi_value(env.raw(), n)? });
    }
    bigint_from_decimal(env, s)
}

/// Construct a `BigInt` for an arbitrary-precision decimal string by
/// calling the JS `BigInt(str)` function. Hit only when the literal
/// doesn't fit in i128 — vanishingly rare in configuration data.
fn bigint_from_decimal<'env>(env: &'env Env, s: &str) -> Result<Unknown<'env>> {
    let global = env.get_global()?;
    let bigint_ctor: Function<String, Unknown<'env>> = global.get_named_property("BigInt")?;
    bigint_ctor.call(s.to_string())
}

/// Map a native JavaScript value to a `ktav::Value` via N-API.
///
/// Order matters: `BigInt` must be checked before generic object
/// branches. `Number.isInteger(x)` decides `:i` vs `:f` for plain
/// numbers — `1` encodes as `:i 1`, `1.5` as `:f 1.5`.
fn js_to_value(env: &Env, obj: &Unknown) -> Result<Value> {
    match obj.get_type()? {
        ValueType::Null | ValueType::Undefined => Ok(Value::Null),
        ValueType::Boolean => {
            let b: bool = unsafe { obj.cast()? };
            Ok(Value::Bool(b))
        }
        ValueType::BigInt => {
            // Coerce the BigInt to its decimal string form via the
            // global `String(x)` constructor — the JS spec mandates
            // that `String(bigint)` matches `bigint.toString()`. We
            // route through `String(...)` rather than
            // `bigint.toString.call(bi, 10)` because the `this`
            // parameter of napi-rs's `Function::call` is typed `T: ToNapiValue`
            // but the ergonomic path for calling a unary global is direct.
            let global = env.get_global()?;
            let string_ctor: Function<Unknown, String> = global.get_named_property("String")?;
            let s = string_ctor.call(*obj)?;
            Ok(Value::Integer(Scalar::from(s.as_str())))
        }
        ValueType::Number => {
            let n: f64 = unsafe { obj.cast()? };
            if !n.is_finite() {
                return Err(Error::from_reason(message_envelope(
                    "NaN / Infinity is not representable in Ktav",
                )));
            }
            if n.fract() == 0.0 && (i64::MIN as f64..=i64::MAX as f64).contains(&n) {
                let mut buf = itoa::Buffer::new();
                Ok(Value::Integer(Scalar::from(buf.format(n as i64))))
            } else {
                Ok(Value::Float(Scalar::from(format_float(n))))
            }
        }
        ValueType::String => {
            let s: String = unsafe { obj.cast()? };
            Ok(Value::String(Scalar::from(s.as_str())))
        }
        ValueType::Object => {
            // `Array::is_array` is the structural check; a js array is
            // also a `typeof === "object"`, so we must branch here.
            let is_array = {
                let mut ia: bool = false;
                let status = unsafe { sys::napi_is_array(env.raw(), obj.raw(), &mut ia) };
                if status != sys::Status::napi_ok {
                    return Err(Error::from_reason(message_envelope("napi_is_array failed")));
                }
                ia
            };
            if is_array {
                let arr: Array = unsafe { obj.cast()? };
                let len = arr.len();
                let mut out = Vec::with_capacity(len as usize);
                for i in 0..len {
                    let item: Unknown = arr.get(i)?.ok_or_else(|| {
                        Error::from_reason(message_envelope("Array element missing"))
                    })?;
                    out.push(js_to_value(env, &item)?);
                }
                return Ok(Value::Array(out));
            }
            let js_obj: Object = unsafe { obj.cast()? };
            let names = js_obj.get_property_names()?;
            let name_arr: Array = unsafe { Array::from_napi_value(env.raw(), names.raw())? };
            let len = name_arr.len();
            let mut map: ObjectMap =
                IndexMap::with_capacity_and_hasher(len as usize, FxBuildHasher);
            for i in 0..len {
                let key: String = name_arr
                    .get::<String>(i)?
                    .ok_or_else(|| Error::from_reason(message_envelope("property name missing")))?;
                let key_js = env.create_string(&key)?;
                let val: Unknown = js_obj.get_property(key_js)?;
                map.insert(Scalar::from(key.as_str()), js_to_value(env, &val)?);
            }
            Ok(Value::Object(map))
        }
        other => Err(Error::from_reason(message_envelope(format!(
            "Unsupported JavaScript value type for Ktav: {other:?}"
        )))),
    }
}

/// Wrap a freshly-constructed `napi_value` as an `Unknown<'env>`. The
/// pointer must already belong to the same env.
fn from_napi_value<'env>(env: &'env Env, raw: sys::napi_value) -> Result<Unknown<'env>> {
    unsafe { Unknown::from_napi_value(env.raw(), raw) }
}

/// Format `f64` with a mandatory decimal point in the mantissa — Ktav's
/// Float grammar requires `N.N` at a minimum, but `ryu` emits `1e100`
/// without one for large values. Inserts `.0` right before the exponent.
fn format_float(v: f64) -> String {
    let mut buf = ryu::Buffer::new();
    let s = buf.format(v);
    let bytes = s.as_bytes();
    let mut e_pos: Option<usize> = None;
    let mut has_dot = false;
    for (i, &b) in bytes.iter().enumerate() {
        if b == b'.' {
            has_dot = true;
        } else if b == b'e' || b == b'E' {
            e_pos = Some(i);
            break;
        }
    }
    match (e_pos, has_dot) {
        (_, true) => s.to_string(),
        (Some(pos), false) => {
            let mut out = String::with_capacity(s.len() + 2);
            out.push_str(&s[..pos]);
            out.push_str(".0");
            out.push_str(&s[pos..]);
            out
        }
        (None, false) => {
            let mut out = String::with_capacity(s.len() + 2);
            out.push_str(s);
            out.push_str(".0");
            out
        }
    }
}
