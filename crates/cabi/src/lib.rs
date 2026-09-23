//! C ABI wrapper around the `ktav` Rust crate, designed for consumption
//! from Go via `purego` (dynamic loading, no cgo on the caller side).
//!
//! ## Wire format
//!
//! Between Go and Rust we exchange **JSON**, not a custom binary. This
//! keeps the FFI boundary tiny and lets each side use its native JSON
//! machinery.
//!
//! Ktav's typed-integer and typed-float scalars do not map 1:1 onto JSON
//! numbers (JSON cannot represent arbitrary-precision integers, and
//! loses the `:i` / `:f` distinction). To keep round-trips lossless we
//! use tagged wrappers:
//!
//! - `Value::Integer(s)` ⇄ `{"$i": "<digits>"}`
//! - `Value::Float(s)`   ⇄ `{"$f": "<text>"}`
//!
//! Everything else maps to the obvious JSON shape (`null`, booleans,
//! strings, arrays, objects). Object key order is preserved on both
//! sides (`indexmap` here, `encoding/json` with `json.RawMessage` or an
//! ordered map on the Go side).
//!
//! ## C ABI
//!
//! Eight functions. The seven output functions share the six-parameter
//! signature
//!
//! ```text
//! (src: *const u8, src_len: usize,
//!  out_buf: **mut u8, out_len: *mut usize,
//!  out_err: **mut c_char, out_err_len: *mut usize) -> c_int
//! ```
//!
//! - `ktav_canonical_from_source(src, src_len, out_buf, out_len, out_err, out_err_len) -> i32`
//! - `ktav_dumps(src, src_len, out_buf, out_len, out_err, out_err_len) -> i32`
//! - `ktav_dumps_force_strings(src, src_len, out_buf, out_len, out_err, out_err_len) -> i32`
//! - `ktav_emit_canonical(src, src_len, out_buf, out_len, out_err, out_err_len) -> i32`
//! - `ktav_format(src, src_len, out_buf, out_len, out_err, out_err_len) -> i32`
//! - `ktav_loads(src, src_len, out_buf, out_len, out_err, out_err_len) -> i32`
//! - `ktav_loads_strict(src, src_len, out_buf, out_len, out_err, out_err_len) -> i32`
//!
//! plus, with their own signatures:
//!
//! - `ktav_free(ptr, len)` — free a buffer returned by any of the
//!   functions above (success bytes or error envelope alike).
//! - `ktav_version()` — NUL-terminated static string, for sanity checks.
//!
//! Return code: `0` on success, `1` on error. On error, `out_err` holds
//! a UTF-8 **JSON envelope** — a ten-field `ktav::ErrorEnvelope` object
//! since ktav 0.7.2 (`error`, `reason`, `line`, `line_text`, `span`,
//! `path`, `body`, `canonical`, `spec_section`, `message`, all ten
//! always present, absent info `null` except `message`, which never
//! is) — and must still be freed via `ktav_free`. It is never plain
//! text, so callers never sniff JSON vs plain text.

use std::os::raw::{c_char, c_int};
use std::ptr;
use std::slice;

use indexmap::IndexMap;
use ktav::value::{ObjectMap, Value};
use serde::de::{self, MapAccess, Visitor};
use serde::{Deserialize, Deserializer};
use serde_json::{Map as JsonMap, Value as Json};

/// Written into the caller's `**u8` / `*usize` on success.
#[inline]
unsafe fn emit(buf: Vec<u8>, out_buf: *mut *mut u8, out_len: *mut usize) {
    let mut boxed = buf.into_boxed_slice();
    let len = boxed.len();
    let ptr = boxed.as_mut_ptr();
    std::mem::forget(boxed);
    *out_buf = ptr;
    *out_len = len;
}

