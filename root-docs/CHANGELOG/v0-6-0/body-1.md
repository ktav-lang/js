>>>>> lang=en
## 0.6.0 — 2026-06-01

Sync to Ktav 0.6.0 — keys now support escaping.

### Added

- Keys process the full §3.7 escape set, with two new escapes:
  - `\.` → `.` (literal dot — does **not** split a dotted path)
  - `\:` → `:` (literal colon — does **not** act as the key/value separator)
- Examples: `a\.b: v` → `{"a.b": "v"}`, `a\:b: v` → `{"a:b": "v"}`,
  `x.y\.z: v` → `{"x": {"y.z": "v"}}`.

### Breaking

- A literal backslash inside a key now requires `\\` (previously `\` in
  a key was a plain byte). Rare in practice; per pre-1.0 SemVer this is
  a MINOR bump.

### Changed

- Tracks ktav-rust 0.6.0 / Ktav spec 0.6.0. Binding source unchanged —
  the escape change is internal to the Rust core and transparent across
  the WASM / N-API / FFI boundaries.

---

>>>>> lang=ru
## 0.6.0 — 2026-06-01

Синхронизация с Ktav 0.6.0 — ключи теперь поддерживают экранирование.

### Добавлено

- Ключи обрабатывают полный набор escape-последовательностей §3.7,
  включая два новых:
  - `\.` → `.` (литеральная точка — **не** делит dotted-path)
  - `\:` → `:` (литеральное двоеточие — **не** работает как разделитель
    ключ/значение)
- Примеры: `a\.b: v` → `{"a.b": "v"}`, `a\:b: v` → `{"a:b": "v"}`,
  `x.y\.z: v` → `{"x": {"y.z": "v"}}`.

### Ломающие изменения

- Литеральный backslash внутри ключа теперь требует `\\` (раньше `\` в
  ключе был обычным байтом). На практике встречается редко; по pre-1.0
  SemVer — MINOR bump.

### Изменено

- Отслеживает ktav-rust 0.6.0 / Ktav spec 0.6.0. Исходники биндинга не
  менялись — изменение escape-семантики целиком внутри Rust-ядра и
  прозрачно для путей WASM / N-API / FFI.

---

>>>>> lang=zh
## 0.6.0 —— 2026-06-01

同步至 Ktav 0.6.0 —— 键现在支持转义。

### 新增

- 键处理完整的 §3.7 转义集合，并新增两个转义：
  - `\.` → `.`（字面量点 —— **不**会切分 dotted-path）
  - `\:` → `:`（字面量冒号 —— **不**作为键/值分隔符）
- 示例：`a\.b: v` → `{"a.b": "v"}`，`a\:b: v` → `{"a:b": "v"}`，
  `x.y\.z: v` → `{"x": {"y.z": "v"}}`。

### 破坏性变更

- 键中的字面量反斜杠现在需要写作 `\\`（此前键中的 `\` 是普通字节）。
  实际中很少出现；按 pre-1.0 SemVer 为 MINOR bump。

### 变更

- 跟踪 ktav-rust 0.6.0 / Ktav 规范 0.6.0。绑定源码未改动 —— escape
  语义的变化完全在 Rust 内核中实现，WASM / N-API / FFI 路径均透明。

---

