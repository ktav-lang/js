>>>>> lang=en
- Failures use the ten-field edit envelope:
  `EditInvalidPath`, `EditNotFound`, `EditAlreadyExists` or
  `EditUnsupported`; location fields are null. Invalid source
  uses the parser envelope. `EditUnsupported.body` gives the
  reason: a noncontiguous whole target (dotted/reopened),
  erased interior comments, or no lossless representation
  in context.
- Byte-identical replacement is a no-op, even for
  noncanonical spelling. Successful patches are reparsed
  and verified against the intended semantic tree; only
  the target changes. Untouched siblings are not expanded.
  Failed calls return no partial patch and do not change
  source.
- Dotted, inline and block layouts are preserved; empty
  block containers are not collapsed. Inline ancestors
  expand minimally for multiline replacement, growth past
  `max(100, original line length)`, or an individual string
  needing at least 4 escapes and at least 25% encoding
  overhead. Width is Unicode scalars; expansion affects
  the touched branch only. `bigint` and integral `number`
  retain Integer form; non-integral numbers become Float.
- APIs are available on N-API, WASM, pure and FFI
  backends. Old native binaries report unsupported-version
  errors.

>>>>> lang=ru
- Ошибки используют десятиполевой edit-envelope: `EditInvalidPath`, `EditNotFound`, `EditAlreadyExists` или `EditUnsupported`; поля позиции равны null. Неверный исходник даёт envelope парсера. `EditUnsupported.body` содержит причину: несмежная цель (dotted/reopened), удаление внутренних комментариев или отсутствие lossless-представления в контексте.
- Байт-идентичная замена — no-op даже при неканоничном написании. Успешный патч повторно разбирается и проверяется относительно предполагаемого семантического дерева; меняется только цель. Нетронутые соседние элементы не раскрываются. Ошибка не возвращает частичный патч и не меняет исходник.
- Dotted-, inline- и блочная формы сохраняются; пустые блочные контейнеры не схлопываются. Inline-предки минимально раскрываются при многострочной замене, росте сверх `max(100, длина исходной строки)` либо при ≥4 escape и накладных расходах ≥25% для отдельной строки. Ширина — в Unicode scalar values; раскрывается только затронутая ветвь. `bigint` и целый `number` сохраняют Integer; нецелый становится Float.
- API доступны в N-API, WASM, pure и FFI. Старые нативные бинарники сообщают о неподдерживаемой версии.

>>>>> lang=zh
- 失败使用十字段编辑信封：`EditInvalidPath`、`EditNotFound`、`EditAlreadyExists` 或 `EditUnsupported`；位置字段为 null。无效源码使用解析器信封。`EditUnsupported.body` 给出原因：非连续整体目标（dotted/reopened）、删除内部注释，或上下文中无法无损表示。
- 字节相同的替换是 no-op，即使拼写非规范。成功补丁会重新解析，并根据预期语义树验证；仅目标发生变化。未触及的兄弟节点不会展开。失败不返回部分补丁，也不修改源码。
- 保留 dotted、inline 与块布局；空块容器不折叠。多行替换、行长增长超过 `max(100, 原始行长)`，或单个字符串至少 4 个转义且编码开销至少 25% 时，inline 祖先才最小展开。宽度按 Unicode 标量计算；只展开受影响分支。`bigint` 和整数 `number` 保持 Integer；非整数成为 Float。
- N-API、WASM、pure 和 FFI 后端均提供 API。旧原生二进制报告版本不受支持。