unsafe fn emit_err(msg: String, out_err: *mut *mut c_char, out_err_len: *mut usize) {
    let bytes = msg.into_bytes();
    let mut boxed = bytes.into_boxed_slice();
    let len = boxed.len();
    let ptr = boxed.as_mut_ptr() as *mut c_char;
    std::mem::forget(boxed);
    *out_err = ptr;
    *out_err_len = len;
}

/// Render any [`ktav::Error`] as the ten-field JSON envelope string.
fn envelope_json(err: &ktav::Error, source: &str) -> String {
    ktav::ErrorEnvelope::from_error(err, source).to_json()
}

/// Wrap a plain-text failure as `ktav::Error::Message` and render the
/// envelope, so the error channel is always a ten-field JSON object.
fn message_envelope(text: String, source: &str) -> String {
    envelope_json(&ktav::Error::Message(text), source)
}

/// Parse a Ktav document. Returns JSON bytes on success, error message on
/// failure. Caller frees both via `ktav_free`.
///
/// # Safety
/// `src` must point to `src_len` valid bytes. Output pointers must be
/// valid for writes.
#[no_mangle]
pub unsafe extern "C" fn ktav_loads(
    src: *const u8,
    src_len: usize,
    out_buf: *mut *mut u8,
    out_len: *mut usize,
    out_err: *mut *mut c_char,
    out_err_len: *mut usize,
) -> c_int {
    *out_buf = ptr::null_mut();
    *out_len = 0;
    *out_err = ptr::null_mut();
    *out_err_len = 0;

    let input = match std::str::from_utf8(slice::from_raw_parts(src, src_len)) {
        Ok(s) => s,
        Err(e) => {
            emit_err(
                envelope_json(
                    &ktav::Error::InvalidUtf8 {
                        valid_up_to: e.valid_up_to(),
                    },
                    "",
                ),
                out_err,
                out_err_len,
            );
            return 1;
        }
    };

    let value = match ktav::parse(input) {
        Ok(v) => v,
        Err(e) => {
            emit_err(envelope_json(&e, input), out_err, out_err_len);
            return 1;
        }
    };

    let json = value_to_json(&value);
    let bytes = match serde_json::to_vec(&json) {
        Ok(b) => b,
        Err(e) => {
            emit_err(
                message_envelope(format!("internal: encode JSON: {e}"), input),
                out_err,
                out_err_len,
            );
            return 1;
        }
    };

    emit(bytes, out_buf, out_len);
    0
}

/// Parse a Ktav document in strict mode and return the same JSON wire format
/// as [`ktav_loads`].
///
/// # Safety
/// Same as [`ktav_loads`].
#[no_mangle]
pub unsafe extern "C" fn ktav_loads_strict(
    src: *const u8,
    src_len: usize,
    out_buf: *mut *mut u8,
    out_len: *mut usize,
    out_err: *mut *mut c_char,
    out_err_len: *mut usize,
) -> c_int {
    *out_buf = ptr::null_mut();
    *out_len = 0;
    *out_err = ptr::null_mut();
    *out_err_len = 0;

    let input = match std::str::from_utf8(slice::from_raw_parts(src, src_len)) {
        Ok(s) => s,
        Err(e) => {
            emit_err(
                envelope_json(
                    &ktav::Error::InvalidUtf8 {
                        valid_up_to: e.valid_up_to(),
                    },
                    "",
                ),
                out_err,
                out_err_len,
            );
            return 1;
        }
    };

    let value = match ktav::parse_strict(input) {
        Ok(v) => v,
        Err(e) => {
            emit_err(envelope_json(&e, input), out_err, out_err_len);
            return 1;
        }
    };

    let json = value_to_json(&value);
    let bytes = match serde_json::to_vec(&json) {
        Ok(b) => b,
        Err(e) => {
            emit_err(
                message_envelope(format!("internal: encode JSON: {e}"), input),
                out_err,
                out_err_len,
            );
            return 1;
        }
    };

    emit(bytes, out_buf, out_len);
    0
}

