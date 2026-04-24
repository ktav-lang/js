# ktav — JavaScript / TypeScript bindings

Universal JS/TS bindings for [Ktav](https://github.com/ktav-lang/spec) —
a plain configuration format with three rules, zero indentation, and
zero quoting. WASM-backed, ships for Node, Deno, Bun, and browsers from
a single package.

## Install

```bash
npm install ktav       # Node, Bun, bundlers
```

Deno:

```ts
import { loads, dumps, ready } from "npm:ktav";
await ready();
```

Browser (via a bundler: Vite / Rollup / webpack / esbuild): same import
as Node. Without a bundler, use the `web` entry directly and await
`ready()` once.

## Quick example

```ts
import { loads, dumps } from "ktav";

interface Config {
    port: number;
    host: string;
    tls: boolean;
    tags: string[];
}

const cfg = loads<Config>(`
port:i 8080
host: localhost
tls: true
tags: [ alpha beta gamma ]
`);

cfg.port;  // 8080 — typed as number
cfg.host;  // "localhost"

const back = dumps(cfg);
```

## API

- `loads<T = KtavValue>(s: string): T` — parse a Ktav document. The
  generic parameter is an **unchecked cast** — use it for ergonomic
  access when you know the schema. Pass nothing to get the structural
  `KtavValue` type.
- `dumps<T extends KtavInput = KtavInput>(obj: T): string` — serialize
  a plain object as Ktav. Top-level must be an object.
- `ready(input?)` — **web / Deno / browser only**. Awaits WASM
  initialization. No-op on Node / Bun.

## Type mapping

| Ktav             | JavaScript                                |
|------------------|-------------------------------------------|
| `null`           | `null`                                    |
| `true` / `false` | `boolean`                                 |
| `:i <digits>`    | `number` (safe range) / `bigint` (bigger) |
| `:f <number>`    | `number`                                  |
| bare scalar      | `string`                                  |
| `[ ... ]`        | `Array`                                   |
| `{ ... }`        | plain object                              |

On encode, `Number.isInteger(x)` decides `:i` vs `:f`; `bigint` always
encodes as `:i`. `NaN` and `Infinity` are rejected.

## Runtime matrix

| Runtime   | Entry resolved        | `ready()` required |
|-----------|-----------------------|--------------------|
| Node 18+  | `dist/ts/node.js`     | no                 |
| Bun       | `dist/ts/node.js`     | no                 |
| Deno      | `dist/ts/web.js`      | yes                |
| Browser   | `dist/ts/web.js`      | yes                |
| Bundlers  | `dist/ts/bundler.js`  | no (bundler loads) |

## Build from source

Common prerequisites:
- Rust ≥ 1.70 (stable) + target `wasm32-unknown-unknown`.
- Node ≥ 18.
- `wasm-pack` (`cargo install wasm-pack`) — for the web / Deno / bundler
  builds.
- `@napi-rs/cli` (installed by `npm install` as a dev dep) — for the
  native `.node` binary that Node and Bun consume.

Windows-specific: the N-API crate links against the MSVC toolchain, so
you need **either**

1. Visual Studio Build Tools with the **Windows SDK** component
   installed (canonical path), **or**
2. `cargo-xwin` + **Windows Developer Mode enabled**
   (Settings → Privacy & security → For developers → Developer Mode).
   Developer Mode grants your user the symlink privilege that `xwin`
   needs to unpack the MSVC/SDK cache. After enabling, also run
   `rustup override set stable-x86_64-pc-windows-msvc` in this repo —
   the GNU toolchain hits a separate `libnode.dll` wall that Node on
   Windows doesn't provide.

Linux / macOS: nothing extra — system compiler + Rust is enough.

```bash
git clone --recurse-submodules https://github.com/ktav-lang/js.git
cd js
npm install
npm run build     # napi + wasm-pack × 2 targets, then tsc
npm test
```

## License

MIT — see [LICENSE](./LICENSE). Spec is under `spec/` as a git submodule
pointing at [ktav-lang/spec](https://github.com/ktav-lang/spec).
