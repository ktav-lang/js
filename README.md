# ktav (JavaScript / TypeScript)

> Universal JS/TS bindings for [Ktav](https://github.com/ktav-lang/spec) —
> a plain configuration format. JSON-shape, no quotes, no commas, dotted
> keys. Powered by Rust under the hood, shipped as native N-API for Node
> and Bun, WebAssembly for Deno, browsers, and bundlers.

**Languages:** **English** · [Русский](README.ru.md) · [简体中文](README.zh.md)

**Specification:** this package implements **Ktav 0.1**. The format is
versioned and maintained independently of this package — see
[`ktav-lang/spec`](https://github.com/ktav-lang/spec) for the formal
document.

---

## Install

```bash
npm install @ktav-lang/ktav
```

> **Naming note:** the bare `ktav` name is blocked on npm's similarity
> filter (too close to `koa`, `keyv`, `klaw`, …), so the package ships
> under the `@ktav-lang` scope. Rust (`ktav` on crates.io) and Python
> (`ktav` on PyPI) keep the short form.

One package serves every target runtime:

| Runtime          | Backend  | How it's loaded                          |
|------------------|----------|------------------------------------------|
| Node ≥ 18, Bun   | N-API    | Platform-specific `.node` via optional dep |
| Deno, browser    | WASM     | `web` target, consumer awaits `ready()`  |
| Webpack / Vite / Rollup / esbuild | WASM | `bundler` target, bundler resolves `.wasm` |

Native binaries are prebuilt for Linux (x64/arm64, glibc + musl),
macOS (x64/arm64), and Windows (x64/arm64); npm installs the one that
matches the current host through `optionalDependencies`. If nothing
matches, the loader throws early with a clear diagnostic.

## Quick start

### Parse — typed reads off the parsed object

```ts
import { loads, dumps } from "@ktav-lang/ktav";

interface DB { host: string; timeout: number; }
interface Config {
  service: string;
  port:    number;
  ratio:   number;
  tls:     boolean;
  tags:    string[];
  db:      DB;
}

const cfg = loads<Config>(`
service: web
port:i 8080
ratio:f 0.75
tls: true
tags: [
    prod
    eu-west-1
]
db.host: primary.internal
db.timeout:i 30
`);

cfg.port;        // 8080 — typed as number
cfg.db.timeout;  // 30
```

### Build & render — construct a document in code

```ts
const doc = {
  name:  "frontend",
  port:  8443,
  tls:   true,
  ratio: 0.95,
  upstreams: [
    { host: "a.example", port: 1080 },
    { host: "b.example", port: 1080 },
  ],
  notes: null,
};
const text = dumps(doc);
// name: frontend
// port:i 8443
// tls: true
// ratio:f 0.95
// upstreams: [
//     { host: a.example  port:i 1080 }
//     { host: b.example  port:i 1080 }
// ]
// notes: null
```

A complete runnable Node example lives in [`examples/node/index.mjs`](examples/node/index.mjs).

### WASM consumers (Deno, browser)

Call `ready()` once before the first `loads` / `dumps` — the wasm
target defers instantiation:

```ts
import { ready, loads } from "@ktav-lang/ktav";
await ready();
loads("port:i 8080\n");
```

Node / Bun consumers skip this — the native binary is loaded at import
time.

### Native FFI subexport (Deno, Bun) — `@ktav-lang/ktav/ffi`

For Deno users who want native speed without the WASM tax — and for
Bun users who prefer `bun:ffi` over the N-API path — there's an
opt-in subexport that talks directly to the C ABI shared library
(`ktav_cabi`, the same binary used by the Java / Go / .NET bindings):

```ts
import { loads, dumps } from "@ktav-lang/ktav/ffi";

// loads / dumps are ASYNC here (waiting on dlopen on first call)
const cfg = await loads("port:i 8080\n");
const text = await dumps({ port: 8443 });
```

| Runtime  | Mechanism          | Permission flag                                                             |
|----------|--------------------|-----------------------------------------------------------------------------|
| Deno     | `Deno.dlopen`      | `--allow-ffi=<path-to-libktav_cabi>` (or `--allow-ffi` for any FFI target)  |
| Bun      | `bun:ffi`          | none — Bun trusts FFI                                                       |
| Node     | n/a                | throws — use the default import (already N-API native)                      |
| Browser  | n/a                | throws — use `@ktav-lang/ktav/wasm` instead                                 |

The library file ships in the matching `@ktav-lang/js-<rid>`
optional dependency (same one that holds the `.node` binary), so
`npm install @ktav-lang/ktav` is enough — no separate download.
Override with `KTAV_LIB_PATH` for local cabi builds.

Trade-off: ~3–5× faster than WASM on parse / dump of large
documents; requires a permission grant on Deno; loses Deno's
"works in any sandbox" property. Stick with the default import
unless you've measured a need.

Runnable examples: [`examples/deno/ffi.ts`](examples/deno/ffi.ts),
[`examples/bun/ffi.ts`](examples/bun/ffi.ts).

## Public API

```ts
function loads<T = KtavValue>(s: string): T;
function dumps<T extends KtavInput = KtavInput>(obj: T): string;

// web / Deno / browser only; Node + Bun ignore it
function ready(input?: URL | Response | ArrayBuffer): Promise<void>;
```

The generic parameter on `loads` is an **unchecked cast** — use it when
you know the shape for IDE autocomplete. Pass nothing for the
structural `KtavValue` type.

## Type mapping

| Ktav             | JavaScript                                |
|------------------|-------------------------------------------|
| `null`           | `null`                                    |
| `true` / `false` | `boolean`                                 |
| `:i <digits>`    | `number` (safe range) / `bigint` (larger) |
| `:f <number>`    | `number`                                  |
| bare scalar      | `string`                                  |
| `[ ... ]`        | `Array`                                   |
| `{ ... }`        | plain object (insertion-ordered)          |

Ktav keeps **"no magic types"** — a bare `port: 8080` stays a string at
the parser level. Use the typed markers `:i` / `:f` when you want
numbers, or coerce at the application layer.

On encode, `Number.isInteger(x)` decides `:i` vs `:f`; `bigint` always
encodes as `:i`. `NaN` and `±Infinity` are rejected — Ktav 0.1.0 does
not represent them.

## Key escaping

Since spec 0.6.0 a literal `.` or `:` inside a key segment is written
with a backslash:

```text
a\.b: v        // key is the single segment "a.b" → { "a.b": "v" }
a\:b: v        // key contains a colon            → { "a:b": "v" }
x.y\.z: v      // split on the first dot only     → { "x": { "y.z": "v" } }
```

A literal backslash in a key is `\\`.

## Single-file browser build

`dist/wasm/web/ktav.inline.js` is a variant with the WASM binary
base64-embedded — drop it into any `<script type="module">` without a
sibling `.wasm` file and without any HTTP server. Works over `file://`.

```html
<script type="module">
    import init, { loads, dumps } from "https://unpkg.com/ktav/dist/wasm/web/ktav.inline.js";
    await init();
    console.log(loads("hello: world\n"));
</script>
```

Trade-off: ≈ 35 % bigger uncompressed, ≈ 5 % after gzip — base64
compresses well against the wasm's near-random bytes.

## Philosophy

Ktav is intentionally small. Its five design principles
(from [`spec/CONTRIBUTING.md`](https://github.com/ktav-lang/spec/blob/main/CONTRIBUTING.md)):

1. **Locality** — a line's meaning does not depend on another line.
2. **One sentence** — any new rule fits in one sentence of the spec.
3. **No whitespace sensitivity** (line breaks aside).
4. **No magic types** — the format never decides `"8080"` means a number.
5. **Explicit over clever** — `::` is verbose on purpose.

These bindings honour that: no schema inference, no auto-casting, no
defaulting. If you want typing, do it at the boundary with your own
tool (Zod, io-ts, hand-written validators) against the native
structures this library returns.

## Related projects

- [`ktav-lang/spec`](https://github.com/ktav-lang/spec) — canonical
  format specification and language-agnostic conformance test suite.
- [`ktav-lang/rust`](https://github.com/ktav-lang/rust) — reference Rust
  implementation. The N-API crate and the WASM crate both wrap it.
- [`ktav-lang/python`](https://github.com/ktav-lang/python) — Python
  bindings (PyO3) over the same crate.

## Versioning

Follows [Semantic Versioning](https://semver.org/) with the pre-1.0
convention that a MINOR bump is breaking. Package version and the
`ktav` crate version move together.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup, the runtime
test matrix, and the contribution workflow.

## Support the project

The author has many ideas that could be broadly useful to IT worldwide —
not limited to Ktav. Realizing them requires funding. If you'd like to
help, please reach out at **phpcraftdream@gmail.com**.

## License

MIT OR Apache-2.0. See [LICENSE-MIT](LICENSE-MIT) and [LICENSE-APACHE](LICENSE-APACHE).

## Other Ktav implementations

- [`spec`](https://github.com/ktav-lang/spec) — specification + conformance suite
- [`rust`](https://github.com/ktav-lang/rust) — reference Rust crate (`cargo add ktav`)
- [`csharp`](https://github.com/ktav-lang/csharp) — C# / .NET (`dotnet add package Ktav`)
- [`golang`](https://github.com/ktav-lang/golang) — Go (`go get github.com/ktav-lang/golang`)
- [`java`](https://github.com/ktav-lang/java) — Java / JVM (`io.github.ktav-lang:ktav` on Maven Central)
- [`php`](https://github.com/ktav-lang/php) — PHP (`composer require ktav-lang/ktav`)
- [`python`](https://github.com/ktav-lang/python) — Python (`pip install ktav`)
