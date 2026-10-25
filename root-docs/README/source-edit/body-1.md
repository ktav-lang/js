>>>>> lang=en
## Source editing (spec 0.9)

Two operations replace a value **inside an existing document** by
splicing the source text — the document is never re-serialized, so
comments, whitespace, key spelling and order, the BOM, and the CR / LF /
CRLF style (and the presence or absence of the final newline) survive
byte-for-byte outside the effective edit:

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
```

Bun/Deno FFI accepts the same arguments but returns `Promise<string>`; use `await`. The signatures above describe synchronous exports.

>>>>> lang=ru
## Редактирование исходника (спека 0.9)

Две операции заменяют значение **внутри существующего документа**,
сплайся исходный текст: документ не пересериализуется, поэтому
комментарии, пробелы, написание и порядок ключей, BOM и стиль CR / LF /
CRLF (а также наличие или отсутствие финального перевода строки)
сохраняются побайтово вне эффективной правки:

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
```

FFI Bun/Deno принимает те же аргументы, но возвращает `Promise<string>`; используйте `await`. Сигнатуры выше относятся к синхронным экспортам.

>>>>> lang=zh
## 源码编辑（spec 0.9）

两个操作在**现有文档内部**替换一个值，方式是对源文本做拼接（splice）
而不是重新序列化：注释、空白、键的拼写与顺序、BOM、CR / LF / CRLF 风格
（以及末尾换行符的有无）在有效编辑范围之外逐字节保留：

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
```

Bun/Deno FFI 接收相同参数，但返回 `Promise<string>`，需要 `await`。以上签名描述同步导出。