/// Render a JSON document (as produced by `ktav_loads` or built by the
/// caller to the same schema) to Ktav text.
///
/// # Safety
/// Same as [`ktav_loads`].
#[no_mangle]
pub unsafe extern "C" fn ktav_dumps(
    src: *const u8,
    src_len: usize,
    out_buf: *mut *mut u8,
    out_len: *mut usize,
    out_err: *mut *mut c_char,
    out_err_len: *mut usize,
) -> c_int {
    *out_buf = ptr::null_mut();
    *out_len = 0;
    *out_err = ptr::null_mut();
    *out_err_len = 0;

    let bytes = slice::from_raw_parts(src, src_len);
    let wire: WireValue = match serde_json::from_slice(bytes) {
        Ok(w) => w,
        Err(e) => {
            emit_err(
                message_envelope(format!("input JSON: {e}"), ""),
                out_err,
                out_err_len,
            );
            return 1;
        }
    };

    let value = match wire.into_value() {
        Ok(v) => v,
        Err(e) => {
            emit_err(message_envelope(e, ""), out_err, out_err_len);
            return 1;
        }
    };

    if !matches!(value, Value::Object(_) | Value::Array(_)) {
        emit_err(
            message_envelope(
                "top-level Ktav document must be an object or array".to_string(),
                "",
            ),
            out_err,
            out_err_len,
        );
        return 1;
    }

    let text = match ktav::render::render(&value) {
        Ok(s) => s,
        Err(e) => {
            emit_err(envelope_json(&e, ""), out_err, out_err_len);
            return 1;
        }
    };

    emit(text.into_bytes(), out_buf, out_len);
    0
}

/// Render a JSON document (same wire schema as [`ktav_dumps`]) to Ktav
/// text with every scalar coerced to a String — typed integers (`:i`),
/// typed floats (`:f`), booleans, and `null` are flattened to their
/// textual form. Compounds keep their structure. Mirrors
/// [`ktav::to_string_force_strings`] in the upstream Rust crate.
///
/// # Safety
/// Same as [`ktav_loads`].
#[no_mangle]
pub unsafe extern "C" fn ktav_dumps_force_strings(
    src: *const u8,
    src_len: usize,
    out_buf: *mut *mut u8,
    out_len: *mut usize,
    out_err: *mut *mut c_char,
    out_err_len: *mut usize,
) -> c_int {
    *out_buf = ptr::null_mut();
    *out_len = 0;
    *out_err = ptr::null_mut();
    *out_err_len = 0;

    let bytes = slice::from_raw_parts(src, src_len);
    let wire: WireValue = match serde_json::from_slice(bytes) {
        Ok(w) => w,
        Err(e) => {
            emit_err(
                message_envelope(format!("input JSON: {e}"), ""),
                out_err,
                out_err_len,
            );
            return 1;
        }
    };

    let value = match wire.into_value() {
        Ok(v) => v,
        Err(e) => {
            emit_err(message_envelope(e, ""), out_err, out_err_len);
            return 1;
        }
    };

    if !matches!(value, Value::Object(_) | Value::Array(_)) {
        emit_err(
            message_envelope(
                "top-level Ktav document must be an object or array".to_string(),
                "",
            ),
            out_err,
            out_err_len,
        );
        return 1;
    }

    let text = match ktav::to_string_force_strings(&value) {
        Ok(s) => s,
        Err(e) => {
            emit_err(envelope_json(&e, ""), out_err, out_err_len);
            return 1;
        }
    };

    emit(text.into_bytes(), out_buf, out_len);
    0
}

