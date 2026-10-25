>>>>> lang=en
- **Only replacement of an existing value.** There is no create,
  remove, or rename. A missing key, a descent through a scalar, an
  out-of-bounds or non-numeric array index, or an empty segments list
  throw `EditNotFound`.
- **Paths.** `textualPath` is the dotted form `key1.key2.0.key4`;
  inside a segment `\.` is a literal dot and `\\` a literal backslash;
  any other escape, a trailing lone backslash, or an empty segment
  throws `EditInvalidPath` with `body` set to the decimal **UTF-8 byte
  offset** in the path argument where the problem was detected.
  `editValueSegments` takes already-decoded literal segments with no
  extra unescaping. A numeric segment addresses a string key inside an
  Object and a zero-based ASCII-digits index inside an Array (leading
  zeros allowed, signs are not indexes).
- **Errors** are the usual ten-field envelope with
  `error === "EditInvalidPath" | "EditNotFound" | "EditUnsupported"`;
  all location fields are null (an edit failure is not a parse error).
  `EditUnsupported.body` carries the reason: a noncontiguous
  (dotted-key / reopen) whole target, structural replacement that would
  erase interior comment lines, or a multiline string containing a line
  `))` — no lossless form exists.
- **Guarantees.** A byte-identical replacement is a byte-identical
  no-op even for noncanonical spelling. Every successful patch is
  re-parsed and semantically verified: exactly the target replaced, the
  rest of the tree equal. An invalid SOURCE throws the parser's own
  envelope, not an edit error.
- **Layout.** Dotted, inline and block forms are preserved, including
  whole inline containers and emptied (but not collapsed) block
  containers. Inline wrappers expand minimally when a multiline string
  arrives, when the line grows past `max(100 Unicode scalars, its
  previous length)`, or when a replacement needs ≥ 4 escapes with ≥ 25 %
  overhead — only along the touched branch, never for untouched
  siblings. Replacement is a JS value; `bigint` and integral `number`
  keep the exact Integer wire form, non-integral `number` becomes a
  Float.

Available on every backend: `@ktav-lang/ktav` (N-API), `/wasm`,
`/pure`, and the `/ffi` subexports (Bun / Deno, asynchronous). Native
binaries predating the 0.9 core report a clear unsupported-version
error instead of a silent fallback.

>>>>> lang=ru
- **Только замена существующего значения.** Создание, удаление и
  переименование не поддерживаются. Отсутствующий ключ, спуск через
  скаляр, выходящий за границы или нечисловой индекс массива, пустой
  список сегментов — `EditNotFound`.
- **Пути.** `textualPath` — форма с точками `key1.key2.0.key4`; внутри
  сегмента `\.` — literal точка, `\\` — literal backslash; любой другой
  escape, хвостовой одиночный `\` или пустой сегмент —
  `EditInvalidPath`, в `body` — десятичный **UTF-8 байтовый офсет** в
  аргументе пути. `editValueSegments` принимает уже декодированные
  литеральные сегменты без повторного unescape. Числовой сегмент — это
  строковый ключ в Object и zero-based индекс из ASCII-цифр в Array
  (ведущие нули допустимы, знаки — нет).
- **Ошибки** — обычный десятиполевой envelope с
  `error === "EditInvalidPath" | "EditNotFound" | "EditUnsupported"`;
  все поля позиции null (ошибка правки — не parse-ошибка).
  `EditUnsupported.body` содержит причину: noncontiguous-цель
  (dotted-key / reopen), структурная замена, стирающая комментарии
  внутри контейнера, или многострочная строка со строкой `))` —
  lossless-формы не существует.
- **Гарантии.** Байт-идентичная замена — байт-идентичный no-op даже
  при неканоничном написании. Каждый успешный патч перепарсится и
  семантически проверяется: заменено ровно целевое значение, остальное
  дерево равно. Невалидный ИСХОДНИК даёт обычный envelope парсера, а
  не ошибку правки.
- **Форма.** Dotted-, inline- и блочные формы сохраняются, включая
  целые inline-контейнеры и опустошённые (но не схлопнутые) блочные.
  Inline-обёртки раскрываются минимально: при многострочной строке, при
  росте строки сверх `max(100 Unicode scalar, прежняя длина)` или при
  ≥ 4 escapes с накладными расходами ≥ 25 % — только по затронутой
  ветке. Замена — JS-значение: `bigint` и целые `number` сохраняют
  точную форму Integer, нецелые — Float.

Доступно на всех бэкендах: `@ktav-lang/ktav` (N-API), `/wasm`,
`/pure` и субэкспорты `/ffi` (Bun / Deno, асинхронно). Нативные
бинарники старше ядра 0.9 сообщают понятную ошибку версии, а не
тихий fallback.

>>>>> lang=zh
- **只替换已存在的值。** 不支持创建、删除或重命名。缺失的键、穿过标量的
  下行、越界或非数字的数组索引、空段列表都会抛出 `EditNotFound`。
- **路径。** `textualPath` 是点分形式 `key1.key2.0.key4`；段内 `\.` 表示
  字面点号，`\\` 表示字面反斜杠；任何其他转义、结尾孤立的反斜杠或空段
  都会抛出 `EditInvalidPath`，`body` 是路径参数中出错位置的十进制
  **UTF-8 字节偏移**。`editValueSegments` 接收已解码的字面段，不做额外
  反转义。数字段在 Object 中是字符串键，在 Array 中是从零开始的
  ASCII 数字索引（允许前导零，不允许符号）。
- **错误**是通常的十字段 envelope，
  `error === "EditInvalidPath" | "EditNotFound" | "EditUnsupported"`；
  所有位置字段为 null（编辑失败不是解析错误）。`EditUnsupported.body`
  携带原因：非连续（dotted-key / reopen）的整体目标、会删除容器内部
  注释的结构性替换、或包含一行 `))` 的多行字符串——不存在无损形式。
- **保证。** 字节相同的替换是字节相同的 no-op，即使拼写非规范亦然。
  每个成功的补丁都会重新解析并做语义校验：恰好替换目标值，其余树相等。
  无效的源文本抛出解析器自己的 envelope，而不是编辑错误。
- **版式。** dotted、inline 与块形态均被保留，包括完整的 inline 容器和
  被清空（但不折叠）的块容器。当出现多行字符串、行宽超过
  `max(100 个 Unicode 标量, 原行宽)`，或替换需要 ≥ 4 个转义且开销
  ≥ 25 % 时，inline 包装沿被触及的分支最小展开。替换值是 JS 值：
  `bigint` 与整数 `number` 保持精确的 Integer 形式，非整数则成为
  Float。

所有后端均可用：`@ktav-lang/ktav`（N-API）、`/wasm`、`/pure` 以及
`/ffi` 子导出（Bun / Deno，异步）。早于 0.9 内核的原生二进制会报告
清晰的版本不支持错误，而不是静默回退。

