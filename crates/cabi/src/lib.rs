//! Thin C ABI wrapper around the `ktav` Rust crate, consumed via FFI by
//! the Deno and Bun subexports of `@ktav-lang/ktav`.
//!
//! The crate's entire body is a single [`ktav::declare_cabi!`] macro
//! invocation (ktav's `cabi` feature): the macro expands, in *this*
//! crate, every exported `#[no_mangle] extern "C"` symbol the previous
//! handwritten shim defined — `ktav_loads`, `ktav_loads_strict`,
//! `ktav_dumps`, `ktav_dumps_force_strings`, `ktav_emit_canonical`,
//! `ktav_format`, `ktav_canonical_from_source`, `ktav_free`,
//! `ktav_version` — plus `ktav_abi_version`, and, since the source-edit
//! 0.9 core, `ktav_edit_value` / `ktav_edit_value_segments` (same
//! 0/1 return contract; `path` is the UTF-8 textual dotted path,
//! respectively a UTF-8 JSON array of literal segments; `replacement`
//! is the tagged-numeric wire JSON; the output buffer carries the
//! patched UTF-8 Ktav SOURCE bytes, not a JSON document). The addition
//! of symbols bumps `ktav_abi_version` to 2 — old binaries must report
//! a clear unsupported/version error, never a silent pure fallback.
//! Same signatures, same
//! `ktav_free(ptr, len)` ownership contract, same `0`/`1` return codes,
//! same ten-field JSON error envelope. The JSON wire format (tagged
//! `{"$i": ...}` / `{"$f": ...}` scalars, order-preserving objects) and
//! the error-envelope encoding are owned by the `ktav` crate's `cabi`
//! module and documented there.

//! The pinned ABI also exports insert/remove/rename operations, each with
//! textual-path and literal-segments variants.
ktav::declare_cabi!();
