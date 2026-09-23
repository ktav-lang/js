>>>>> lang=en
## Type mapping

| Ktav             | JavaScript                                |
|------------------|-------------------------------------------|
| `null`           | `null`                                    |
| `true` / `false` | `boolean`                                 |
| bare integer     | `number` (safe range) / `bigint` (larger) |
| bare decimal     | `number`                                  |
| other scalar     | `string`                                  |
| `[ ... ]`        | `Array`                                   |
| `{ ... }`        | plain object (insertion-ordered)          |

Ktav types numbers by **lexical form** — a bare `port: 8080` is a
`number`, `ratio: 0.5` a float, and anything that isn't a bare number
stays a `string`. Force a numeric-looking value to stay a string with
`::` (`zip:: 01007`).

On encode, `Number.isInteger(x)` decides integer vs decimal output;
`bigint` always encodes as a bare integer. `NaN` and `±Infinity` are
rejected — Ktav does not represent them.

>>>>> lang=ru
## Соответствие типов

| Ktav             | JavaScript                                          |
|------------------|-----------------------------------------------------|
| `null`           | `null`                                              |
| `true` / `false` | `boolean`                                           |
| голое целое      | `number` (безопасный диапазон) / `bigint` (шире)    |
| голое десятичное | `number`                                            |
| прочий скаляр    | `string`                                            |
| `[ ... ]`        | `Array`                                             |
| `{ ... }`        | обычный объект (порядок вставки сохраняется)        |

Ktav типизирует числа по **лексической форме** — голый `port: 8080`
это `number`, `ratio: 0.5` — float, а всё, что не является голым
числом, остаётся `string`. Чтобы число-подобное значение осталось
строкой, форсируйте его через `::` (`zip:: 01007`).

На сериализации `Number.isInteger(x)` решает, выводить целое или
десятичное; `bigint` всегда кодируется как голое целое. `NaN` и
`±Infinity` отвергаются — Ktav их не представляет.

>>>>> lang=zh
## 类型映射

| Ktav             | JavaScript                                         |
|------------------|----------------------------------------------------|
| `null`           | `null`                                             |
| `true` / `false` | `boolean`                                          |
| 裸整数           | `number` (安全范围) / `bigint` (更大)              |
| 裸小数           | `number`                                           |
| 其他标量         | `string`                                           |
| `[ ... ]`        | `Array`                                            |
| `{ ... }`        | 普通对象 (保留插入顺序)                            |

Ktav 按**词法形式**为数字定型 —— 裸 `port: 8080` 是 `number`，
`ratio: 0.5` 是浮点数，而任何并非裸数字的内容都保持为 `string`。
要让看起来像数字的值保持为字符串，用 `::` 强制（`zip:: 01007`）。

编码时，`Number.isInteger(x)` 决定输出整数还是小数；`bigint` 始终
编码为裸整数。`NaN` 与 `±Infinity` 会被拒绝 —— Ktav 不表示它们。

