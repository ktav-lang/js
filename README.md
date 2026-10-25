# ktav (JavaScript / TypeScript)

[![npm](https://img.shields.io/npm/v/%40ktav-lang%2Fktav?style=flat-square&logo=npm&label=npm)](https://www.npmjs.com/package/@ktav-lang/ktav)
[![CI](https://img.shields.io/github/actions/workflow/status/ktav-lang/js/ci.yml?style=flat-square&logo=github&label=CI)](https://github.com/ktav-lang/js/actions)
![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue?style=flat-square)
[![Playground](https://img.shields.io/badge/playground-try%20online-7c3aed?style=flat-square&logo=rocket&logoColor=white)](https://ktav-lang.github.io/)

> Universal JS/TS bindings for [Ktav](https://github.com/ktav-lang/spec) —
> a plain configuration format. JSON-shape, no required quotes, no commas, dotted
> keys. Powered by Rust under the hood, shipped as native N-API for Node
> and Bun, WebAssembly for Deno, browsers, and bundlers.

**Languages:** **English** · [Русский](docs/ru/README.ru.md) · [简体中文](docs/zh/README.zh.md)

**Playground:** convert JSON / YAML / TOML / INI ⇄ Ktav in your browser at **[ktav-lang.github.io](https://ktav-lang.github.io/)**.

**Specification:** this package implements **Ktav**. The format is
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
matches the current host through `optionalDependencies`. These eight
optional `@ktav-lang/js-*` packages are this project’s own platform
binary artifacts, not third-party runtime dependencies. If nothing
matches, the default native loader throws early with a clear diagnostic.

For a Node consumer that explicitly imports only `@ktav-lang/ktav/pure`,
installation can omit optional packages:

```sh
npm install --omit=optional @ktav-lang/ktav
```

The root package has no third-party runtime dependencies. Build, test,
and documentation tools are development-only. See [Pure TypeScript
backend](#pure-typescript-backend) for the `/pure` import and runtime
requirements.

## Pure TypeScript backend

`@ktav-lang/ktav/pure` is a complete Ktav parser and generator for Node, Bun, Deno, and browsers. It uses package ESM and JavaScript globals only (`TextEncoder`, `TextDecoder`, `JSON`, `BigInt`). No third-party runtime dependencies, native binaries, WASM, FFI, subprocess, network access, or fallback.

The eight optional `@ktav-lang/js-*` packages are our native binaries for the default entry; `/pure` does not resolve or load them. Build, test, and documentation tools are development-only. The default entry remains backend-specific; select `/pure` explicitly. For Node, install without optional native packages: `npm install --omit=optional @ktav-lang/ktav`.

```ts
import { loads, dumps } from "@ktav-lang/ktav/pure";

const cfg = loads(`service: web\nport: 8080\n`);
console.log(dumps(cfg));
```

For a browser without runtime network access, serve a prebundled ESM artifact and its local modules with the app; this example does not load a CDN:

```html
<script type="module">
  import { loads, dumps } from "./assets/ktav-pure.js";
  document.body.textContent = dumps(loads("hello: world"));
</script>
```

The API includes `loadsBytes()`, all parser/generator operations, and the comment-preserving formatter. Integers within ±2^53 arrive as `number`, larger ones as `BigInt`. JS `number` cannot preserve Ktav's Integer/Float distinction through object emission; use `canonicalFromSource()` for byte-exact canonical text from source. Installing, building, or distributing the package files may require network access; the pure parser and writer do not use the network at runtime.

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
port: 8080
ratio: 0.75
tls: true
tags: [
    prod
    eu-west-1
]
db.host: primary.internal
db.timeout: 30
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
// port: 8443
// tls: true
// ratio: 0.95
// upstreams: [
//     { host: a.example  port: 1080 }
//     { host: b.example  port: 1080 }
// ]
// notes: null
```

A complete runnable Node example lives in [`examples/node/index.mjs`](examples/node/index.mjs).

### Format — comment-preserving formatter

```ts
import { format } from "@ktav-lang/ktav";

format(`
port: 8080

## the port

host: localhost
`);
// port: 8080
//
// ## the port
//
// host: localhost
```

`format` guarantees: every comment is preserved verbatim; runs of
blank lines collapse to exactly one; key order is never changed; it is
a fixed point (`format(format(x)) === format(x)`); and its output
equals the canonical writer's exactly when the document has no
comments and no blank lines.

### WASM consumers (Deno, browser)

Call `ready()` once before the first `loads` / `dumps` — the wasm
target defers instantiation:

```ts
import { ready, loads } from "@ktav-lang/ktav";
await ready();
loads("port: 8080\n");
```

Node / Bun consumers skip this — the native binary is loaded at import
time.

### Native FFI subexport (Deno, Bun) — `@ktav-lang/ktav/ffi`

For Deno users who want native speed without the WASM tax — and for
Bun users who prefer `bun:ffi` over the N-API path — there's an
opt-in subexport that talks directly to the C ABI shared library
(`ktav_cabi`, the same binary used by the Java / Go / .NET bindings):

```ts
import { loads, loadsStrict, dumps } from "@ktav-lang/ktav/ffi";

// loads / dumps are ASYNC here (waiting on dlopen on first call)
const cfg = await loads("port: 8080\n");
await loadsStrict("port: 8080\n");
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
function loadsStrict<T = KtavValue>(s: string): T;
function dumps<T extends KtavInput = KtavInput>(obj: T): string;
function stringifyForceStrings<T extends KtavInput = KtavInput>(obj: T): string;
function format(s: string): string;
function canonicalFromSource(s: string): string;
function emitCanonical<T extends KtavInput = KtavInput>(obj: T): string;
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;

// web / Deno / browser only; Node + Bun ignore it
function ready(input?: URL | Response | ArrayBuffer): Promise<void>;
```

`loadsStrict` applies canonical-scalar validation and rejects lossy
spellings while accepting forms emitted by the canonical writer.

`stringifyForceStrings` renders like `dumps` but flattens every leaf
scalar — integer, float, boolean, `null` — to its textual form via the
raw marker (`::`). Compounds keep their structure, and the result parses
back through `loads` as the same set of String scalars.

> **Unreleased (0.9 preparation):** These editing APIs and updated diagnostics are not included in published 0.8.1 packages. Native backends require the pinned 0.9 core (C ABI 2 for C-FFI); pure backends remain standalone.

## Source editing (spec 0.9)

Two operations replace a value **inside an existing document** by
splicing the source text — the document is never re-serialized, so
comments, whitespace, key spelling and order, the BOM, and the CR / LF /
CRLF style (and the presence or absence of the final newline) survive
byte-for-byte outside the effective edit:

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
```

- **Only replacement of an existing value.** There is no create,
  remove, or rename. A missing key, a descent through a scalar, an
  out-of-bounds or non-numeric array index, or an empty segments list
  throw `EditNotFound`.
- **Paths.** `textualPath` is the dotted form `key1.key2.0.key4`;
  inside a segment `\.` is a literal dot and `\\` a literal backslash;
  any other escape, a trailing lone backslash, or an empty segment
  throws `EditInvalidPath` with `body` set to the decimal **UTF-8 byte
  offset** in the path argument where the problem was detected.
  `editValueSegments` takes already-decoded literal segments with no
  extra unescaping. A numeric segment addresses a string key inside an
  Object and a zero-based ASCII-digits index inside an Array (leading
  zeros allowed, signs are not indexes).
- **Errors** are the usual ten-field envelope with
  `error === "EditInvalidPath" | "EditNotFound" | "EditUnsupported"`;
  all location fields are null (an edit failure is not a parse error).
  `EditUnsupported.body` carries the reason: a noncontiguous
  (dotted-key / reopen) whole target, structural replacement that would
  erase interior comment lines, or a multiline string containing a line
  `))` — no lossless form exists.
- **Guarantees.** A byte-identical replacement is a byte-identical
  no-op even for noncanonical spelling. Every successful patch is
  re-parsed and semantically verified: exactly the target replaced, the
  rest of the tree equal. An invalid SOURCE throws the parser's own
  envelope, not an edit error.
- **Layout.** Dotted, inline and block forms are preserved, including
  whole inline containers and emptied (but not collapsed) block
  containers. Inline wrappers expand minimally when a multiline string
  arrives, when the line grows past `max(100 Unicode scalars, its
  previous length)`, or when a replacement needs ≥ 4 escapes with ≥ 25 %
  overhead — only along the touched branch, never for untouched
  siblings. Replacement is a JS value; `bigint` and integral `number`
  keep the exact Integer wire form, non-integral `number` becomes a
  Float.

Available on every backend: `@ktav-lang/ktav` (N-API), `/wasm`,
`/pure`, and the `/ffi` subexports (Bun / Deno, asynchronous). Native
binaries predating the 0.9 core report a clear unsupported-version
error instead of a silent fallback.

Three functions produce canonical output and they are not
interchangeable:

| | input | comments | scalar spelling |
| --- | --- | --- | --- |
| `format(s)` | source text | **kept** | preserved |
| `canonicalFromSource(s)` | source text | dropped | preserved |
| `emitCanonical(obj)` | a JS value | none to keep | may change |

`canonicalFromSource` is text in, canonical text out, with no JavaScript
value in between — so `1.0`, `1e9` and `-0.0` survive byte-exactly.
`emitCanonical` cannot promise that: a JS `number` cannot express Ktav's
Integer/Float distinction, so `1.0` arrives indistinguishable from `1`.
Use `emitCanonical` when you have a value, `canonicalFromSource` when
you have a document.

The generic parameter on `loads` is an **unchecked cast** — use it when
you know the shape for IDE autocomplete. Pass nothing for the
structural `KtavValue` type.

## Errors

Every error thrown by the bindings is a typed `KtavError` carrying the
ten fields of `ktav::ErrorEnvelope`: `error` (class, e.g.
`"UnclosedCompound"`), `reason` (stable writer-time code), `line`,
`line_text`, `span` (`{start, end}` — **byte** offsets into the UTF-8
source, not UTF-16 indices), `path` (array of exact decoded key
segments, never a joined string), `body`, `canonical`, `spec_section`,
and `message`. The message is taken verbatim, never reassembled from
the other fields, and never contains raw JSON. Fields a particular
error doesn't carry are `null`.

```ts
import { loads } from "@ktav-lang/ktav";

try {
  loads("a: [");
} catch (e) {
  e.name;          // "KtavError"
  e.error;         // "UnclosedCompound"
  e.line_text;     // "a: ["
  e.span;          // { start: 3, end: 4 } — UTF-8 byte offsets
  e.spec_section;  // "§6.1"
  e.message;       // "Syntax error: Unclosed array at end of input"
}
```

## Type mapping

| Ktav             | JavaScript                                |
|------------------|-------------------------------------------|
| `null`           | `null`                                    |
| `true` / `false` | `boolean`                                 |
| bare integer     | `number` (safe range) / `bigint` (larger) |
| bare decimal     | `number`                                  |
| other scalar     | `string`                                  |
| `[ ... ]`        | `Array`                                   |
| `{ ... }`        | plain object (insertion-ordered)          |

Ktav types numbers by **lexical form** — a bare `port: 8080` is a
`number`, `ratio: 0.5` a float, and anything that isn't a bare number
stays a `string`. Force a numeric-looking value to stay a string with
`::` (`zip:: 01007`).

On encode, `Number.isInteger(x)` decides integer vs decimal output;
`bigint` always encodes as a bare integer. `NaN` and `±Infinity` are
rejected — Ktav does not represent them.

## Key escaping

Bare key segments can escape structural characters with a backslash.
For keys that need spaces, quotes, or other characters that are awkward
in bare form, quote an individual segment with `"..."`, `'...'`, or
`` `...` ``. Quoted segments support escapes such as `\uXXXX` for a
Unicode code point (spec 0.8.0, § 3.7.1):

```text
"service name": web
"a.b".child: v
"caf\u00E9": yes
```

A literal `.` or `:` in a bare segment is escaped as `\.` or `\:`;
a literal backslash is `\\`. A dot between segments remains the path
separator.

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

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for the dev setup, the runtime
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
