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

/// Parse a Ktav document and return the equivalent JavaScript value.
#[napi]
pub fn loads<'env>(env: &'env Env, s: String) -> Result<Unknown<'env>> {
    let value = ktav::parse(&s).map_err(|e| Error::from_reason(e.to_string()))?;
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
        return Err(Error::from_reason(
            "Top-level Ktav value must be an object or an array".to_string(),
        ));
    }
    render::render(&value).map_err(|e| Error::from_reason(e.to_string()))
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
            "Top-level Ktav value must be an object or an array".to_string(),
        ));
    }
    ktav::to_string_force_strings(&value).map_err(|e| Error::from_reason(e.to_string()))
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
                Error::from_reason(format!("Invalid Float literal: {}", s.as_str()))
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
                out.set_named_property(k.as_str(), value_to_js(env, v)?)?;
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
                return Err(Error::from_reason(
                    "NaN / Infinity is not representable in Ktav 0.1.0".to_string(),
                ));
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
                    return Err(Error::from_reason("napi_is_array failed".to_string()));
                }
                ia
            };
            if is_array {
                let arr: Array = unsafe { obj.cast()? };
                let len = arr.len();
                let mut out = Vec::with_capacity(len as usize);
                for i in 0..len {
                    let item: Unknown = arr
                        .get(i)?
                        .ok_or_else(|| Error::from_reason("Array element missing"))?;
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
                    .ok_or_else(|| Error::from_reason("property name missing"))?;
                let val: Unknown = js_obj.get_named_property(&key)?;
                map.insert(Scalar::from(key.as_str()), js_to_value(env, &val)?);
            }
            Ok(Value::Object(map))
        }
        other => Err(Error::from_reason(format!(
            "Unsupported JavaScript value type for Ktav: {other:?}"
        ))),
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
