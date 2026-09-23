>>>>> lang=en
## 0.5.0 — 2026-05-28

Tracks [`ktav 0.5.0`](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#050--2026-05-28)
and [spec 0.5.0](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md#050--2026-05-28).

### Added

- **`emitCanonical`** — new export on both the WASM and N-API paths;
  produces the normalised, round-trip-stable canonical representation
  defined by spec 0.5.0. Mirrors `ktav::emit_canonical` in the Rust
  crate.
- **Spec 0.5.0 conformance suite** — test runner now points at
  `spec/versions/0.5/tests` and exercises the full 0.5.0 fixture set.

### Changed

- **License** — dual-licensed `MIT OR Apache-2.0` (was `MIT`). Both
  `LICENSE-MIT` and `LICENSE-APACHE` are shipped in the npm package.
- Spec submodule updated to tag `v0.5.0` (commit `4d0a8aa`).

>>>>> lang=ru
## 0.5.0 — 2026-05-28

Следует за [`ktav 0.5.0`](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#050--2026-05-28)
и [spec 0.5.0](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md#050--2026-05-28).

### Добавлено

- **`emitCanonical`** — новый экспорт в WASM и N-API; возвращает
  нормализованное канонически стабильное представление по spec 0.5.0.
  Mirrors `ktav::emit_canonical` в Rust-крейте.
- **Тестовый пакет spec 0.5.0** — тесты теперь читают фикстуры из
  `spec/versions/0.5/tests` и прогоняют полный набор фикстур 0.5.0.

### Изменено

- **Лицензия** — двойная `MIT OR Apache-2.0` (ранее `MIT`). Оба файла
  `LICENSE-MIT` и `LICENSE-APACHE` включены в npm-пакет.
- Субмодуль spec обновлён до тега `v0.5.0` (коммит `4d0a8aa`).

>>>>> lang=zh
## 0.5.0 —— 2026-05-28

跟踪 [`ktav 0.5.0`](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#050--2026-05-28)
和 [spec 0.5.0](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md#050--2026-05-28)。

### 新增

- **`emitCanonical`** —— WASM 和 N-API 均新增导出；返回符合 spec 0.5.0
  的规范化、round-trip 稳定表示。它镜像 Rust crate 中的
  `ktav::emit_canonical`。
- **Spec 0.5.0 一致性测试** —— 测试运行器现在读取
  `spec/versions/0.5/tests`，并覆盖完整的 0.5.0 fixture 集合。

### 变更

- **许可证** —— 双重许可 `MIT OR Apache-2.0`（之前为 `MIT`）。
  `LICENSE-MIT` 和 `LICENSE-APACHE` 均包含在 npm 包中。
- Spec 子模块更新至标签 `v0.5.0`（提交 `4d0a8aa`）。

