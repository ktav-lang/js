# Examples

One subdirectory per runtime. Each example reads the same Ktav config
snippet, parses it, prints a derived value, then renders a small object
back to Ktav. The point is to show the public API in each runtime —
not to demonstrate advanced features.

| Runtime   | Folder          | How it loads ktav                          |
|-----------|-----------------|--------------------------------------------|
| Node      | `node/`         | N-API native `.node` (via `import "ktav"`) |
| Bun       | `bun/`          | N-API native `.node`                        |
| Deno      | `deno/`         | wasm `web` target (`await ready()`)         |
| Browser   | `browser/`      | wasm `web` target, served by any static HTTP server |
| Bundler   | `bundler-vite/` | wasm `bundler` target, Vite resolves `.wasm` |

From a git checkout, each example resolves ktav through a relative
path to `../../dist/` so you can hack the binding and see the change
without publishing. Published consumers just `npm install ktav` and
import from the package name.

Run `npm run build` at the repo root first — every example depends on
the compiled artifacts under `dist/`.
