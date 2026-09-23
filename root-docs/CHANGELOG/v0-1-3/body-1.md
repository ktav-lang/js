>>>>> lang=en
## 0.1.3 — 2026-04-26

### Changed

- **Picked up `ktav 0.1.4`** — the upstream Rust crate's untyped
  `parse() → Value` path (which `cabi`/`napi`/`wasm` all use) is now
  ~30% faster on small documents and ~13% faster on large ones, just
  from a one-line `Frame::Object` capacity tweak (4 → 8). Every
  `loads` call benefits transparently across Node, Deno, Bun, and
  the browser build.

npm: `@ktav-lang/ktav@0.1.3`.

>>>>> lang=ru
## 0.1.3 — 2026-04-26

### Изменено

- **Подхватили `ktav 0.1.4`** — untyped путь `parse() → Value` в
  upstream Rust crate (тот, что используют `cabi`/`napi`/`wasm`)
  теперь ~30% быстрее на маленьких документах и ~13% на больших,
  благодаря однострочной правке initial capacity для `Frame::Object`
  (4 → 8). Каждый `loads` получит ускорение прозрачно — Node, Deno,
  Bun и browser build.

npm: `@ktav-lang/ktav@0.1.3`.

>>>>> lang=zh
## 0.1.3 —— 2026-04-26

### 变更

- **升级到 `ktav 0.1.4`** —— 上游 Rust crate 中
  `cabi`/`napi`/`wasm` 共用的 untyped `parse() → Value` 路径，小
  文档加速约 30%、大文档加速约 13%，只是 `Frame::Object` 的初始
  容量微调（4 → 8）。每次 `loads` 都会透明地受益 —— Node、Deno、
  Bun、浏览器 build 全部覆盖。

npm: `@ktav-lang/ktav@0.1.3`。

