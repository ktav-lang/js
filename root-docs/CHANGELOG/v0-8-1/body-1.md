>>>>> lang=en
## [0.8.1] — 2026-10-22

Synchronized with the published Rust core `ktav` 0.8.1 and spec 0.8.1,
and introduces the pure-TypeScript backend.

### Added

- New `@ktav-lang/ktav/pure` entry point: a complete bidirectional
  Ktav parser and generator written in pure TypeScript — `loads()`,
  `loadsStrict()`, `dumps()`, `stringifyForceStrings()`, `format()`,
  `emitCanonical()`, `canonicalFromSource()`, and `loadsBytes()`. It
  requires no native binary, no WASM, and no subprocess, works in
  Node, Bun, Deno, and browsers, and throws the identical ten-field
  `KtavError` envelope with UTF-8 byte spans. The parser is a
  single-pass linear scanner.
- The bare `.` entry point keeps the native backends (N-API/WASM/FFI)
  as the default; `./pure` is strictly opt-in.

### Changed

- Package, platform subpackages, workspace metadata, and lockfile are
  `0.8.1`.
- Rust dependency is published `ktav` 0.8.1.
- Spec submodule: the release integration pins it to the published
  Ktav 0.8.1 commit (388982118c0d8f767bf283356ac9c9bb50fdc3f5)
  (corpus 228 parseable / 90 invalid / 5 unrepresentable /
  4 parseable-unrepresentable / 13 canonical fixtures, with 9 new
  `raw_bytes` fixtures).

>>>>> lang=ru
## [0.8.1] — 2026-10-22

Синхронизация с опубликованным Rust core `ktav` 0.8.1 и спецификацией
0.8.1, а также новый чисто-TypeScript бэкенд.

### Добавлено

- Новый вход `@ktav-lang/ktav/pure`: полный двунаправленный парсер и
  генератор Ktav на чистом TypeScript — `loads()`, `loadsStrict()`,
  `dumps()`, `stringifyForceStrings()`, `format()`, `emitCanonical()`,
  `canonicalFromSource()` и `loadsBytes()`. Он не требует нативного
  бинарника, WASM или подпроцесса, работает в Node, Bun, Deno и
  браузерах и бросает ту же оболочку ошибок `KtavError` со всеми
  десятью полями и UTF-8 смещениями в байтах. Парсер — однопроходный
  линейный сканер.
- Основной вход `.` сохраняет нативные бэкенды (N-API/WASM/FFI) по
  умолчанию; `./pure` — строго опциональный выбор.

### Изменено

- Версии пакета, platform subpackages, workspace metadata и lockfile —
  `0.8.1`.
- Rust-зависимость — опубликованный `ktav` 0.8.1.
- Submodule спецификации: релизная интеграция закрепляет его на
  опубликованном коммите Ktav 0.8.1
  (388982118c0d8f767bf283356ac9c9bb50fdc3f5)
  (корпус 228 parseable / 90 invalid / 5 unrepresentable /
  4 parseable-unrepresentable / 13 canonical фикстур, из них 9 новых
  фикстур `raw_bytes`).

>>>>> lang=zh
## [0.8.1] — 2026-10-22

与已发布的 Rust core `ktav` 0.8.1 及规范 0.8.1 同步，并引入纯
TypeScript 后端。

### 新增

- 新入口 `@ktav-lang/ktav/pure`：完整双向的纯 TypeScript Ktav 解析器
  与生成器 —— `loads()`、`loadsStrict()`、`dumps()`、
  `stringifyForceStrings()`、`format()`、`emitCanonical()`、
  `canonicalFromSource()` 和 `loadsBytes()`。它不需要原生二进制、WASM
  或子进程，可在 Node、Bun、Deno 和浏览器中运行，并抛出完全相同的
  十字段 `KtavError` envelope（UTF-8 字节偏移）。解析器是单遍线性
  扫描器。
- 裸入口 `.` 仍以原生后端（N-API/WASM/FFI）为默认；`./pure` 严格按需
  选择。

### 变更

- 包、平台子包、workspace metadata 和 lockfile 版本统一为 `0.8.1`。
- Rust 依赖为已发布的 `ktav` 0.8.1。
- 规范 submodule：发布集成会将其固定到已发布的 Ktav 0.8.1 提交
  （388982118c0d8f767bf283356ac9c9bb50fdc3f5）（语料库 228
  parseable / 90 invalid / 5 unrepresentable / 4
  parseable-unrepresentable / 13 个 canonical fixture，含 9 个新的
  `raw_bytes` fixture）。

