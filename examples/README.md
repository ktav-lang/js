# Examples

Each runtime example reads the same Ktav snippet, parses it, prints a
derived value, and renders a small object. The examples focus on the
public API rather than advanced features.

| Runtime | Example | Backend |
|---|---|---|
| Node | `node/` | Native N-API |
| Bun | `bun/napi.ts` | Native N-API |
| Bun | `bun/ffi.ts` | C ABI via `bun:ffi` |
| Deno | `deno/wasm.ts` | WASM web target |
| Deno | `deno/ffi.ts` | C ABI via `Deno.dlopen` (`--allow-ffi`) |
| Browser | `browser/` | WASM web target served over HTTP |
| Bundler | `bundler-vite/` | WASM bundler target with Vite |

The two FFI examples use the same `ktav_cabi` library as the Java, Go,
and .NET bindings. They can be faster than WASM for larger documents,
but require a matching native library. From a checkout, examples resolve
the package through `../../dist/`; installed consumers import
`@ktav-lang/ktav`.

Build the package from the repository root before running an example:

```sh
npm run build
```
