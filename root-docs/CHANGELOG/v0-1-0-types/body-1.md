>>>>> lang=en
### Type mapping

| Ktav             | JavaScript                                |
|------------------|-------------------------------------------|
| `null`           | `null`                                    |
| `true` / `false` | `boolean`                                 |
| `:i <digits>`    | `number` (safe range) / `bigint` (larger) |
| `:f <number>`    | `number`                                  |
| bare scalar      | `string`                                  |
| `[ ... ]`        | `Array`                                   |
| `{ ... }`        | plain object (insertion-ordered)          |

On encode, `Number.isInteger(x)` chooses `:i`; `bigint` always encodes
as `:i`. `NaN` and `±Infinity` are rejected.

### Tested on

Every runtime runs the full 153-assertion conformance suite (spec
fixtures + smoke): Node 18 / 20 / 22 on Linux / macOS / Windows, Bun
on all three OSs, Deno 2.x on all three OSs, headless Chromium via
Playwright on all three OSs.

### Acknowledgements

Built on top of the reference `ktav` Rust crate; PyO3-style bindings
machinery borrowed from the Python package.
>>>>> lang=ru
### Соответствие типов

| Ktav               | JavaScript                                       |
|--------------------|--------------------------------------------------|
| `null`             | `null`                                           |
| `true` / `false`   | `boolean`                                        |
| `:i <digits>`      | `number` (безопасный диапазон) / `bigint` (шире) |
| `:f <number>`      | `number`                                         |
| скаляр без маркера | `string`                                         |
| `[ ... ]`          | `Array`                                          |
| `{ ... }`          | обычный объект (порядок вставки сохраняется)     |

На сериализации `Number.isInteger(x)` выбирает `:i`; `bigint` всегда
кодируется как `:i`. `NaN` и `±Infinity` отвергаются.

### Протестировано на

Каждый рантайм прогоняет всю conformance-сьюту из 153 ассертов
(spec-фикстуры + smoke): Node 18 / 20 / 22 на Linux / macOS / Windows,
Bun на всех трёх ОС, Deno 2.x на всех трёх ОС, headless Chromium
через Playwright на всех трёх ОС.

### Благодарности

Построено поверх reference-Rust-крейта `ktav`; механика биндингов в
духе PyO3 заимствована из Python-пакета.
>>>>> lang=zh
### 类型映射

| Ktav             | JavaScript                      |
|------------------|---------------------------------|
| `null`           | `null`                          |
| `true` / `false` | `boolean`                       |
| `:i <digits>`    | `number` (安全范围) / `bigint` (更大) |
| `:f <number>`    | `number`                        |
| 裸标量              | `string`                        |
| `[ ... ]`        | `Array`                         |
| `{ ... }`        | 普通对象 (保留插入顺序)                   |

编码时，`Number.isInteger(x)` 选择 `:i`；`bigint` 始终编码为 `:i`。
`NaN` 与 `±Infinity` 会被拒绝。

### 测试覆盖

每个运行时都跑完整的 153 个断言的一致性套件（规范 fixture + 冒烟
测试）：Node 18 / 20 / 22 在 Linux / macOS / Windows 上，Bun 在
三种 OS 上，Deno 2.x 在三种 OS 上，通过 Playwright 的无头 Chromium
在三种 OS 上。

### 致谢

基于参考 `ktav` Rust crate 构建；PyO3 风格的绑定机制借鉴自 Python
包。
