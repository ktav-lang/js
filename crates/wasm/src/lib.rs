//! WebAssembly bindings for the Ktav configuration format.
//!
//! Compiled by `wasm-pack` into two targets (web / bundler) that serve
//! browser, Deno, and bundled consumers. Node / Bun go through the
//! sibling `ktav-napi` crate instead — see `crates/napi/` — because
//! N-API avoids the UTF-16 ↔ UTF-8 string copy that dominates the
//! wasm-bindgen FFI boundary. A thin TypeScript facade under `ts/`
//! wraps both backends with generic-typed `loads<T>` / `dumps<T>`
//! signatures so consumers see one API.
//!
//! ## Type mapping (spec 0.5.0)
//!
//! | Ktav               | JavaScript           |
//! |--------------------|----------------------|
//! | `null`             | `null`               |
//! | `true` / `false`   | `boolean`            |
//! | `:i <digits>`      | `number` (safe) / `bigint` (out of range) |
//! | `:f <number>`      | `number`             |
//! | bare scalar        | `string`             |
//! | `[ ... ]`          | `Array`              |
//! | `{ ... }`          | plain object         |
//!
//! JavaScript has a single `number` type, so the encoder uses a simple
//! rule: `Number.isInteger(x)` → `:i`, otherwise `:f`. `bigint` always
//! becomes `:i` (arbitrary precision round-trips through decimal string).

use indexmap::IndexMap;
use js_sys::{Array, BigInt, Object, Reflect};
use ktav::render;
use ktav::value::{ObjectMap, Scalar, Value};
use rustc_hash::FxBuildHasher;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

