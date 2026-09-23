>>>>> lang=en
Three functions produce canonical output and they are not
interchangeable:

| | input | comments | scalar spelling |
| --- | --- | --- | --- |
| `format(s)` | source text | **kept** | preserved |
| `canonicalFromSource(s)` | source text | dropped | preserved |
| `emitCanonical(obj)` | a JS value | none to keep | may change |

`canonicalFromSource` is text in, canonical text out, with no JavaScript
value in between — so `1.0`, `1e9` and `-0.0` survive byte-exactly.
`emitCanonical` cannot promise that: a JS `number` cannot express Ktav's
Integer/Float distinction, so `1.0` arrives indistinguishable from `1`.
Use `emitCanonical` when you have a value, `canonicalFromSource` when
you have a document.

The generic parameter on `loads` is an **unchecked cast** — use it when
you know the shape for IDE autocomplete. Pass nothing for the
structural `KtavValue` type.

>>>>> lang=ru
Канонический вывод дают три функции, и они не взаимозаменяемы:

| | вход | комментарии | написание скаляра |
| --- | --- | --- | --- |
| `format(s)` | исходный текст | **сохраняются** | сохраняется |
| `canonicalFromSource(s)` | исходный текст | отбрасываются | сохраняется |
| `emitCanonical(obj)` | значение JS | сохранять нечего | может измениться |

`canonicalFromSource` — это текст на входе и канонический текст на
выходе, без промежуточного значения JavaScript, поэтому `1.0`, `1e9` и
`-0.0` переживают преобразование побайтово. `emitCanonical` такого
обещать не может: `number` в JS не выражает различие Integer/Float из
Ktav, поэтому `1.0` приходит неотличимым от `1`. Берите `emitCanonical`,
когда у вас значение, и `canonicalFromSource`, когда у вас документ.

Дженерик-параметр у `loads` — **непроверяемый каст**: используйте его,
когда знаете форму данных и хотите автокомплит в IDE. Ничего не
передавайте — получите структурный тип `KtavValue`.

>>>>> lang=zh
有三个函数都产生规范输出，而它们并不可以互换：

| | 输入 | 注释 | 标量的写法 |
| --- | --- | --- | --- |
| `format(s)` | 源文本 | **保留** | 保留 |
| `canonicalFromSource(s)` | 源文本 | 丢弃 | 保留 |
| `emitCanonical(obj)` | JS 值 | 无注释可留 | 可能改变 |

`canonicalFromSource` 是文本进、规范文本出，中间没有 JavaScript 值，
因此 `1.0`、`1e9` 与 `-0.0` 都能逐字节保留。`emitCanonical` 无法给出
这个保证：JS 的 `number` 表达不了 Ktav 的 Integer/Float 之分，所以
`1.0` 到达时与 `1` 无从区分。手上是值时用 `emitCanonical`，手上是文档
时用 `canonicalFromSource`。

`loads` 上的泛型参数是**未经检查的类型断言** —— 当你已知数据形状、
希望获得 IDE 自动补全时使用。不传则得到结构化类型 `KtavValue`。