/// Format a Ktav document (`text -> text`) via [`ktav::format_str`]:
/// normalise structure to spec § 5.9 canonical form while preserving
/// every comment and blank-line grouping from the source. Settled
/// semantics, for callers:
///
/// - Every comment is preserved verbatim. Ktav has no trailing
///   comments (spec § 3.4: a comment is a whole line), so attachment
///   is unambiguous.
/// - Blank lines survive as a grouping hint, but a run of two or more
///   collapses to exactly one, and blank padding immediately inside a
///   bracket (after an opening one, before a closing one) is dropped.
///   Together these make the transform a fixed point:
///   `ktav_format(ktav_format(x)) == ktav_format(x)`.
/// - Key order is never changed (canonical form has no sorting rule —
///   § 5.9).
/// - For a document with no comments AND no blank lines the result
///   equals `ktav_emit_canonical` of its parse (blank lines are no
///   more part of the `Value` model than comments are).
///
/// Invalid UTF-8 input is an ERROR reported through the envelope
/// channel as an `InvalidUtf8` error (spec § 6.15) — never a panic,
/// never a lossy replacement.
///
/// # Safety
/// Same as [`ktav_loads`].
#[no_mangle]
pub unsafe extern "C" fn ktav_format(
    src: *const u8,
    src_len: usize,
    out_buf: *mut *mut u8,
    out_len: *mut usize,
    out_err: *mut *mut c_char,
    out_err_len: *mut usize,
) -> c_int {
    *out_buf = ptr::null_mut();
    *out_len = 0;
    *out_err = ptr::null_mut();
    *out_err_len = 0;

    let text = match std::str::from_utf8(slice::from_raw_parts(src, src_len)) {
        Ok(s) => s,
        Err(e) => {
            emit_err(
                envelope_json(
                    &ktav::Error::InvalidUtf8 {
                        valid_up_to: e.valid_up_to(),
                    },
                    "",
                ),
                out_err,
                out_err_len,
            );
            return 1;
        }
    };

    match ktav::format_str(text) {
        Ok(formatted) => {
            emit(formatted.into_bytes(), out_buf, out_len);
            0
        }
        Err(e) => {
            emit_err(envelope_json(&e, text), out_err, out_err_len);
            1
        }
    }
}

/// Emit the canonical text of the parse of Ktav SOURCE TEXT
/// (`text -> text`) via [`ktav::parse`] + [`ktav::emit_canonical`].
/// Comments and blank-line grouping are NOT preserved — canonical form
/// has none; use [`ktav_format`] for that. Output is byte-exact with
/// the spec corpus's `.canonical.ktav` files.
///
/// This exists alongside [`ktav_emit_canonical`] because an
/// object-based canonical emitter behind a host value system that
/// cannot distinguish Ktav Integer from Float (e.g. a JS `number`)
/// loses that distinction (`1.0` arrives as `1`, `1e9` as
/// `1000000000`), while text-to-text keeps the original scalar
/// spellings byte-exactly.
///
/// Parse errors are enveloped with the input text as source; writer
/// refusals are enveloped too (they carry no position; passing the
/// source is harmless).
///
/// # Safety
/// Same as [`ktav_loads`].
#[no_mangle]
pub unsafe extern "C" fn ktav_canonical_from_source(
    src: *const u8,
    src_len: usize,
    out_buf: *mut *mut u8,
    out_len: *mut usize,
    out_err: *mut *mut c_char,
    out_err_len: *mut usize,
) -> c_int {
    *out_buf = ptr::null_mut();
    *out_len = 0;
    *out_err = ptr::null_mut();
    *out_err_len = 0;

    let text = match std::str::from_utf8(slice::from_raw_parts(src, src_len)) {
        Ok(s) => s,
        Err(e) => {
            emit_err(
                envelope_json(
                    &ktav::Error::InvalidUtf8 {
                        valid_up_to: e.valid_up_to(),
                    },
                    "",
                ),
                out_err,
                out_err_len,
            );
            return 1;
        }
    };

    let value = match ktav::parse(text) {
        Ok(v) => v,
        Err(e) => {
            emit_err(envelope_json(&e, text), out_err, out_err_len);
            return 1;
        }
    };

    match ktav::emit_canonical(&value) {
        Ok(text_out) => {
            emit(text_out.into_bytes(), out_buf, out_len);
            0
        }
        Err(e) => {
            emit_err(envelope_json(&e, text), out_err, out_err_len);
            1
        }
    }
}

