>>>>> lang=en
### Backends

- **N-API** (`crates/napi`) — native `.node` binary for Node ≥ 18 and
  Bun ≥ 1.0. Prebuilt for Linux (x64/arm64, gnu + musl), macOS
  (x64/arm64), Windows (x64/arm64); eight platform subpackages
  published under `@ktav-lang/js-<triple>` and declared as
  `optionalDependencies` of the main package.
- **WebAssembly** (`crates/wasm`) — two wasm-pack targets served from
  one package:
  - `web` for Deno and the browser (consumer calls `ready()`), plus
    `ktav.inline.js` — same entry with the `.wasm` base64-embedded so
    a single file drops into a `<script type="module">` without
    a sibling fetch.
  - `bundler` for webpack / rollup / esbuild / vite.

>>>>> lang=ru
### Бэкенды

- **N-API** (`crates/napi`) — нативный бинарник `.node` для Node ≥ 18
  и Bun ≥ 1.0. Предсобран под Linux (x64/arm64, gnu + musl), macOS
  (x64/arm64), Windows (x64/arm64); восемь платформенных подпакетов
  публикуются под `@ktav-lang/js-<triple>` и объявлены как
  `optionalDependencies` основного пакета.
- **WebAssembly** (`crates/wasm`) — две wasm-pack-цели из одного
  пакета:
  - `web` — для Deno и браузера (потребитель вызывает `ready()`),
    плюс `ktav.inline.js` — тот же вход с `.wasm`, встроенным через
    base64, так что один файл попадает в
    `<script type="module">` без соседнего fetch.
  - `bundler` — для webpack / rollup / esbuild / vite.

>>>>> lang=zh
### 后端

- **N-API** (`crates/napi`) —— 面向 Node ≥ 18 与 Bun ≥ 1.0 的原生
  `.node` 二进制。为 Linux (x64/arm64, gnu + musl)、macOS
  (x64/arm64)、Windows (x64/arm64) 预编译；八个平台子包以
  `@ktav-lang/js-<triple>` 发布，并作为主包的
  `optionalDependencies` 声明。
- **WebAssembly** (`crates/wasm`) —— 一个包提供两个 wasm-pack 目标：
  - `web` 面向 Deno 与浏览器 (使用方调用 `ready()`)，还包含
    `ktav.inline.js` —— 同一入口，将 `.wasm` 以 base64 内嵌，单个
    文件即可放入 `<script type="module">`，无需另外发起 fetch。
  - `bundler` 面向 webpack / rollup / esbuild / vite。