fn envelope_json(err: &ktav::Error, source: &str) -> String {
    ktav::ErrorEnvelope::from_error(err, source).to_json()
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
    let mut env =
        ktav::ErrorEnvelope::from_error(&ktav::Error::InvalidUtf8 { valid_up_to }, "");
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
#[wasm_bindgen(js_name = loads)]
pub fn loads(s: &str) -> Result<JsValue, JsError> {
    let value = ktav::parse(s).map_err(|e| JsError::new(&envelope_json(&e, s)))?;
    value_to_js(&value)
}

/// Parse a Ktav document with strict canonical-scalar validation.
#[wasm_bindgen(js_name = loadsStrict)]
pub fn loads_strict(s: &str) -> Result<JsValue, JsError> {
    let value = ktav::parse_strict(s).map_err(|e| JsError::new(&envelope_json(&e, s)))?;
    value_to_js(&value)
}

/// Parse a Ktav document from RAW BYTES (spec 0.8 § 6.15): the bytes
/// are validated as UTF-8 at this boundary and invalid input fails
/// through the same envelope-JSON error channel as every other entry
/// here (class `InvalidUtf8`, byte span + 1-based line over the
/// original bytes, BEFORE any grammar diagnosis). The core exposes
/// `parse(&str)` only, so validation lives here (see
/// `not_utf8_envelope`, which mirrors the cabi contract).
#[wasm_bindgen(js_name = loadsBytes)]
pub fn loads_bytes(bytes: &[u8]) -> Result<JsValue, JsError> {
    let text = std::str::from_utf8(bytes)
        .map_err(|e| JsError::new(&not_utf8_envelope(bytes, e)))?;
    let value = ktav::parse(text).map_err(|e| JsError::new(&envelope_json(&e, text)))?;
    value_to_js(&value)
}

/// Serialize a JavaScript value as a Ktav document. The top-level value
/// must be a plain object or an array — both are valid Ktav root kinds
/// since spec 0.1.1 (top-level Arrays render bare, item-per-line, with
/// no enclosing `[...]`).
#[wasm_bindgen(js_name = dumps)]
pub fn dumps(obj: JsValue) -> Result<String, JsError> {
    let value = js_to_value(&obj)?;
    if !matches!(value, Value::Object(_) | Value::Array(_)) {
        return Err(JsError::new(&message_envelope(
            "top-level Ktav document must be an object or array",
        )));
    }
    render_top_level(&value).map_err(|e| JsError::new(&envelope_json(&e, "")))
}

/// Format a Ktav document text-to-text: every comment is preserved
/// verbatim (§ 3.4); blank-line runs collapse to one and blank padding
/// inside brackets is dropped, making the transform a fixed point; key
/// order is never changed (§ 5.9). For documents with no comments and no
/// blank lines the result equals `emitCanonical` of the parse.
#[wasm_bindgen(js_name = format)]
pub fn format(s: &str) -> Result<String, JsError> {
    ktav::format_str(s).map_err(|e| JsError::new(&envelope_json(&e, s)))
}

/// Emit the canonical text of the parse of Ktav source text
/// (text-to-text): comments and blank-line grouping are NOT preserved
/// (canonical form has none — use `format` for that). For byte-exact
/// canonical output from an existing document use this entry point,
/// not `emitCanonical`: JS numbers cannot carry the Ktav Integer /
/// Float distinction, so `1.0` would arrive as `1` and `1e9` as
/// `1000000000` through the object-based path, while text-to-text
/// keeps the original scalar spellings byte-exactly.
#[wasm_bindgen(js_name = canonicalFromSource)]
pub fn canonical_from_source(s: &str) -> Result<String, JsError> {
    let value = ktav::parse(s).map_err(|e| JsError::new(&envelope_json(&e, s)))?;
    ktav::emit_canonical(&value).map_err(|e| JsError::new(&envelope_json(&e, s)))
}

/// Emit the canonical Ktav representation of a JavaScript value.
/// Canonical form is the normalised, round-trip-stable output defined
/// by spec 0.5.0. Mirrors `ktav::emit_canonical` from the Rust crate.
#[wasm_bindgen(js_name = emitCanonical)]
pub fn emit_canonical(obj: JsValue) -> Result<String, JsError> {
    let value = js_to_value(&obj)?;
    if !matches!(value, Value::Object(_) | Value::Array(_)) {
        return Err(JsError::new(&message_envelope(
            "top-level Ktav document must be an object or array",
        )));
    }
    ktav::emit_canonical(&value).map_err(|e| JsError::new(&envelope_json(&e, "")))
}

/// Serialize a JavaScript value as a Ktav document with every scalar
/// coerced to a String — typed integers (`:i`), typed floats (`:f`),
/// booleans, and `null` are flattened to their textual form. Compounds
/// retain their structure. Mirrors `ktav::to_string_force_strings` from
/// the upstream Rust crate; exposed under the JS-idiomatic name
/// `stringifyForceStrings` from the TypeScript facade.
#[wasm_bindgen(js_name = stringifyForceStrings)]
pub fn stringify_force_strings(obj: JsValue) -> Result<String, JsError> {
    let value = js_to_value(&obj)?;
    if !matches!(value, Value::Object(_) | Value::Array(_)) {
        return Err(JsError::new(
            "top-level Ktav document must be an object or array",
        ));
    }
    let coerced = force_strings_value(&value);
    render_top_level(&coerced).map_err(|e| JsError::new(&envelope_json(&e, "")))
}

/// Map a `ktav::Value` to a native JavaScript value.
fn value_to_js(value: &Value) -> Result<JsValue, JsError> {
    Ok(match value {
        Value::Null => JsValue::NULL,
        Value::Bool(b) => JsValue::from_bool(*b),
        Value::Integer(s) => {
            // Fast path: most config integers fit in i53 (JS safe-integer
            // range). Parse + range-check; fall back to `BigInt` only when
            // the literal exceeds what JS Number can represent exactly.
            if let Ok(v) = s.as_str().parse::<i64>() {
                if (-(1i64 << 53)..=(1i64 << 53)).contains(&v) {
                    JsValue::from_f64(v as f64)
                } else {
                    bigint_from_str(s.as_str())?
                }
            } else {
                bigint_from_str(s.as_str())?
            }
        }
        Value::Float(s) => {
            let v: f64 = s.as_str().parse().map_err(|_| {
                JsError::new(&message_envelope(format!(
                    "Invalid Float literal: {}",
                    s.as_str()
                )))
            })?;
            JsValue::from_f64(v)
        }
        Value::String(s) => JsValue::from_str(s.as_str()),
        Value::Array(items) => {
            let arr = Array::new_with_length(items.len() as u32);
            for (i, item) in items.iter().enumerate() {
                arr.set(i as u32, value_to_js(item)?);
            }
            arr.into()
        }
        Value::Object(obj) => {
            let out = Object::new();
            for (k, v) in obj.iter() {
                Reflect::set(&out, &JsValue::from_str(k.as_str()), &value_to_js(v)?).map_err(
                    |e| JsError::new(&message_envelope(format!("Reflect::set failed: {e:?}"))),
                )?;
            }
            out.into()
        }
    })
}

/// Map a native JavaScript value to a `ktav::Value`.
///
/// Order matters: `bigint` must be checked before generic object
/// branches. `Number.isInteger(x)` decides `:i` vs `:f` for Number —
/// `1` encodes as `:i 1`, `1.5` as `:f 1.5`. (JS itself does not
/// distinguish `1` from `1.0`; users who want `:f` for a whole number
/// should use `BigInt`-free explicit decimals like `1.0` in a string.)
fn js_to_value(obj: &JsValue) -> Result<Value, JsError> {
    if obj.is_null() || obj.is_undefined() {
        return Ok(Value::Null);
    }
    if let Some(b) = obj.as_bool() {
        return Ok(Value::Bool(b));
    }
    if obj.is_bigint() {
        // `BigInt.prototype.toString(10)` gives a canonical decimal form
        // with no separators — safe to parse back on the Rust side.
        // `JsValue::as_string()` returns `None` for a BigInt (distinct
        // from a String), so route through `BigInt::to_string(10)`.
        let bi: &BigInt = obj.unchecked_ref();
        let s_js = bi.to_string(10).map_err(|e| {
            JsError::new(&message_envelope(format!(
                "BigInt.toString(10) failed: {e:?}"
            )))
        })?;
        let s = s_js.as_string().ok_or_else(|| {
            JsError::new(&message_envelope(
                "BigInt.toString(10) did not return a string",
            ))
        })?;
        return Ok(Value::Integer(Scalar::from(s.as_str())));
    }
    if let Some(n) = obj.as_f64() {
        if !n.is_finite() {
            return Err(JsError::new(&message_envelope(
                "NaN / Infinity is not representable in Ktav 0.1.0",
            )));
        }
        // Integer detection mirrors `Number.isInteger(x)` — integral and
        // within the i64 range (the broader i53-safe range is a subset).
        if n.fract() == 0.0 && (i64::MIN as f64..=i64::MAX as f64).contains(&n) {
            let mut buf = itoa::Buffer::new();
            return Ok(Value::Integer(Scalar::from(buf.format(n as i64))));
        }
        return Ok(Value::Float(Scalar::from(format_float(n))));
    }
    if let Some(s) = obj.as_string() {
        return Ok(Value::String(Scalar::from(s.as_str())));
    }
    if Array::is_array(obj) {
        let arr = Array::from(obj);
        let len = arr.length() as usize;
        let mut out = Vec::with_capacity(len);
        for i in 0..arr.length() {
            out.push(js_to_value(&arr.get(i))?);
        }
        return Ok(Value::Array(out));
    }
    if obj.is_object() {
        let entries = Object::entries(&Object::from(obj.clone()));
        let mut map: ObjectMap =
            IndexMap::with_capacity_and_hasher(entries.length() as usize, FxBuildHasher);
        for i in 0..entries.length() {
            let pair = Array::from(&entries.get(i));
            let key = pair.get(0);
            let val = pair.get(1);
            let key_str = key
                .as_string()
                .ok_or_else(|| JsError::new(&message_envelope("Object keys must be strings")))?;
            map.insert(Scalar::from(key_str.as_str()), js_to_value(&val)?);
        }
        return Ok(Value::Object(map));
    }
    Err(JsError::new(&message_envelope(
        "Unsupported JavaScript value type for Ktav",
    )))
}

/// Build a JS `BigInt` from a decimal string literal.
fn bigint_from_str(s: &str) -> Result<JsValue, JsError> {
    BigInt::new(&JsValue::from_str(s))
        .map(Into::into)
        .map_err(|e| JsError::new(&message_envelope(format!("BigInt parse failed: {e:?}"))))
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

/// Render a top-level Value as a Ktav document string, implementing the
/// spec § 5.9.3 disambiguation rule:
///
/// - An empty top-level Array renders as `[]\n` per § 5.9.3.
/// - When a top-level Array's first item is a non-empty Array or non-empty
///   Object, the whole top-level Array is wrapped in explicit `[\n…\n]\n`
///   brackets with each item indented by 4 spaces.
///
/// All other cases delegate to `render::render`.
fn render_top_level(value: &Value) -> ktav::Result<String> {
    render::render(value)
}

/// Coerce every scalar leaf in `value` to a String, mirroring
/// `ktav::render::to_string_force_strings` but using `render_top_level`
/// instead of `render::render` so the empty-array / wrap fixes apply.
fn force_strings_value(value: &Value) -> Value {
    match value {
        Value::Null => Value::String(Scalar::from("null")),
        Value::Bool(true) => Value::String(Scalar::from("true")),
        Value::Bool(false) => Value::String(Scalar::from("false")),
        Value::Integer(s) | Value::Float(s) | Value::String(s) => Value::String(s.clone()),
        Value::Array(items) => Value::Array(items.iter().map(force_strings_value).collect()),
        Value::Object(obj) => {
            let mut out: ObjectMap = IndexMap::with_capacity_and_hasher(obj.len(), FxBuildHasher);
            for (k, v) in obj {
                out.insert(k.clone(), force_strings_value(v));
            }
            Value::Object(out)
        }
    }
}
