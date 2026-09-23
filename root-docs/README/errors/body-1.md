>>>>> lang=en
## Errors

Every error thrown by the bindings is a typed `KtavError` carrying the
nine other structured fields: `error` (class, e.g. `"UnclosedCompound"`),
`reason` (stable writer-time code), `line`, `line_text`, `span`
(`{start, end}` — **byte** offsets into the UTF-8 source, not UTF-16
indices), `path` (array of exact decoded key segments, never a joined
string), `body`, `canonical`, and `spec_section` — plus, since ktav
0.8.0, `message`: the envelope's own tenth field, taken verbatim, never
reassembled from the other nine. It never contains raw JSON. Fields a
particular error doesn't carry are `null`.

```ts
import { loads } from "@ktav-lang/ktav";

try {
  loads("a: [");
} catch (e) {
  e.name;          // "KtavError"
  e.error;         // "UnclosedCompound"
  e.line_text;     // "a: ["
  e.span;          // { start: 3, end: 4 } — UTF-8 byte offsets
  e.spec_section;  // "§6.1"
  e.message;       // "Syntax error: Unclosed array at end of input"
}
```

>>>>> lang=ru
## Ошибки

Любая ошибка, которую бросают биндинги, — типизированный `KtavError`
с девятью прочими структурными полями: `error` (класс, например
`"UnclosedCompound"`), `reason` (стабильный writer-time код), `line`,
`line_text`, `span` (`{start, end}` — **байтовые** смещения в UTF-8
исходнике, а не UTF-16-индексы), `path` (массив точно декодированных
сегментов ключа, никогда не склеенная строка), `body`, `canonical` и
`spec_section` — а также, начиная с ktav 0.8.0, `message`: собственное
десятое поле конверта, взятое дословно, а не собранное из остальных
девяти. Оно никогда не содержит сырой JSON. Поля, которых у конкретной
ошибки нет, равны `null`.

```ts
import { loads } from "@ktav-lang/ktav";

try {
  loads("a: [");
} catch (e) {
  e.name;          // "KtavError"
  e.error;         // "UnclosedCompound"
  e.line_text;     // "a: ["
  e.span;          // { start: 3, end: 4 } — UTF-8 byte offsets
  e.spec_section;  // "§6.1"
  e.message;       // "Syntax error: Unclosed array at end of input"
}
```

>>>>> lang=zh
## 错误

绑定抛出的每一个错误都是类型化的 `KtavError`，携带另外九个结构化字段：
`error`（类别，如 `"UnclosedCompound"`）、`reason`（稳定的 writer 阶段
错误码）、`line`、`line_text`、`span`（`{start, end}` —— UTF-8 源文本的
**字节**偏移量，而非 UTF-16 索引）、`path`（由精确解码的键段组成的数组，
绝不是拼接后的字符串）、`body`、`canonical` 与 `spec_section`——此外，
自 ktav 0.8.0 起还有 `message`：信封自身的第十个字段，逐字取用，绝不由
其余九个字段拼装而成。它绝不包含原始 JSON。某个具体错误不具备的字段
为 `null`。

```ts
import { loads } from "@ktav-lang/ktav";

try {
  loads("a: [");
} catch (e) {
  e.name;          // "KtavError"
  e.error;         // "UnclosedCompound"
  e.line_text;     // "a: ["
  e.span;          // { start: 3, end: 4 } — UTF-8 byte offsets
  e.spec_section;  // "§6.1"
  e.message;       // "Syntax error: Unclosed array at end of input"
}
```

