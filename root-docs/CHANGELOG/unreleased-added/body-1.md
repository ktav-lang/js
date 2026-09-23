>>>>> lang=en
## Unreleased

### Added

- Added `format()` (comment-preserving formatter) and `emitCanonical()`
  exposed on every entrypoint: Node N-API, Bun, Deno, browser/bundler
  WASM, and the Deno/Bun FFI subexport backed by the new `ktav_format`
  / `ktav_emit_canonical` C ABI symbols. `format()` guarantees: every
  comment is preserved verbatim; runs of blank lines collapse to
  exactly one; key order is never changed; it is a fixed point
  (`format(format(x)) === format(x)`); and its output equals the
  canonical writer's exactly when the document has no comments and no
  blank lines.
- Added `canonicalFromSource(s)` — a text-to-text entry point producing
  byte-exact canonical output from source text. It exists because a JS
  number cannot carry Ktav's Integer/Float distinction, so the
  object-taking `emitCanonical({})` cannot produce byte-exact canonical
  text for float-bearing documents.
- Conformance suite now byte-compares writer output against the
  corpus's `.canonical.ktav` fixtures on every runtime, runs formatter
  fixed-point tests, and asserts the structured error envelope fields.

>>>>> lang=ru
## Не выпущено

### Добавлено

- Добавлены `format()` (форматтер с сохранением комментариев) и
  `emitCanonical()` на каждом входе: Node N-API, Bun, Deno,
  браузерный/bundler WASM, а также субэкспорт FFI для Deno/Bun,
  опирающийся на новые символы C ABI `ktav_format` /
  `ktav_emit_canonical`. Гарантии `format()`: каждый комментарий
  сохраняется дословно; серии пустых строк схлопываются ровно в одну;
  порядок ключей никогда не меняется; это фиксированная точка
  (`format(format(x)) === format(x)`); вывод совпадает с выдачей
  canonical writer'а тогда и только тогда, когда в документе нет ни
  комментариев, ни пустых строк.
- Добавлен `canonicalFromSource(s)` — вход «текст → текст», дающий
  побайтово точный канонический вывод из исходного текста. Он нужен
  потому, что число в JS не может нести различие Integer/Float из
  Ktav, поэтому принимающий объект `emitCanonical({})` не способен
  выдать побайтово точный канонический текст для документов с float'ами.
- Конформанс-набор теперь побайтово сравнивает вывод writer с
  фикстурами `.canonical.ktav` корпуса на каждом рантайме, выполняет
  тесты фиксированной точки форматтера и проверяет поля структурной
  оболочки ошибок.

>>>>> lang=zh
## 未发布

### 新增

- 新增 `format()`（保留注释的格式化器）和 `emitCanonical()`，并在每个
  入口暴露：Node N-API、Bun、Deno、浏览器/bundler WASM，以及 Deno/Bun
  的 FFI 子导出（由新的 C ABI 符号 `ktav_format` / `ktav_emit_canonical`
  支持）。`format()` 的保证：每条注释都逐字保留；连续空行折叠为恰好
  一行空行；键的顺序永不改变；它是定点变换
  （`format(format(x)) === format(x)`）；当且仅当文档中既无注释也无
  空行时，其输出与 canonical writer 的输出完全一致。
- 新增 `canonicalFromSource(s)` —— 文本到文本的入口，从源文本产生
  字节级精确的 canonical 输出。它存在的原因是：JS 的 number 无法承载
  Ktav 的 Integer/Float 区分，因此接受对象的 `emitCanonical({})`
  无法为含浮点数的文档产生字节级精确的 canonical 文本。
- Conformance 套件现在会在每个运行时上将 writer 输出与语料库的
  `.canonical.ktav` fixture 进行字节级比较，运行格式化器不动点测试，
  并断言结构化错误 envelope 字段。

