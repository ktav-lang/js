>>>>> lang=en
### Changed

- Conformance runner updated to the spec 0.7 corpus: the new `unrepresentable/`
  (5 writer-refusal fixtures) and `parseable-unrepresentable/` (4
  parse-then-refuse fixtures) categories are now executed on every runtime.
- `invalid/` fixtures now assert the expected error category from each
  fixture's JSON oracle, and the `invalid_utf8/` fixture is validated via
  strict UTF-8 decoding at the byte→string boundary (the raw bytes ARE the
  fixture).
- Added spec-0.7 smoke tests: quoted keys (§ 5.3.3) and `\uXXXX` escapes
  (§ 3.7.1), including lone-surrogate rejection and U+0000 key round-trips.
- Every error thrown by the bindings is now a typed `KtavError` carrying
  all ten `ktav::ErrorEnvelope` fields (`error`, `reason`, `line`,
  `line_text`, `span` — UTF-8 byte offsets, `path` — array of exact key
  segments, `body`, `canonical`, `spec_section`, `message`);
  `message` stays
  human-readable and never contains raw JSON. This is a breaking change
  to the text the binding surfaces on failure — callers matching on
  message strings will notice (intended; the envelope has never shipped
  in any binding).

>>>>> lang=ru
### Изменено

- Conformance-раннер переведён на корпус spec 0.7: новые категории
  `unrepresentable/` (5 фикстур отказа writer) и
  `parseable-unrepresentable/` (4 фикстуры «разобрать и отказать»)
  теперь выполняются на каждом рантайме.
- Фикстуры `invalid/` теперь проверяют ожидаемую категорию ошибки из
  JSON-оракула каждой фикстуры, а фикстура `invalid_utf8/` валидируется
  строгим UTF-8-декодированием на границе байт→строка (сырые байты и
  есть фикстура).
- Добавлены smoke-тесты spec 0.7: заключённые в кавычки ключи (§ 5.3.3)
  и escape-последовательности `\uXXXX` (§ 3.7.1), включая отклонение
  lone-surrogate и round-trip ключей с U+0000.
- Каждая ошибка, выбрасываемая биндингами, теперь — типизированный
  `KtavError` со всеми десятью полями `ktav::ErrorEnvelope` (`error`, `reason`,
  `line`, `line_text`, `span` — смещения в байтах UTF-8, `path` — массив
  точных сегментов ключа, `body`, `canonical`, `spec_section`, `message`);
  сообщение остаётся человекочитаемым и никогда не содержит сырой JSON. Это
  ломающее изменение текста, который биндинг показывает при сбое, —
  заметят те, кто сопоставляет строки сообщений (намеренное; оболочка
  ещё ни разу не поставлялась ни в одном биндинге).

>>>>> lang=zh
### 变更

- Conformance 运行器已更新至 spec 0.7 语料库：新增的 `unrepresentable/`
  （5 个 writer 拒绝 fixture）和 `parseable-unrepresentable/`（4 个
  先解析后拒绝 fixture）类别现在会在每个运行时上执行。
- `invalid/` fixture 现在会断言每个 fixture 的 JSON oracle 所预期的
  错误类别，`invalid_utf8/` fixture 则在字节→字符串边界通过严格 UTF-8
  解码校验（原始字节即 fixture 本身）。
- 新增 spec 0.7 冒烟测试：带引号的键（§ 5.3.3）和 `\uXXXX` 转义
  （§ 3.7.1），包括 lone-surrogate 拒绝和 U+0000 键 round-trip。
- 绑定抛出的每个错误现在都是携带 `ktav::ErrorEnvelope` 全部十个字段的
  类型化 `KtavError`（`error`、`reason`、`line`、`line_text`、`span`
  —— UTF-8 字节偏移，`path` —— 精确键段数组，`body`、`canonical`、
  `spec_section`、`message`）；消息保持人类可读，且绝不包含原始 JSON。
  这是对绑定在失败时呈现的文本的破坏性变更 —— 依赖消息字符串进行匹配的
  调用方会注意到（有意为之；envelope 从未在任何绑定中发布过）。