/// Render a JSON document (same wire schema as [`ktav_dumps`],
/// including the top-level object-or-array requirement) to canonical
/// Ktav text via [`ktav::emit_canonical`] — the same upstream function
/// the sibling napi/wasm bindings call. Canonical form is byte-stable
/// across writer-conforming implementations (spec § 8.2).
///
/// # Safety
/// Same as [`ktav_loads`].
#[no_mangle]
pub unsafe extern "C" fn ktav_emit_canonical(
    src: *const u8,
    src_len: usize,
    out_buf: *mut *mut u8,
    out_len: *mut usize,
    out_err: *mut *mut c_char,
    out_err_len: *mut usize,
) -> c_int {
    *out_buf = ptr::null_mut();
    *out_len = 0;
    *out_err = ptr::null_mut();
    *out_err_len = 0;

    let bytes = slice::from_raw_parts(src, src_len);
    let wire: WireValue = match serde_json::from_slice(bytes) {
        Ok(w) => w,
        Err(e) => {
            emit_err(
                message_envelope(format!("input JSON: {e}"), ""),
                out_err,
                out_err_len,
            );
            return 1;
        }
    };

    let value = match wire.into_value() {
        Ok(v) => v,
        Err(e) => {
            emit_err(message_envelope(e, ""), out_err, out_err_len);
            return 1;
        }
    };

    if !matches!(value, Value::Object(_) | Value::Array(_)) {
        emit_err(
            message_envelope(
                "top-level Ktav document must be an object or array".to_string(),
                "",
            ),
            out_err,
            out_err_len,
        );
        return 1;
    }

    match ktav::emit_canonical(&value) {
        Ok(text) => {
            emit(text.into_bytes(), out_buf, out_len);
            0
        }
        Err(e) => {
            emit_err(envelope_json(&e, ""), out_err, out_err_len);
            1
        }
    }
}

/// Free a buffer returned by any of the six output functions —
/// success bytes or error envelope alike. `ptr`/`len` is a no-op when null/zero.
///
/// # Safety
/// Must be called exactly once per returned buffer with the same length
/// it was returned with.
#[no_mangle]
pub unsafe extern "C" fn ktav_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    let _ = Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len));
}

/// NUL-terminated static version string (crate version). For sanity
/// checks from the Go side that `LoadLibrary` picked up the right file.
#[no_mangle]
pub extern "C" fn ktav_version() -> *const c_char {
    concat!(env!("CARGO_PKG_VERSION"), "\0").as_ptr() as *const c_char
}

// ─── Value ↔ JSON conversion ──────────────────────────────────────────────

fn value_to_json(v: &Value) -> Json {
    match v {
        Value::Null => Json::Null,
        Value::Bool(b) => Json::Bool(*b),
        Value::Integer(s) => {
            let mut m = JsonMap::new();
            m.insert("$i".to_string(), Json::String(s.to_string()));
            Json::Object(m)
        }
        Value::Float(s) => {
            let mut m = JsonMap::new();
            m.insert("$f".to_string(), Json::String(s.to_string()));
            Json::Object(m)
        }
        Value::String(s) => Json::String(s.to_string()),
        Value::Array(a) => Json::Array(a.iter().map(value_to_json).collect()),
        Value::Object(o) => {
            let mut m = JsonMap::new();
            for (k, val) in o {
                m.insert(k.to_string(), value_to_json(val));
            }
            Json::Object(m)
        }
    }
}

/// Deserialize target that understands both plain JSON values and the
/// `{"$i": ...}` / `{"$f": ...}` tagged wrappers, preserving object key
/// order via `indexmap`.
enum WireValue {
    Null,
    Bool(bool),
    Integer(String),
    Float(String),
    String(String),
    Array(Vec<WireValue>),
    Object(IndexMap<String, WireValue>),
}

