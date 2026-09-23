>>>>> lang=en
`loadsStrict` applies canonical-scalar validation and rejects lossy
spellings while accepting forms emitted by the canonical writer.

`stringifyForceStrings` renders like `dumps` but flattens every leaf
scalar — integer, float, boolean, `null` — to its textual form via the
raw marker (`::`). Compounds keep their structure, and the result parses
back through `loads` as the same set of String scalars.

>>>>> lang=ru
`loadsStrict` применяет валидацию канонических скаляров и отклоняет
lossy-формы, принимая при этом формы, которые выдаёт canonical writer.

`stringifyForceStrings` выводит как `dumps`, но расплющивает каждый
leaf-скаляр — integer, float, boolean, `null` — в текстовую форму через
сырой маркер (`::`). Составные значения сохраняют структуру, а результат
разбирается обратно через `loads` как тот же набор String-скаляров.

>>>>> lang=zh
`loadsStrict` 会执行 canonical scalar 校验：拒绝有损写法，同时接受
canonical writer 生成的形式。

`stringifyForceStrings` 的输出与 `dumps` 一致，但会把每个叶子标量 ——
integer、float、boolean、`null` —— 通过原始标记（`::`）压平为文本形式。
复合值保持其结构，结果经 `loads` 解析回来仍是同一组 String 标量。

