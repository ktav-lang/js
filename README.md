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

Edits splice source text, never re-serialize it. Outside the edit they preserve bytes, comments, whitespace, key spelling/order, BOM, EOL style and final-EOL presence.

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function insertValue(source: string, textualPath: string, replacement: KtavValue): string;
function insertValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function removeValue(source: string, textualPath: string): string;
function removeValueSegments(source: string, segments: readonly string[]): string;
function renameKey(source: string, textualPath: string, newKey: string): string;
function renameKeySegments(source: string, segments: readonly string[], newKey: string): string;
```

Bun/Deno FFI returns `Promise<string>`; the signatures above are synchronous exports.

- Paths use `.` as a separator; `\.` encodes a literal dot and `\\` a literal backslash. Other escapes, a trailing backslash, an empty path or empty segment produce `EditInvalidPath`; `body` is the UTF-8 byte offset in the path. Segment APIs take decoded strings. A numeric Object segment is a key; an Array index uses ASCII digits, allows leading zeros, and disallows signs.

- `editValue` replaces an existing value; missing keys, scalar descent, invalid indexes and empty segments lists are `EditNotFound`. `insertValue` adds only a new final key to an existing Object (`EditAlreadyExists` on collision); it does not create intermediate parents or insert into Arrays. `removeValue` removes a leaf, subtree or Array item; empty ancestors remain. `renameKey` renames an Object key using the literal `newKey`, preserving order and value; renaming to the same name is byte-identical, and a collision is `EditAlreadyExists`. Removing comments inside a container is unsupported.

- Failures use the ten-field edit envelope:
  `EditInvalidPath`, `EditNotFound`, `EditAlreadyExists` or
  `EditUnsupported`; location fields are null. Invalid source
  uses the parser envelope. `EditUnsupported.body` gives the
  reason: a noncontiguous whole target (dotted/reopened),
  erased interior comments, or no lossless representation
  in context.
- Byte-identical replacement is a no-op, even for
  noncanonical spelling. Successful patches are reparsed
  and verified against the intended semantic tree; only
  the target changes. Untouched siblings are not expanded.
  Failed calls return no partial patch and do not change
  source.
- Dotted, inline and block layouts are preserved; empty
  block containers are not collapsed. Inline ancestors
  expand minimally for multiline replacement, growth past
  `max(100, original line length)`, or an individual string
  needing at least 4 escapes and at least 25% encoding
  overhead. Width is Unicode scalars; expansion affects
  the touched branch only. `bigint` and integral `number`
  retain Integer form; non-integral numbers become Float.
- APIs are available on N-API, WASM, pure and FFI
  backends. Old native binaries report unsupported-version
  errors.

### Source-edit cookbook

These examples describe the unreleased 0.9 API, not the published 0.8.1 package. They replace existing values only: keys are not renamed, missing paths are not created, and entries are not removed. Each snippet is independent; Rust `?` assumes an enclosing `Result`-returning function. Go examples panic only for these fixed, known-valid inputs; applications should handle the returned error.

The binding examples use the standalone pure backend, without a native binary. Native entry points accept the same paths and values: `ktav.EditValue` (Go), `Ktav.editValue` (Java), `KtavApi.EditValue(..., KtavBackend.Native)` (C#), `Ktav::editValue` (PHP), the package's native/FFI exports (JS), and `ktav.edit_value` (Python). C-ABI backends require ABI 2; PyO3/N-API/WASM require the matching preparing-0.9 core. Bun/Deno FFI calls return promises: use `await`; pure/Node/WASM examples shown here are synchronous.

```ts
import { editValue, editValueSegments } from "@ktav-lang/ktav/pure";
```

#### 1. Dotted deployment settings

Only the address changes; the comment, dotted form and neighbouring user entry remain byte-for-byte unchanged.

```ts
const source = "## deployment\ntargets.storagehost.address: old\ntargets.storagehost.user: mcp-agent\n";
const updated = editValue(source, "targets.storagehost.address", "192.168.0.88:22");
```

Result:

```ktav
## deployment
targets.storagehost.address: 192.168.0.88:22
targets.storagehost.user: mcp-agent
```

#### 2. Literal dots: textual path or segments

The quoted source key is literally `a.b`. The textual path escapes its dot; the segments call passes the decoded key directly. Both calls return the same result.

```ts
const source = "\"a.b\": {port: 80}\n";
const updated = editValue(source, "a\\.b.port", 90);
const same = editValueSegments(source, ["a.b", "port"], 90);
```

Result:

```ktav
"a.b": {port: 90}
```

#### 3. A leaf inside a mixed-form array

`0` is an array index here. Inside an Object, the same segment would address the key named `0`; untouched containers remain inline.

```ts
const source = "servers: [{host: old, keep: yes}, standby]\n";
const updated = editValueSegments(source, ["servers", "0", "host"], "new");
```

Result:

```ktav
servers: [{host: new, keep: yes}, standby]
```

#### 4. A numeric-looking String stays a String

The replacement is a String, not an Integer. The raw marker preserves that distinction. Supply a typed Integer when a numeric value is intended.

```ts
const source = "port: 8080\n";
const updated = editValue(source, "port", "9090");
```

Result:

```ktav
port:: 9090
```

#### 5. Multiline replacement: expand only what is necessary

The changed array expands with four-space indentation. The untouched object stays inline, and verbatim string contents are not reindented.

```ts
const source = "a: [old, {keep: yes}]\n";
const updated = editValue(source, "a.0", "x\ny");
```

Result:

```ktav
a: [
    ((
x
y
    ))
    {keep: yes}
]
```

#### 6. No-op preserves noncanonical spelling

The Integer value is already 1. Equality returns the original bytes, including `+1` and the original separator spacing; readability thresholds are bypassed.

```ts
const source = "n  : +1\n";
const updated = editValue(source, "n", 1);
if (updated !== source) throw new Error("no-op changed source");
```

Result:

```ktav
n  : +1
```

#### 7. BOM, CRLF and an unterminated final line

The returned string keeps the BOM and CRLF, and does not gain a final newline. Its escaped representation is shown to make the bytes visible.

```ts
const source = "\ufeffport: 8080\r\nhost: db";
const updated = editValue(source, "port", 9090);
```

Result:

```text
"\uFEFFport: 9090\r\nhost: db"
```

Expansion is deterministic: a multiline replacement, growth beyond `max(100, original line length)`, or at least four escapes with at least 25% encoding overhead for an individual replacement string. Width counts Unicode scalar values, not UTF-8 bytes or terminal columns. An already-long line without growth is kept. New levels use four spaces and the source EOL. If CR or a `))` data line prevents lossless standalone encoding, a valid inline candidate is retained; these characters do not automatically make every inline edit unsupported.

#### 8. Exact Integer replacement

The source Integer domain is signed 64-bit. This value exceeds JavaScript's safe-Number range but fits i64; use an exact host representation, not a rounded floating-point value. A typed Integer outside i64 cannot be preserved as an Integer in source and is refused instead of truncated. Use a String when a large identifier is text. Float identity distinguishes negative and positive zero; Object no-op equality ignores key order, while Array order remains significant.

```ts
const updated = editValue("n: 1\n", "n", 9007199254740993n);
```

```ktav
n: 9007199254740993
```

### Diagnostics and safe failures in 0.9

Source coordinates are UTF-8 byte offsets, including a BOM; spans are half-open `[start, end)`, and lines are 1-based. LF, lone CR and CRLF are handled, with CRLF counted as one terminator. A Unicode character may occupy several bytes.

An unfinished `a: [\n` reports `UnclosedCompound`, line 1 and span `3..5`: the span begins at the innermost unmatched opener, not the start of its key or line. For raw bytes `61 3A 20 FF` (`a: ` followed by invalid UTF-8), validation reports `InvalidUtf8`, line 1 and a covering span `3..4`; `line_text` is null rather than fabricated by lossy decoding. UTF-8 validation precedes grammar processing.

A malformed textual path, including an empty textual path or empty textual segment, is `EditInvalidPath`; its offset is measured in the path's UTF-8 bytes. An empty segments list, missing key, out-of-range index or scalar descent is `EditNotFound`. Object numeric segments remain keys; array indexes use ASCII digits, allow leading zeros and reject signs.

Whole dotted/reopened intermediate objects may occupy several physical ranges and are `EditUnsupported`; their existing leaves can still be edited. Replacing a container must not discard interior comments. No failed call returns a partial patch or changes the supplied source. The returned text is re-parsed and semantically checked: the target must equal the replacement and the rest of the value tree must remain equal.

For bindings, invalid source is reported with the ordinary parser envelope before path validation. Malformed wire payloads are `Message` errors without invented source coordinates. The wire envelope has `error`, `reason`, `line`, `line_text`, `span`, `path`, `body`, `canonical`, `spec_section` and `message`; host accessor names are documented in the errors section. `body` carries the decimal path-byte offset for `EditInvalidPath`, null for `EditNotFound`, and the refusal reason for `EditUnsupported`.

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
