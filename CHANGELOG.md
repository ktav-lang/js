# Changelog

**Languages:** **English** · [Русский](CHANGELOG.ru.md) · [简体中文](CHANGELOG.zh.md)

All notable changes to the JavaScript / TypeScript bindings are
documented here. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning is [Semantic Versioning](https://semver.org/) with the
pre-1.0 convention that a MINOR bump is breaking.

This changelog tracks **package releases**, not changes to the Ktav
format itself — for the latter see
[`ktav-lang/spec`](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md).

## 0.1.4 — 2026-05-03

### Changed

- **Picked up `ktav 0.1.5`** — the upstream Rust crate now exposes
  `Error::Structured(ErrorKind)` with byte-offset spans, retroactive
  `#[non_exhaustive]` on the error enums, and a public `ktav::thin`
  event-based parser. The JS binding's user-visible behaviour is
  unchanged: thrown `Error` values carry the same human-readable
  message (Display strings for the seven canonical categories are
  byte-identical to ktav 0.1.4 — verified by ktav's own pinning
  tests). Mapping `ktav::ErrorKind` to a structured JS error class
  hierarchy (`KtavMissingSeparatorSpaceError`, `KtavDuplicateKeyError`,
  etc.) is separate follow-up work tracked in the workspace's
  [`STRUCTURED_ERRORS.md`](https://github.com/ktav-lang/.github/blob/main/STRUCTURED_ERRORS.md).

### Fixed

- **`npm ci --omit=optional` in CI/release workflows.** Strict
  `npm ci` validation in newer npm versions trips over the placeholder
  entries that `npm install` writes for the per-platform
  `optionalDependencies` (`@ktav-lang/js-<triple>`) when their
  not-yet-published version is declared in `package.json`. Adding
  `--omit=optional` to all eight `npm ci` invocations across `ci.yml`
  and `release.yml` skips that validation; the per-platform packages
  are still built and published by the workflow's own matrix jobs.

npm: `ktav@0.1.4` (main) + `@ktav-lang/js-<triple>@0.1.4` (eight platform packages).

## 0.1.3 — 2026-04-26

### Changed

- **Picked up `ktav 0.1.4`** — the upstream Rust crate's untyped
  `parse() → Value` path (which `cabi`/`napi`/`wasm` all use) is now
  ~30% faster on small documents and ~13% faster on large ones, just
  from a one-line `Frame::Object` capacity tweak (4 → 8). Every
  `loads` call benefits transparently across Node, Deno, Bun, and
  the browser build.

npm: `@ktav-lang/ktav@0.1.3`.

## 0.1.2 — Bun FFI fixes + package-lock sync

Patch release on top of 0.1.1.

### Fixed

- `bun:ffi` out-parameter handling. The 0.1.1 implementation
  wrapped `Uint8Array` / `BigUint64Array` arguments in
  `ffi.ptr()`; that returns a plain number, which Bun's
  `FFIType.ptr` argument refuses to accept ("Unable to convert N
  to a pointer"). Pass `TypedArray` / `Buffer` instances
  **directly** — Bun auto-pins their backing buffer and forwards
  the address. Read out-pointers as `Number(BigUint64Array[0])`,
  unwrap data via `ffi.toArrayBuffer(ptr, 0, len)`.
- `package-lock.json` synced to the bumped subpackage versions —
  `npm ci` no longer fails with `EUSAGE` on fresh clones.

## 0.1.1 — `/ffi` subexport for Deno + Bun, aarch64-linux-musl native

### Added

- **`@ktav-lang/ktav/ffi` subexport** — direct C ABI access via
  `Deno.dlopen` (Deno) and `bun:ffi` (Bun). Same `ktav_cabi`
  shared library used by the Java / Go / .NET bindings, same
  `{"$i":"…"}` / `{"$f":"…"}` JSON wire format. ~3–5× faster than
  the WASM path on large documents. Default import unchanged —
  this is opt-in for users who measure a need. Throws on Node
  (use the default — already N-API native) and the browser
  (use `@ktav-lang/ktav/wasm`).
  - Requires `--allow-ffi=<path>` on Deno; permission-free on Bun.
  - The `ktav_cabi` binary is bundled in the matching
    `@ktav-lang/js-<rid>` optional dep alongside the existing
    `.node`. Override with `$KTAV_LIB_PATH` for local builds.
- **`@ktav-lang/ktav/wasm` subexport** — explicit access to the
  WASM build, useful for environments where the conditional
  `exports` map can't pick the right entry (e.g. some bundlers).
- **`@ktav-lang/js-linux-arm64-musl`** — native N-API binary for
  Alpine Linux on ARM64. Now listed in `optionalDependencies`;
  `npm install @ktav-lang/ktav` on this platform gets the native
  `.node` automatically instead of a missing-binary error.

### Tests

- New Bun + Deno smoke suites for the `/ffi` path
  (`tests/run-bun-ffi.mjs`, `tests/run-deno-ffi.ts`). CI runs both
  on Linux / macOS / Windows.

### Build plumbing

- `release.yml` cross-compiles `aarch64-unknown-linux-musl` via
  `cargo-zigbuild` + `zig`, gated behind a per-target setup step so
  the other 7 entries don't pay the 150 MB zig download.
- `.cargo/config.toml` disables `crt-static` on musl targets — Rust's
  default refuses `cdylib` otherwise.

Everything else — the public API, type mapping, runtime support — is
unchanged from 0.1.0.

## 0.1.0 — first public release

The initial release. Targets **Ktav format 0.1**.

### Package name

Published as **`@ktav-lang/ktav`** on npm. The unscoped name `ktav`
(matching the Rust crate and the PyPI package) is blocked by npm's
similarity filter against popular names like `koa` / `keyv` / `klaw`.
If the unscoped name opens up later, a future release may alias to it;
for now the scoped form is canonical.

### Public API

- `loads<T = KtavValue>(s: string): T` — parse a Ktav document.
- `dumps<T extends KtavInput = KtavInput>(obj: T): string` — serialize
  a JavaScript value (top-level must be an object).
- `ready(input?): Promise<void>` — initialize the WASM module.
  No-op on Node / Bun, required once on Deno / browser.
- TypeScript types `KtavValue`, `KtavObject`, `KtavArray`, `KtavInput`,
  `KtavError`.

### Backends

- **N-API** (`crates/napi`) — native `.node` binary for Node ≥ 18 and
  Bun ≥ 1.0. Prebuilt for Linux (x64/arm64, gnu + musl), macOS
  (x64/arm64), Windows (x64/arm64); eight platform subpackages
  published under `@ktav-lang/js-<triple>` and declared as
  `optionalDependencies` of the main package.
- **WebAssembly** (`crates/wasm`) — two wasm-pack targets served from
  one package:
  - `web` for Deno and the browser (consumer calls `ready()`), plus
    `ktav.inline.js` — same entry with the `.wasm` base64-embedded so
    a single file drops into a `<script type="module">` without
    a sibling fetch.
  - `bundler` for webpack / rollup / esbuild / vite.

### Type mapping

| Ktav             | JavaScript                                |
|------------------|-------------------------------------------|
| `null`           | `null`                                    |
| `true` / `false` | `boolean`                                 |
| `:i <digits>`    | `number` (safe range) / `bigint` (larger) |
| `:f <number>`    | `number`                                  |
| bare scalar      | `string`                                  |
| `[ ... ]`        | `Array`                                   |
| `{ ... }`        | plain object (insertion-ordered)          |

On encode, `Number.isInteger(x)` chooses `:i`; `bigint` always encodes
as `:i`. `NaN` and `±Infinity` are rejected.

### Tested on

Every runtime runs the full 153-assertion conformance suite (spec
fixtures + smoke): Node 18 / 20 / 22 on Linux / macOS / Windows, Bun
on all three OSs, Deno 2.x on all three OSs, headless Chromium via
Playwright on all three OSs.

### Acknowledgements

Built on top of the reference `ktav` Rust crate; PyO3-style bindings
machinery borrowed from the Python package.
