# Contributing to ktav (JavaScript / TypeScript)

**Languages:** **English** · [Русский](CONTRIBUTING.ru.md) · [简体中文](CONTRIBUTING.zh.md)

## Core rules

### 1. Every bug fix ships with a regression test

When you find a bug, **before fixing it**, write a test that reproduces
it — the test **must fail on `main`** and pass after the fix. Include
both in the same PR.

Tests live under `tests/`:

| File                           | Scope                                          |
|--------------------------------|------------------------------------------------|
| `shared/assertions.mjs`        | Runtime-agnostic suite (source of truth).      |
| `run-node-napi.mjs`            | Node runtime + native `.node` binding.         |
| `run-node-wasm.mjs`            | Node runtime + WASM web target.                |
| `run-bun.mjs`                  | Bun runtime + native `.node`.                  |
| `run-deno.ts`                  | Deno runtime + WASM web target.                |
| `run-browser.mjs`              | Headless Chromium (Playwright) + WASM.         |
| `browser-runner.html`          | The harness page the browser driver opens.     |

New tests almost always go into `shared/assertions.mjs` so they run in
every runtime. Runtime-specific edge cases (e.g. `ready()` semantics)
can live in the matching driver.

### 2. Don't reinvent the format in the bindings

These bindings are deliberately a thin wrapper. Parser / format
behaviour belongs in the Rust crate
([`ktav-lang/rust`](https://github.com/ktav-lang/rust)) — changing it
there updates every language binding at once. Only **JS/TS-specific
ergonomics** (TypeScript types, runtime loaders, exception types) belong
in this repo.

If your change requires a format change, start a discussion in
[`ktav-lang/spec`](https://github.com/ktav-lang/spec) first.

### 3. Public API changes note compatibility

If you touch anything exported from `ktav` or the `ts/` facade, say in
the PR description whether it is:

- **semver-compatible** (additions, looser types, doc changes); or
- **semver-breaking** (renamed / removed items, changed signatures,
  tightened types) — in which case the version bump lands in the next
  MINOR while we are pre-1.0.

Update `CHANGELOG.md` and the two translations in the same PR.

### 4. One concept per commit

Commits should be atomic: a bug fix and its test together, a feature
and its tests together, a rename on its own, a refactor on its own.
`git log --oneline` should read like a changelog. Don't prefix commit
messages with `feat:` / `fix:` — no conventional commits here.

### 5. Every runtime stays green

A change that passes `npm run test:node-napi` but breaks
`npm run test:browser` is not ready to merge. CI runs all five runtime
matrices on every PR — don't gate them out.

## Dev setup

You need:

- Node **≥ 18** (matches the `engines` field).
- Rust stable **≥ 1.70** for `crates/wasm`; **≥ 1.77** for `crates/napi`
  (napi-build's `cargo::` directives).
- `wasm-pack` — `cargo install wasm-pack`.
- Rust target `wasm32-unknown-unknown` — `rustup target add wasm32-unknown-unknown`.

Optional, but useful for running the full matrix locally:

- **Bun** ≥ 1.1 (`bun test`).
- **Deno** ≥ 2.0.
- **Playwright browsers** — `npx playwright install chromium` (downloads
  the headless shell once).

Windows-specific: the N-API build needs either a full Visual Studio Build
Tools + Windows SDK install, or `cargo-xwin` with Windows Developer
Mode enabled. See `AGENTS.md` in the workspace for the exact flags.

Build + test:

```bash
git clone --recurse-submodules https://github.com/ktav-lang/js.git
cd js
npm install
npm run build           # napi + wasm × 2 + tsc
npm test                # five runtimes, 153 assertions each
```

Build individual pieces:

```bash
npm run build:napi      # .node for the current host
npm run build:wasm      # web + bundler wasm + web/inline
npm run build:ts        # TypeScript facade only
```

## Running clippy locally (Windows quirk)

`cargo clippy --target wasm32-unknown-unknown` still compiles host-side
proc-macros and `build.rs` scripts — those always build for the host
triple. On a Windows box whose default toolchain is MSVC (our default
after `rustup override set stable-x86_64-pc-windows-msvc` for the N-API
build), clippy pulls in MSVC's `link.exe` and fails unless the shell
already has `vcvars64.bat` sourced.

Dodge the whole dance by running the wasm-crate clippy through the
GNU toolchain — MinGW's linker is already in PATH, no setup needed:

```bash
cargo +stable-x86_64-pc-windows-gnu clippy-wasm -- -D warnings
```

The `clippy-wasm` / `clippy-napi` aliases live in `.cargo/config.toml`
and lock in the right target flags. For the N-API crate, the MSVC
toolchain is unavoidable (it links against node.dll imports) — wrap
it with `scripts/lint-rust-napi-windows.bat` or just run
`npm run lint:rust`, which dispatches to the right wrapper per
platform.

Linux / macOS need none of this — default toolchain is GNU / Darwin,
`cargo clippy-wasm` and `cargo clippy-napi` work as-is.

## Code style

- **TypeScript**: strict, NodeNext module resolution. Avoid `any` in
  public APIs — the generic cast in `loads<T>` is the only intentional
  escape hatch.
- **Rust**: standard `rustfmt` defaults + `cargo clippy -- -D warnings`
  must pass. One idiomatic line > one clever line.
- **Comments**: explain *why*, not *what*. The public API has doc
  comments; internals have occasional `// note:` blocks only where
  a reader could plausibly be confused.

## Release flow

Tagged `v*` pushes on `main` kick off `.github/workflows/release.yml`:

1. Builds `.node` binaries for 8 platforms.
2. Builds the two wasm targets.
3. Assembles the `npm/<triple>/` platform subpackages.
4. Publishes each subpackage + the main `ktav` package via npm OIDC
   (no API tokens stored in the repo — the `npm` GitHub environment
   is trusted).

For local dry-runs, `npm pack --dry-run` shows the main tarball;
`npx napi create-npm-dirs --npm-dir npm --dry-run` shows the platform
trees.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.
Short version: email **phpcraftdream@gmail.com** privately, please
don't open a public issue for security problems.

### License of contributions

Unless you explicitly state otherwise, any contribution intentionally
submitted for inclusion in this project by you, as defined in the
Apache-2.0 license, shall be dual-licensed as **MIT OR Apache-2.0**,
without any additional terms or conditions.
