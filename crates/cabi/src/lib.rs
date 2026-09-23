//! Thin C ABI wrapper around the `ktav` Rust crate, consumed via FFI by
//! the Deno and Bun subexports of `@ktav-lang/ktav`.
//!
//! The crate's entire body is a single [`ktav::declare_cabi!`] macro
//! invocation (ktav's `cabi` feature): the macro expands, in *this*
//! crate, every exported `#[no_mangle] extern "C"` symbol the previous
//! handwritten shim defined — `ktav_loads`, `ktav_loads_strict`,
//! `ktav_dumps`, `ktav_dumps_force_strings`, `ktav_emit_canonical`,
//! `ktav_format`, `ktav_canonical_from_source`, `ktav_free`,
//! `ktav_version` — plus `ktav_abi_version`. Same signatures, same
//! `ktav_free(ptr, len)` ownership contract, same `0`/`1` return codes,
//! same ten-field JSON error envelope. The JSON wire format (tagged
//! `{"$i": ...}` / `{"$f": ...}` scalars, order-preserving objects) and
//! the error-envelope encoding are owned by the `ktav` crate's `cabi`
//! module and documented there.

ktav::declare_cabi!();