impl WireValue {
    fn into_value(self) -> Result<Value, String> {
        match self {
            WireValue::Null => Ok(Value::Null),
            WireValue::Bool(b) => Ok(Value::Bool(b)),
            WireValue::Integer(s) => {
                validate_integer(&s)?;
                Ok(Value::Integer(s.into()))
            }
            WireValue::Float(s) => {
                validate_float(&s)?;
                Ok(Value::Float(s.into()))
            }
            WireValue::String(s) => Ok(Value::String(s.into())),
            WireValue::Array(items) => {
                let mut out = Vec::with_capacity(items.len());
                for w in items {
                    out.push(w.into_value()?);
                }
                Ok(Value::Array(out))
            }
            WireValue::Object(m) => {
                let mut obj = ObjectMap::with_capacity_and_hasher(m.len(), Default::default());
                for (k, v) in m {
                    obj.insert(k.into(), v.into_value()?);
                }
                Ok(Value::Object(obj))
            }
        }
    }
}

fn validate_integer(s: &str) -> Result<(), String> {
    let rest = s.strip_prefix('-').unwrap_or(s);
    if rest.is_empty() || !rest.bytes().all(|b| b.is_ascii_digit()) {
        return Err(format!("$i payload not an integer literal: {s:?}"));
    }
    Ok(())
}

fn validate_float(s: &str) -> Result<(), String> {
    if s.parse::<f64>().is_err() {
        return Err(format!("$f payload not a finite decimal: {s:?}"));
    }
    if !s.bytes().any(|b| b == b'.' || b == b'e' || b == b'E') {
        return Err(format!("$f payload must contain '.' or exponent: {s:?}"));
    }
    Ok(())
}

