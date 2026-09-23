>>>>> lang=en

## 0.2.0 — 2026-05-07

### Changed (breaking)

- **Picked up `ktav 0.2.0`** — multi-line strings now serialize in the
  indented stripped `( ... )` form by default (verbatim `(( ... ))`
  remains as fallback for content with leading whitespace or sole-`)`
  lines). `:f 42` now accepts integer literals and parses as `42.0`.
  See the
  [`ktav` crate CHANGELOG](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#020--2026-05-07)
  for the full spec / behaviour delta.

  The JS binding itself is a thin WASM / napi wrapper — no behaviour
  change beyond what `ktav` upstream produces. Code comparing
  `stringify()` output byte-for-byte to a baked-in `((...))` literal
  must be updated; round-trip (`parse(stringify(v))` deep-equals `v`)
  is unchanged.

>>>>> lang=ru

## 0.2.0 — 2026-05-07

### Изменено (ломающие)

- **Подхвачен `ktav 0.2.0`** — многострочные строки теперь по
  умолчанию сериализуются в отступающей стёртой форме `( ... )`
  (дословная `(( ... ))` остаётся запасным вариантом для содержимого с
  ведущими пробелами или строками из одного `)`). `:f 42` теперь
  принимает целые литералы и разбирается как `42.0`. Полный diff
  спецификации / поведения — в
  [`ktav` crate CHANGELOG](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#020--2026-05-07).

  Сам JS-биндинг — тонкая обёртка WASM / napi — поведения не меняет
  сверх того, что даёт upstream `ktav`. Код, сравнивающий вывод
  `stringify()` побайтово с зашитым литералом `((...))`, должен быть
  обновлён; round-trip (`parse(stringify(v))` deep-equals `v`)
  не изменился.

>>>>> lang=zh

## 0.2.0 —— 2026-05-07

### 变更（破坏性）

- **采用 `ktav 0.2.0`** —— 多行字符串现在默认以缩进去壳的 `( ... )`
  形式序列化（原样输出的 `(( ... ))` 仍作为后备，适用于含前导空白或
  仅有 `)` 的行的内容）。`:f 42` 现在接受整数字面量，并解析为
  `42.0`。完整的规范 / 行为差异见
  [`ktav` crate CHANGELOG](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#020--2026-05-07)。

  JS 绑定本身只是 WASM / napi 的薄包装 —— 除 `ktav` 上游产生的行为
  外别无变化。将 `stringify()` 输出与内置 `((...))` 字面量逐字节比较
  的代码必须更新；round-trip（`parse(stringify(v))` 深度等于 `v`）
  保持不变。

