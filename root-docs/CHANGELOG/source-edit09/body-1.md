>>>>> lang=en
## Unreleased (source-edit 0.9)

### Added

- Added lossless source editing on every entrypoint: `editValue(source,
  textualPath, replacement)` and `editValueSegments(source, segments,
  replacement)` splice the SOURCE text instead of re-serializing, so
  comments, whitespace, key spelling/order, the BOM and the CR/LF/CRLF
  style survive byte-for-byte outside the effective edit. Only
  replacement of an existing value; typed `EditInvalidPath` (with the
  UTF-8 byte offset of the fault in the path), `EditNotFound` and
  `EditUnsupported` envelopes; byte-identical no-op for byte-identical
  replacements; mandatory post-splice semantic verification. Backed by
  the new `ktav_edit_value` / `ktav_edit_value_segments` C ABI symbols
  (ABI_VERSION 2), the new N-API/WASM `editValue` bindings, and a
  fully standalone pure-TypeScript implementation with no native or
  package-manager runtime dependencies.
- Spec 0.9 conformance: the corpus moves to `versions/0.9/tests` (412
  fixtures) with the new `diagnostics09` invalid fixtures (EOF and
  malformed-UTF8 raw-byte locations over the original bytes, BOM kept,
  CRLF one terminator, `line_text` null for invalid UTF-8). The new
  runner validates the `expected_location` metadata (line / start /
  end-or-minimum_end) on every backend.

>>>>> lang=ru
## Unreleased (source-edit 0.9)

### Добавлено

- Добавлено lossless-редактирование исходника на каждом входе:
  `editValue(source, textualPath, replacement)` и
  `editValueSegments(source, segments, replacement)` сплайсят ИСХОДНЫЙ
  текст вместо пересериализации, поэтому комментарии, пробелы,
  написание/порядок ключей, BOM и стиль CR/LF/CRLF сохраняются
  побайтово вне эффективной правки. Только замена существующего
  значения; типизированные envelope'ы `EditInvalidPath` (с UTF-8
  байтовым офсетом проблемы в пути), `EditNotFound` и
  `EditUnsupported`; байт-идентичный no-op для байт-идентичной замены;
  обязательная семантическая верификация после сплайса. Основа — новые
  символы C ABI `ktav_edit_value` / `ktav_edit_value_segments`
  (ABI_VERSION 2), новые биндинги `editValue` в N-API/WASM и полностью
  самостоятельная pure-TypeScript реализация без нативных и
  пакетно-менеджерных runtime-зависимостей.
- Конформанс спеки 0.9: корпус переезжает на `versions/0.9/tests`
  (412 фикстур) с новыми invalid-фикстурами `diagnostics09` (EOF и
  raw-byte позиции malformed-UTF8 по исходным байтам, BOM сохранён,
  CRLF — один терминатор, `line_text` null при невалидном UTF-8).
  Новый раннер проверяет метаданные `expected_location`
  (line / start / end-или-minimum_end) на каждом бэкенде.

>>>>> lang=zh
## Unreleased（source-edit 0.9）

### 新增

- 每个入口新增无损源码编辑：`editValue(source, textualPath,
  replacement)` 与 `editValueSegments(source, segments, replacement)`
  对源文本做拼接而不是重新序列化，注释、空白、键的拼写与顺序、BOM 以
  及 CR/LF/CRLF 风格在有效编辑范围之外逐字节保留。仅替换已存在的值；
  类型化的 `EditInvalidPath`（携带路径中出错位置的 UTF-8 字节偏移）、
  `EditNotFound` 与 `EditUnsupported` envelope；字节相同的替换产生字节
  相同的 no-op；拼接后强制进行语义校验。底层是新的 C ABI 符号
  `ktav_edit_value` / `ktav_edit_value_segments`（ABI_VERSION 2）、新的
  N-API/WASM `editValue` 绑定，以及完全不依赖原生库和包管理器运行时
  依赖的纯 TypeScript 实现。
- Spec 0.9 conformance：语料库迁至 `versions/0.9/tests`（412 个
  fixture），新增 `diagnostics09` 无效 fixture（EOF 与 malformed-UTF8
  的原始字节位置，保留 BOM，CRLF 算一个终止符，无效 UTF-8 时
  `line_text` 为 null）。新运行器会在每个后端上校验
  `expected_location` 元数据（line / start / end 或 minimum_end）。