impl<'de> Deserialize<'de> for WireValue {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = WireValue;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a JSON value")
            }
            fn visit_unit<E: de::Error>(self) -> Result<WireValue, E> {
                Ok(WireValue::Null)
            }
            fn visit_none<E: de::Error>(self) -> Result<WireValue, E> {
                Ok(WireValue::Null)
            }
            fn visit_some<D: Deserializer<'de>>(self, d: D) -> Result<WireValue, D::Error> {
                WireValue::deserialize(d)
            }
            fn visit_bool<E: de::Error>(self, b: bool) -> Result<WireValue, E> {
                Ok(WireValue::Bool(b))
            }
            fn visit_i64<E: de::Error>(self, n: i64) -> Result<WireValue, E> {
                Ok(WireValue::Integer(n.to_string()))
            }
            fn visit_u64<E: de::Error>(self, n: u64) -> Result<WireValue, E> {
                Ok(WireValue::Integer(n.to_string()))
            }
            fn visit_f64<E: de::Error>(self, n: f64) -> Result<WireValue, E> {
                if !n.is_finite() {
                    return Err(E::custom("NaN / ±Infinity not allowed in Ktav"));
                }
                // Bare JSON floats get the ":f" wire form with a forced
                // decimal point so render's grammar check is satisfied.
                let mut s = format!("{n}");
                if !s.contains('.') && !s.contains('e') && !s.contains('E') {
                    s.push_str(".0");
                }
                Ok(WireValue::Float(s))
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<WireValue, E> {
                Ok(WireValue::String(v.to_string()))
            }
            fn visit_string<E: de::Error>(self, v: String) -> Result<WireValue, E> {
                Ok(WireValue::String(v))
            }
            fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<WireValue, A::Error> {
                let mut out = Vec::new();
                while let Some(item) = seq.next_element()? {
                    out.push(item);
                }
                Ok(WireValue::Array(out))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<WireValue, A::Error> {
                let Some(k1) = map.next_key::<String>()? else {
                    return Ok(WireValue::Object(IndexMap::new()));
                };
                let v1: WireValue = map.next_value()?;
                let second_key: Option<String> = map.next_key()?;

                if second_key.is_none() && (k1 == "$i" || k1 == "$f") {
                    let payload = match v1 {
                        WireValue::String(s) => s,
                        WireValue::Integer(s) => s,
                        WireValue::Float(s) => s,
                        _ => {
                            return Err(de::Error::custom(format!("{k1} payload must be a string")))
                        }
                    };
                    return Ok(if k1 == "$i" {
                        WireValue::Integer(payload)
                    } else {
                        WireValue::Float(payload)
                    });
                }

                let mut out: IndexMap<String, WireValue> = IndexMap::new();
                out.insert(k1, v1);
                if let Some(k2) = second_key {
                    let v2: WireValue = map.next_value()?;
                    out.insert(k2, v2);
                    while let Some((k, v)) = map.next_entry::<String, WireValue>()? {
                        out.insert(k, v);
                    }
                }
                Ok(WireValue::Object(out))
            }
        }

        d.deserialize_any(V)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Run one of the six output FFI functions over `src` and collect
    /// the three outcomes (rc, output bytes, error bytes).
    fn call(
        f: unsafe extern "C" fn(
            *const u8,
            usize,
            *mut *mut u8,
            *mut usize,
            *mut *mut c_char,
            *mut usize,
        ) -> c_int,
        src: &[u8],
    ) -> (c_int, Vec<u8>, Vec<u8>) {
        let mut out_buf: *mut u8 = ptr::null_mut();
        let mut out_len: usize = 0;
        let mut err_buf: *mut c_char = ptr::null_mut();
        let mut err_len: usize = 0;
        let rc = unsafe {
            f(
                src.as_ptr(),
                src.len(),
                &mut out_buf,
                &mut out_len,
                &mut err_buf,
                &mut err_len,
            )
        };
        let out = if out_buf.is_null() {
            Vec::new()
        } else {
            (unsafe { slice::from_raw_parts(out_buf, out_len) }).to_vec()
        };
        let err = if err_buf.is_null() {
            Vec::new()
        } else {
            (unsafe { slice::from_raw_parts(err_buf as *const u8, err_len) }).to_vec()
        };
        unsafe {
            ktav_free(out_buf, out_len);
            ktav_free(err_buf as *mut u8, err_len);
        }
        (rc, out, err)
    }

    fn envelope(text: &[u8]) -> Json {
        serde_json::from_slice(text).expect("error buffer is a JSON envelope")
    }

    #[test]
    fn format_preserves_comments_and_is_a_fixed_point() {
        let src = b"## leading comment
host: localhost


## mid comment
port: 8080
";
        let (rc, out, err) = call(ktav_format, src);
        assert_eq!(rc, 0, "err = {}", String::from_utf8_lossy(&err));
        let text = String::from_utf8(out).unwrap();
        assert!(text.contains("## leading comment"));
        assert!(text.contains("## mid comment"));

        let formatted = text.into_bytes();
        let (rc2, out2, err2) = call(ktav_format, &formatted);
        assert_eq!(rc2, 0, "err = {}", String::from_utf8_lossy(&err2));
        let (rc1, out1, _) = call(ktav_format, src);
        assert_eq!(rc1, 0);
        assert_eq!(out1, out2, "format must be a fixed point");
    }

    #[test]
    fn format_of_plain_doc_equals_emit_canonical_of_its_parse() {
        let src = b"a: 1
b: two
c: [x, y]
";
        let (rc, fmt_out, err) = call(ktav_format, src);
        assert_eq!(rc, 0, "err = {}", String::from_utf8_lossy(&err));

        let text = std::str::from_utf8(src).unwrap();
        let value = ktav::parse(text).unwrap();
        let wire = serde_json::to_vec(&value_to_json(&value)).unwrap();
        let (rc2, canon_out, err2) = call(ktav_emit_canonical, &wire);
        assert_eq!(rc2, 0, "err = {}", String::from_utf8_lossy(&err2));
        assert_eq!(fmt_out, canon_out);
    }

    #[test]
    fn parse_error_envelope_has_ten_fields_in_order() {
        let (rc, out, err) = call(
            ktav_loads, b"a: [
",
        );
        assert_eq!(rc, 1);
        assert!(out.is_empty());
        let env = envelope(&err);
        let obj = env.as_object().expect("envelope is an object");
        let keys: Vec<&str> = obj.keys().map(|k| k.as_str()).collect();
        assert_eq!(
            keys,
            [
                "error",
                "reason",
                "line",
                "line_text",
                "span",
                "path",
                "body",
                "canonical",
                "spec_section",
                "message"
            ]
        );
        assert!(obj["path"].is_null() || obj["path"].is_array());
    }

    #[test]
    fn invalid_utf8_envelope_names_the_invalid_utf8_class() {
        let mut src = b"ok: 1
"
        .to_vec();
        src.push(0x80);
        let (rc, out, err) = call(ktav_format, &src);
        assert_eq!(rc, 1);
        assert!(out.is_empty());
        let obj = envelope(&err).as_object().unwrap().clone();
        // OBSERVED (ktav 0.7.1): `from_error` names the class
        // "InvalidUtf8" (spec § 6.15) with an insertion-point span.
        assert_eq!(obj["error"], "InvalidUtf8");
        assert_eq!(obj["spec_section"], "§6.15");
    }

    #[test]
    fn dumps_over_scalar_is_enveloped_message() {
        let (rc, out, err) = call(ktav_dumps, b"42");
        assert_eq!(rc, 1);
        assert!(out.is_empty());
        let obj = envelope(&err);
        let obj = obj.as_object().unwrap();
        assert_eq!(obj["error"], "Message");
    }

    #[test]
    fn writer_refusal_carries_reason_code() {
        let (rc, out, err) = call(ktav_emit_canonical, br#"{"":{"$i":"1"}}"#);
        assert_eq!(rc, 1);
        assert!(out.is_empty());
        let obj = envelope(&err);
        let obj = obj.as_object().unwrap();
        assert_eq!(obj["error"], "UnrepresentableAt");
        assert_eq!(obj["reason"], "EmptyKeyName");
    }

    #[test]
    fn canonical_from_source_preserves_float_spellings_and_matches_wire_path() {
        // OBSERVED corpus spellings (numbers/float):
        // dot.canonical.ktav keeps `b: 1.0`; exponent.canonical.ktav
        // keeps `a: 1e9`.
        let src = b"a: 1.0\nb: 1e9\n";
        let (rc, out, err) = call(ktav_canonical_from_source, src);
        assert_eq!(rc, 0, "err = {}", String::from_utf8_lossy(&err));
        let text = String::from_utf8(out).unwrap();
        assert!(text.contains("a: 1.0"), "got: {text:?}");
        assert!(text.contains("b: 1e9"), "got: {text:?}");

        let text_in = std::str::from_utf8(src).unwrap();
        let value = ktav::parse(text_in).unwrap();
        let wire = serde_json::to_vec(&value_to_json(&value)).unwrap();
        let (rc2, wire_out, err2) = call(ktav_emit_canonical, &wire);
        assert_eq!(rc2, 0, "err = {}", String::from_utf8_lossy(&err2));
        assert_eq!(text.into_bytes(), wire_out);
    }

    #[test]
    fn canonical_from_source_strips_comments() {
        let (rc, out, err) = call(ktav_canonical_from_source, b"## c\na: 1\n");
        assert_eq!(rc, 0, "err = {}", String::from_utf8_lossy(&err));
        assert_eq!(out, b"a: 1\n".to_vec());
    }

    #[test]
    fn emit_canonical_success_smoke() {
        let (rc, out, err) = call(ktav_emit_canonical, br#"{"a":1}"#);
        assert_eq!(rc, 0, "err = {}", String::from_utf8_lossy(&err));
        assert!(!out.is_empty());
        assert_eq!(*out.last().unwrap(), b'\n');
    }
}
