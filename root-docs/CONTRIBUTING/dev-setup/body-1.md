>>>>> lang=en
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

>>>>> lang=ru
## Dev-окружение

Нужно:

- Node **≥ 18** (соответствует полю `engines`).
- Rust stable **≥ 1.70** для `crates/wasm`; **≥ 1.77** для
  `crates/napi` (директивы `cargo::` из napi-build).
- `wasm-pack` — `cargo install wasm-pack`.
- Rust-цель `wasm32-unknown-unknown` —
  `rustup target add wasm32-unknown-unknown`.

Опционально, но полезно для локального прогона всей матрицы:

- **Bun** ≥ 1.1 (`bun test`).
- **Deno** ≥ 2.0.
- **Playwright-браузеры** — `npx playwright install chromium`
  (один раз скачивает headless-шелл).

Особенность Windows: для сборки N-API нужен либо полный Visual Studio
Build Tools + Windows SDK, либо `cargo-xwin` с включённым Windows
Developer Mode. Точные флаги — в `AGENTS.md` воркспейса.

>>>>> lang=zh
## 开发环境

你需要:

- Node **≥ 18** (与 `engines` 字段一致)。
- Rust stable **≥ 1.70** 用于 `crates/wasm`;**≥ 1.77** 用于
  `crates/napi` (napi-build 的 `cargo::` 指令)。
- `wasm-pack` —— `cargo install wasm-pack`。
- Rust 目标 `wasm32-unknown-unknown` ——
  `rustup target add wasm32-unknown-unknown`。

可选,但对本地跑完整矩阵很有用:

- **Bun** ≥ 1.1 (`bun test`)。
- **Deno** ≥ 2.0。
- **Playwright 浏览器** —— `npx playwright install chromium`
  (一次性下载无头 shell)。

Windows 特别说明:N-API 构建需要完整的 Visual Studio Build Tools +
Windows SDK,或者启用 Windows 开发者模式的 `cargo-xwin`。具体参数见
工作区中的 `AGENTS.md`。

