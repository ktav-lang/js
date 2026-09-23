>>>>> lang=en
### Added

- **Top-level Array support** (spec § 5.0.1) — a document whose first
  content line has an array-item shape (bare scalar, `:: text`,
  `:i 42`, `:f 3.14`, lone `{` / `[`, or a multi-line opener `(` / `((`)
  now `loads` as a root-level JS `Array`. Previously the parser
  required an Object root and rejected such inputs as
  `MissingSeparator`. `dumps` accepts an Array at the top level too
  and renders it bare (item-per-line, no enclosing `[...]`).
  Empty / comments-only documents still default to an empty Object
  (preserves 0.3.0 behaviour). `KtavInput` is widened to
  `Record<string, unknown> | unknown[]`.
- **`stringifyForceStrings(value)`** — new exported function on every
  runtime entry (`node`, `web`, `bundler`, `/ffi` for Deno + Bun).
  Renders the JS value as a Ktav document with every scalar coerced
  to a String — typed integers (`:i`), typed floats (`:f`), booleans,
  and `null` are flattened to their textual form; compounds keep
  their structure. Round-trips back through `loads` as the same set
  of String scalars. Useful for "everything is a string" dumps for
  downstream consumers that don't understand the typed markers, or
  for diff-friendly canonical text. JS-idiomatic camelCase wrapper
  around the upstream `ktav::to_string_force_strings` Rust function.
- New cabi export `ktav_dumps_force_strings` with the same JSON-wire
  contract as `ktav_dumps`, drives the FFI subexports on Deno + Bun.

>>>>> lang=ru
### Добавлено

- **Поддержка массивов верхнего уровня** (spec § 5.0.1) — документ,
  первая содержательная строка которого имеет форму элемента массива
  (голый скаляр, `:: text`, `:i 42`, `:f 3.14`, одиночные `{` / `[`
  или многострочный открыватель `(` / `((`), теперь `loads`-ится как
  корневой JS-`Array`. Раньше парсер требовал корнем Object и
  отвергал такие входы как `MissingSeparator`. `dumps` тоже теперь
  принимает массив на верхнем уровне и отрисовывает его без обёртки
  (элемент на строку, без обрамляющих `[...]`). Пустые документы и
  документы только из комментариев по-прежнему дают пустой Object
  (сохраняет поведение 0.3.0). `KtavInput` расширен до
  `Record<string, unknown> | unknown[]`.
- **`stringifyForceStrings(value)`** — новая экспортируемая функция на
  каждом входе рантайма (`node`, `web`, `bundler`, `/ffi` для
  Deno + Bun). Рисует JS-значение как Ktav-документ, где каждый скаляр
  приведён к String — типизированные целые (`:i`), floats (`:f`),
  booleans и `null` сплющены в текстовую форму; соединения сохраняют
  структуру. Round-trip через `loads` даёт тот же набор String-скаляров.
  Полезно для дампов «всё в строку» для потребителей, не понимающих
  типизированные маркеры, или для diff-дружественного канонического
  текста. Идиоматичный camelCase-wrapper вокруг upstream-функции Rust
  `ktav::to_string_force_strings`.
- Новый экспорт cabi `ktav_dumps_force_strings` с тем же JSON-wire
  контрактом, что и `ktav_dumps`, приводит в действие субэкспорты FFI
  на Deno + Bun.

>>>>> lang=zh
### 新增

- **顶层 Array 支持**（spec § 5.0.1）—— 若文档的第一个内容行具有数组
  项形状（裸标量、`:: text`、`:i 42`、`:f 3.14`、单独的 `{` / `[`，
  或多行开括号 `(` / `((`），现在会 `loads` 为根级 JS `Array`。此前
  解析器要求根必须是 Object，并将此类输入作为 `MissingSeparator`
  拒绝。`dumps` 现在也接受顶层数组，并按裸形式渲染（每项一行，
  不包裹 `[...]`）。空文档或仅含注释的文档仍默认为空 Object
  （保持 0.3.0 的行为）。`KtavInput` 已扩展为
  `Record<string, unknown> | unknown[]`。
- **`stringifyForceStrings(value)`** —— 在每个运行时入口
  （`node`、`web`、`bundler`、Deno + Bun 的 `/ffi`）导出的新函数。
  将 JS 值渲染为 Ktav 文档，所有标量一律强制为 String —— 类型化整数
  （`:i`）、类型化浮点（`:f`）、布尔值和 `null` 都会被展平为文本
  形式；连接结构保持原样。经由 `loads` 的 round-trip 会得到同一组
  String 标量。适用于为不理解类型化标记的下游消费者生成“全字符串”
  转储，或生成利于 diff 的 canonical 文本。是围绕上游 Rust 函数
  `ktav::to_string_force_strings` 的、符合 JS 习惯的 camelCase 包装。
- 新增 cabi 导出 `ktav_dumps_force_strings`，其 JSON-wire 契约与
  `ktav_dumps` 相同，驱动 Deno + Bun 上的 FFI 子导出。

