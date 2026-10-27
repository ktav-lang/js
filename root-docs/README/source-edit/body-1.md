>>>>> lang=en
## Source editing (spec 0.9)

Edits splice source text, never re-serialize it. Outside the edit they preserve bytes, comments, whitespace, key spelling/order, BOM, EOL style and final-EOL presence.

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function insertValue(source: string, textualPath: string, replacement: KtavValue): string;
function insertValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function removeValue(source: string, textualPath: string): string;
function removeValueSegments(source: string, segments: readonly string[]): string;
function renameKey(source: string, textualPath: string, newKey: string): string;
function renameKeySegments(source: string, segments: readonly string[], newKey: string): string;
```

Bun/Deno FFI returns `Promise<string>`; the signatures above are synchronous exports.

- Paths use `.` as a separator; `\.` encodes a literal dot and `\\` a literal backslash. Other escapes, a trailing backslash, an empty path or empty segment produce `EditInvalidPath`; `body` is the UTF-8 byte offset in the path. Segment APIs take decoded strings. A numeric Object segment is a key; an Array index uses ASCII digits, allows leading zeros, and disallows signs.

- `editValue` replaces an existing value; missing keys, scalar descent, invalid indexes and empty segments lists are `EditNotFound`. `insertValue` adds only a new final key to an existing Object (`EditAlreadyExists` on collision); it does not create intermediate parents or insert into Arrays. `removeValue` removes a leaf, subtree or Array item; empty ancestors remain. `renameKey` renames an Object key using the literal `newKey`, preserving order and value; renaming to the same name is byte-identical, and a collision is `EditAlreadyExists`. Removing comments inside a container is unsupported.

>>>>> lang=ru
## Редактирование исходника (спека 0.9)

Правки соединяют части исходного текста, не пересериализуя его. Вне изменения побайтно сохраняются комментарии, пробелы, написание/порядок ключей, BOM, EOL и наличие финального EOL.

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function insertValue(source: string, textualPath: string, replacement: KtavValue): string;
function insertValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function removeValue(source: string, textualPath: string): string;
function removeValueSegments(source: string, segments: readonly string[]): string;
function renameKey(source: string, textualPath: string, newKey: string): string;
function renameKeySegments(source: string, segments: readonly string[], newKey: string): string;
```

Bun/Deno FFI возвращает `Promise<string>`; указанные сигнатуры синхронны.

- Пути используют `.` как разделитель; `\.` кодирует буквальную точку, а `\\` — буквальную обратную косую черту. Другие escape-последовательности, завершающая обратная косая черта, пустой путь или сегмент дают `EditInvalidPath`; `body` — смещение в байтах UTF-8 в пути. API сегментов принимает декодированные строки. Числовой сегмент Object — ключ; индекс Array состоит из ASCII-цифр, допускает ведущие нули, но не знаки.

- `editValue` заменяет существующее значение; пропущенный ключ, спуск через скаляр, неверный индекс и пустой список сегментов дают `EditNotFound`. `insertValue` добавляет только новый последний ключ в существующий Object (при совпадении — `EditAlreadyExists`); промежуточные предки не создаются, вставка в Array не выполняется. `removeValue` удаляет лист, поддерево или элемент Array; пустые предки остаются. `renameKey` переименовывает ключ Object, используя буквальный `newKey`, сохраняя порядок и значение; переименование в то же имя побайтно идентично, совпадение с другим ключом даёт `EditAlreadyExists`. Удаление комментариев внутри контейнера не поддерживается.

>>>>> lang=zh
## 源码编辑（spec 0.9）

编辑直接拼接源码，不重新序列化。编辑范围外逐字节保留注释、空白、键的拼写/顺序、BOM、EOL 风格及末尾 EOL 是否存在。

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function insertValue(source: string, textualPath: string, replacement: KtavValue): string;
function insertValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function removeValue(source: string, textualPath: string): string;
function removeValueSegments(source: string, segments: readonly string[]): string;
function renameKey(source: string, textualPath: string, newKey: string): string;
function renameKeySegments(source: string, segments: readonly string[], newKey: string): string;
```

Bun/Deno FFI 返回 `Promise<string>`；以上签名为同步导出。

- 路径使用 `.` 分隔；`\.` 表示字面点，`\\` 表示字面反斜杠。其他转义、末尾反斜杠、空路径或空段均产生 `EditInvalidPath`；`body` 是路径中的 UTF-8 字节偏移。段 API 接受已解码的字符串。Object 的数字段是键；Array 索引使用 ASCII 数字，允许前导零，不允许正负号。

- `editValue` 替换已有值；缺失键、穿过标量、无效索引和空段列表为 `EditNotFound`。`insertValue` 只向已有 Object 添加新的最后一个键（冲突时为 `EditAlreadyExists`）；不会创建中间祖先，也不向 Array 插入。`removeValue` 删除叶值、子树或 Array 元素；空祖先保留。`renameKey` 使用字面 `newKey` 重命名 Object 键，保留顺序和值；重命名为同名时逐字节不变，与现有键冲突时为 `EditAlreadyExists`。删除容器内注释不受支持。

