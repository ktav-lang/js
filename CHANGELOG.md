# Changelog

**Languages:** **English** · [Русский](CHANGELOG.ru.md) · [简体中文](CHANGELOG.zh.md)

All notable changes to the JavaScript / TypeScript bindings are
documented here. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning is [Semantic Versioning](https://semver.org/) with the
pre-1.0 convention that a MINOR bump is breaking.

This changelog tracks **package releases**, not changes to the Ktav
format itself — for the latter see
[`ktav-lang/spec`](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md).

## 0.1.0 — first public release

The initial release. Targets **Ktav format 0.1**.

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
