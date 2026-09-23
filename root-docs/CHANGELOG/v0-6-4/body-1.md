>>>>> lang=en
## [0.6.4] — 2026-08-23

Synchronized with Ktav spec and Rust core 0.6.4.

### Added

- Added `loadsStrict()` to WASM, N-API, and C-ABI FFI entrypoints for strict
  canonical-scalar validation. Canonical scientific float forms are accepted.

### Fixed

- Removed duplicate top-level array wrapping in WASM and N-API; nested arrays
  now round-trip without an extra level.
- Local N-API build and FFI test path resolution now respect `CARGO_TARGET_DIR`.

### Changed

- Package, platform subpackages, workspace metadata, and lockfile are `0.6.4`.
- Rust dependency is `ktav = "0.6"`, with the lockfile resolved to `0.6.4`.
- Spec submodule is pinned to the published Ktav 0.6.4 commit.

>>>>> lang=ru
## [0.6.4] — 2026-08-23

Синхронизация со спецификацией Ktav и Rust core 0.6.4.

### Добавлено

- `loadsStrict()` добавлен в WASM, N-API и C-ABI FFI entrypoints для строгой
  проверки канонических скаляров. Канонические научные формы float
  принимаются.

### Исправлено

- Удалено двойное оборачивание top-level массивов в WASM и N-API; вложенные
  массивы теперь проходят roundtrip без лишнего уровня.
- Локальные N-API build и FFI-тесты теперь учитывают `CARGO_TARGET_DIR`.

### Изменено

- Версии пакета, platform subpackages, workspace metadata и lockfile — `0.6.4`.
- Rust-зависимость задана как `ktav = "0.6"`, lockfile разрешён на `0.6.4`.
- Submodule спецификации закреплён на опубликованном коммите Ktav 0.6.4.

>>>>> lang=zh
## [0.6.4] — 2026-08-23

与 Ktav 规范和 Rust core 0.6.4 同步。

### 新增

- WASM、N-API 和 C-ABI FFI 入口新增 `loadsStrict()`，用于严格检查
  canonical scalar。canonical 的科学计数法浮点形式会被接受。

### 修复

- 移除 WASM 和 N-API 中重复的顶层数组包装，嵌套数组现在可无多余层级
  地 round-trip。
- 本地 N-API 构建和 FFI 测试路径现在遵循 `CARGO_TARGET_DIR`。

### 变更

- 包、平台子包、workspace metadata 和 lockfile 版本统一为 `0.6.4`。
- Rust 依赖使用 `ktav = "0.6"`，lockfile 解析到 `0.6.4`。
- 规范 submodule 固定到已发布的 Ktav 0.6.4 提交。

