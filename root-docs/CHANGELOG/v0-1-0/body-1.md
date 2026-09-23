>>>>> lang=en
## 0.1.0 — first public release

The initial release. Targets **Ktav format 0.1**.

### Package name

Published as **`@ktav-lang/ktav`** on npm. The unscoped name `ktav`
(matching the Rust crate and the PyPI package) is blocked by npm's
similarity filter against popular names like `koa` / `keyv` / `klaw`.
If the unscoped name opens up later, a future release may alias to it;
for now the scoped form is canonical.

### Public API

- `loads<T = KtavValue>(s: string): T` — parse a Ktav document.
- `dumps<T extends KtavInput = KtavInput>(obj: T): string` — serialize
  a JavaScript value (top-level must be an object).
- `ready(input?): Promise<void>` — initialize the WASM module.
  No-op on Node / Bun, required once on Deno / browser.
- TypeScript types `KtavValue`, `KtavObject`, `KtavArray`, `KtavInput`,
  `KtavError`.

>>>>> lang=ru
## 0.1.0 — первый публичный релиз

Первый релиз. Цель — **формат Ktav 0.1**.

### Имя пакета

Опубликовано как **`@ktav-lang/ktav`** на npm. Короткое имя `ktav`
(как у Rust-крейта и PyPI-пакета) заблокировано фильтром похожих имён
npm — слишком близко к популярным `koa` / `keyv` / `klaw`. Если имя
позже освободится, будущий релиз может добавить алиас; пока канонически
scoped.

### Публичный API

- `loads<T = KtavValue>(s: string): T` — разобрать Ktav-документ.
- `dumps<T extends KtavInput = KtavInput>(obj: T): string` —
  сериализовать JavaScript-значение (верхний уровень должен быть
  объектом).
- `ready(input?): Promise<void>` — инициализировать WASM-модуль. No-op
  для Node / Bun, требуется один раз на Deno / в браузере.
- TypeScript-типы `KtavValue`, `KtavObject`, `KtavArray`, `KtavInput`,
  `KtavError`.

>>>>> lang=zh
## 0.1.0 —— 首次公开发布

首次发布。面向 **Ktav 格式 0.1**。

### 包名

在 npm 上以 **`@ktav-lang/ktav`** 发布。短名 `ktav`（Rust crate 与 PyPI
包都用它）被 npm 的相似名过滤器拦下 —— 与 `koa` / `keyv` / `klaw`
等流行包太相似。若未来短名开放，后续版本可能加入别名；目前 scoped
形式为正式名。

### 公开 API

- `loads<T = KtavValue>(s: string): T` —— 解析 Ktav 文档。
- `dumps<T extends KtavInput = KtavInput>(obj: T): string` —— 序列化
  JavaScript 值 (顶层必须是对象)。
- `ready(input?): Promise<void>` —— 初始化 WASM 模块。在 Node / Bun
  上为 no-op，在 Deno / 浏览器上必须调用一次。
- TypeScript 类型 `KtavValue`、`KtavObject`、`KtavArray`、`KtavInput`、
  `KtavError`。

