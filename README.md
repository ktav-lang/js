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

MIT. See [LICENSE](LICENSE).
