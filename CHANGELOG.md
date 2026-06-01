# Changelog

**Languages:** **English** · [Русский](CHANGELOG.ru.md) · [简体中文](CHANGELOG.zh.md)

All notable changes to the JavaScript / TypeScript bindings are
documented here. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning is [Semantic Versioning](https://semver.org/) with the
pre-1.0 convention that a MINOR bump is breaking.

This changelog tracks **package releases**, not changes to the Ktav
format itself — for the latter see
[`ktav-lang/spec`](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md).

## 0.6.0 — 2026-06-01

Sync to Ktav 0.6.0 — keys now support escaping.

### Added

- Keys process the full §3.7 escape set, with two new escapes:
  - `\.` → `.` (literal dot — does **not** split a dotted path)
  - `\:` → `:` (literal colon — does **not** act as the key/value separator)
- Examples: `a\.b: v` → `{"a.b": "v"}`, `a\:b: v` → `{"a:b": "v"}`,
  `x.y\.z: v` → `{"x": {"y.z": "v"}}`.

### Breaking

- A literal backslash inside a key now requires `\\` (previously `\` in
  a key was a plain byte). Rare in practice; per pre-1.0 SemVer this is
  a MINOR bump.

### Changed

- Tracks ktav-rust 0.6.0 / Ktav spec 0.6.0. Binding source unchanged —
  the escape change is internal to the Rust core and transparent across
  the WASM / N-API / FFI boundaries.

---

## 0.5.0 — 2026-05-28

Tracks [`ktav 0.5.0`](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#050--2026-05-28)
and [spec 0.5.0](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md#050--2026-05-28).

### Added

- **`emitCanonical`** — new export on both the WASM and N-API paths;
  produces the normalised, round-trip-stable canonical representation
  defined by spec 0.5.0. Mirrors `ktav::emit_canonical` in the Rust
  crate.
- **Spec 0.5.0 conformance suite** — test runner now points at
  `spec/versions/0.5/tests` and exercises the full 0.5.0 fixture set.

### Changed

- **License** — dual-licensed `MIT OR Apache-2.0` (was `MIT`). Both
  `LICENSE-MIT` and `LICENSE-APACHE` are shipped in the npm package.
- Spec submodule updated to tag `v0.5.0` (commit `4d0a8aa`).

## 0.3.1 — 2026-05-10

Backward-compatible feature release tracking
[`ktav 0.3.1`](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#031--2026-05-10)
and [spec 0.1.1](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md#011--2026-05-10).

### Added

- **Top-level Array support** (spec § 5.0.1) — a document whose first
  content line has an array-item shape (bare scalar, `:: text`,
  `:i 42`, `:f 3.14`, lone `{` / `[`, or a multi-line opener `(` / `((`)
  now `loads` as a root-level JS `Array`. Previously the parser
  required an Object root and rejected such inputs as
  `MissingSeparator`. `dumps` accepts an Array at the top level too
  and renders it bare (item-per-line, no enclosing `[...]`).
  Empty / comments-only documents still default to an empty Object
  (preserves 0.3.0 behaviour). `KtavInput` is widened to
  `Record<string, unknown> | unknown[]`.
- **`stringifyForceStrings(value)`** — new exported function on every
  runtime entry (`node`, `web`, `bundler`, `/ffi` for Deno + Bun).
  Renders the JS value as a Ktav document with every scalar coerced
  to a String — typed integers (`:i`), typed floats (`:f`), booleans,
  and `null` are flattened to their textual form; compounds keep
  their structure. Round-trips back through `loads` as the same set
  of String scalars. Useful for "everything is a string" dumps for
  downstream consumers that don't understand the typed markers, or
  for diff-friendly canonical text. JS-idiomatic camelCase wrapper
  around the upstream `ktav::to_string_force_strings` Rust function.
- New cabi export `ktav_dumps_force_strings` with the same JSON-wire
  contract as `ktav_dumps`, drives the FFI subexports on Deno + Bun.

### Compatibility

Strictly additive. Every document valid under 0.3.0 stays valid
under 0.3.1 and produces the same JS value (still an Object). Only
inputs 0.3.0 rejected as `MissingSeparator` (bare-scalar first
lines) are now accepted as Arrays. `dumps` previously rejected
top-level arrays with "must be an object"; that error is gone.
Code that relied on the rejection should re-shape its input.

### Spec

- spec submodule synced to `0.1.1` (top-level Array fixtures added
  under `valid/top_level_array/` and `invalid/top_level/`).


## 0.3.0 — 2026-05-08

### Changed (breaking)

- **Picked up `ktav 0.3.0`** — `key: (value)` and `key: ((value))`
  now error with `ErrorKind::InlineNonEmptyCompound { body: "paren-string" }`
  rather than parsing as plain string scalars. These shapes were
  visually indistinguishable from multi-line openers and would
  confuse readers; the raw-marker form `key:: (value)` remains the
  canonical way to encode such literals. The `ktav-lsp` formatter
  auto-rewrites the legacy form on save. See the
  [`ktav` crate CHANGELOG](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#030--2026-05-08)
  for the full delta.

  The JS binding is a thin WASM / napi wrapper — no behaviour change
  beyond what `ktav` upstream produces. Inputs that previously parsed
  as `(value)` strings now throw a parse error; round-trip
  (`parse(stringify(v))` deep-equals `v`) is unchanged.

### Fixed

- **Diagnostic spans for `DuplicateKey` / `KeyPathConflict`** now
  point at the offending key rather than the closing `}` / `]` of the
  compound. Editors / IDEs consuming the binding's error messages
  underline the key location. This is a span-value fix from upstream;
  no API change.

### Spec

- spec submodule synced (paren-string handling tightened — fixtures
  for `inline_paren_string_double` / `inline_paren_string_single` added
  to invalid; `partial_parens` removed from valid).


## 0.2.0 — 2026-05-07

### Changed (breaking)

- **Picked up `ktav 0.2.0`** — multi-line strings now serialize in the
  indented stripped `( ... )` form by default (verbatim `(( ... ))`
  remains as fallback for content with leading whitespace or sole-`)`
  lines). `:f 42` now accepts integer literals and parses as `42.0`.
  See the
  [`ktav` crate CHANGELOG](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#020--2026-05-07)
  for the full spec / behaviour delta.

  The JS binding itself is a thin WASM / napi wrapper — no behaviour
  change beyond what `ktav` upstream produces. Code comparing
  `stringify()` output byte-for-byte to a baked-in `((...))` literal
  must be updated; round-trip (`parse(stringify(v))` deep-equals `v`)
  is unchanged.

### Spec

- spec submodule synced (typed_float_without_decimal fixture moved
  invalid → valid/typed_float_integer_body).


## 0.1.5 — 2026-05-03

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

- **CI/release workflows switched from `npm ci` to `npm install`.**
  Strict `npm ci` validation rejects the lockfile when
  `package.json` declares per-platform `optionalDependencies`
  (`@ktav-lang/js-<triple>`) at a version that does not yet exist
  on the npm registry — which is exactly the state at release-time
  when these packages are about to be built and published by the
  workflow's own matrix jobs. `npm install` reconciles
  `package.json` with the lockfile and proceeds. Trade-off:
  marginally slower (re-resolves a few entries) but eliminates the
  chicken-and-egg deadlock that has blocked every release attempt
  since 0.1.3.

npm: `ktav@0.1.5` (main) + `@ktav-lang/js-<triple>@0.1.5` (eight platform packages).

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
