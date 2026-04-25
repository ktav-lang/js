# Examples

One subdirectory per runtime. Each example reads the same Ktav config
snippet, parses it, prints a derived value, then renders a small object
back to Ktav. The point is to show the public API in each runtime —
not to demonstrate advanced features.

| Runtime   | Folder            | How it loads ktav                          |
|-----------|-------------------|--------------------------------------------|
| Node      | `node/`           | N-API native `.node` (via `import "@ktav-lang/ktav"`) |
| Bun       | `bun/napi.ts`     | N-API native `.node`                        |
| Bun       | `bun/ffi.ts`      | C ABI via `bun:ffi` (`@ktav-lang/ktav/ffi`) |
| Deno      | `deno/wasm.ts`    | wasm `web` target (default for Deno)        |
| Deno      | `deno/ffi.ts`     | C ABI via `Deno.dlopen` (`@ktav-lang/ktav/ffi`, needs `--allow-ffi`) |
| Browser   | `browser/`        | wasm `web` target, served by any static HTTP server |
| Bundler   | `bundler-vite/`   | wasm `bundler` target, Vite resolves `.wasm` |

The two FFI variants share the same `ktav_cabi` shared library used
by the Java / Go / .NET bindings — exact same C ABI, exact same JSON
wire format. They are faster than wasm for medium / large documents
but require the matching native binary on disk (built locally or
shipped via a `@ktav-lang/js-<rid>` subpackage).

From a git checkout, each example resolves ktav through a relative
path to `../../dist/` so you can hack the binding and see the change
without publishing. Published consumers just `npm install @ktav-lang/ktav`
and import from the package name.

Run `npm run build` at the repo root first — every example depends on
the compiled artifacts under `dist/`.
