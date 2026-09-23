>>>>> lang=en
## 0.1.1 — `/ffi` subexport for Deno + Bun, aarch64-linux-musl native

### Added

- **`@ktav-lang/ktav/ffi` subexport** — direct C ABI access via
  `Deno.dlopen` (Deno) and `bun:ffi` (Bun). Same `ktav_cabi`
  shared library used by the Java / Go / .NET bindings, same
  `{"$i":"…"}` / `{"$f":"…"}` JSON wire format. ~3–5× faster than
  the WASM path on large documents. Default import unchanged —
  this is opt-in for users who measure a need. Throws on Node
  (use the default — already N-API native) and the browser
  (use `@ktav-lang/ktav/wasm`).
  - Requires `--allow-ffi=<path>` on Deno; permission-free on Bun.
  - The `ktav_cabi` binary is bundled in the matching
    `@ktav-lang/js-<rid>` optional dep alongside the existing
    `.node`. Override with `$KTAV_LIB_PATH` for local builds.
- **`@ktav-lang/ktav/wasm` subexport** — explicit access to the
  WASM build, useful for environments where the conditional
  `exports` map can't pick the right entry (e.g. some bundlers).
- **`@ktav-lang/js-linux-arm64-musl`** — native N-API binary for
  Alpine Linux on ARM64. Now listed in `optionalDependencies`;
  `npm install @ktav-lang/ktav` on this platform gets the native
  `.node` automatically instead of a missing-binary error.

>>>>> lang=ru
## 0.1.1 — `/ffi` subexport для Deno и Bun, нативный aarch64-linux-musl

### Добавлено

- **`@ktav-lang/ktav/ffi` subexport** — прямой доступ к C ABI через
  `Deno.dlopen` (Deno) и `bun:ffi` (Bun). Тот же `ktav_cabi`
  бинарник, что у биндингов Java / Go / .NET, тот же JSON wire-формат
  с `{"$i":"…"}` / `{"$f":"…"}`. ~3–5× быстрее WASM на больших
  документах. Default import не меняется — это opt-in для тех, кто
  измерил потребность. Бросает на Node (используйте default —
  уже N-API нативный) и в браузере (`@ktav-lang/ktav/wasm`).
  - Требует `--allow-ffi=<path>` на Deno; permission-free на Bun.
  - Бинарник `ktav_cabi` лежит в соответствующем
    `@ktav-lang/js-<rid>` optional dep рядом с `.node`. Переопределить
    через `$KTAV_LIB_PATH` для локальных билдов.
- **`@ktav-lang/ktav/wasm` subexport** — явный доступ к WASM-сборке,
  полезно для окружений, где conditional `exports` map не выбирает
  правильную ветку (некоторые бандлеры).
- **`@ktav-lang/js-linux-arm64-musl`** — нативный N-API бинарь для
  Alpine Linux на ARM64. Теперь в `optionalDependencies`;
  `npm install @ktav-lang/ktav` на этой платформе автоматически
  подхватит нативный `.node` вместо ошибки missing-binary.

>>>>> lang=zh
## 0.1.1 —— `/ffi` 子导出（Deno + Bun）、aarch64-linux-musl 原生二进制

### 新增

- **`@ktav-lang/ktav/ffi` 子导出** —— 通过 `Deno.dlopen`（Deno）
  和 `bun:ffi`（Bun）直接调用 C ABI。与 Java / Go / .NET 绑定共用
  同一个 `ktav_cabi` 共享库，以及 `{"$i":"…"}` / `{"$f":"…"}`
  的 JSON wire 格式。在大文档上比 WASM 路径快约 3–5 倍。
  默认导入保持不变 —— 这是给测出有真实需求的用户准备的 opt-in。
  在 Node 上抛错（改用默认导入，本身已经是 N-API 原生）；
  在浏览器上抛错（改用 `@ktav-lang/ktav/wasm`）。
  - Deno 需要 `--allow-ffi=<path>`；Bun 无需权限。
  - `ktav_cabi` 二进制随对应的 `@ktav-lang/js-<rid>` optional dep
    一起分发（就是装 `.node` 的那一个）。本地 cabi 构建可通过
    `$KTAV_LIB_PATH` 覆盖。
- **`@ktav-lang/ktav/wasm` 子导出** —— 显式访问 WASM 构建，
  对于条件 `exports` 映射无法正确选择（某些 bundler）的环境很有用。
- **`@ktav-lang/js-linux-arm64-musl`** —— 面向 Alpine Linux ARM64
  的原生 N-API 二进制。已加入 `optionalDependencies`；
  `npm install @ktav-lang/ktav` 在该平台上会自动选用原生 `.node`，
  不再报 missing-binary。

