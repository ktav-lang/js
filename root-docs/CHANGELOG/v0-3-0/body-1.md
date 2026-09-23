>>>>> lang=en

## 0.3.0 — 2026-05-08

### Changed (breaking)

- **Picked up `ktav 0.3.0`** — `key: (value)` and `key: ((value))`
  now error with `ErrorKind::InlineNonEmptyCompound { body: "paren-string" }`
  rather than parsing as plain string scalars. These shapes were
  visually indistinguishable from multi-line openers and would
  confuse readers; the raw-marker form `key:: (value)` remains the
  canonical way to encode such literals. The `ktav-lsp` formatter
  auto-rewrites the legacy form on save. See the
  [`ktav` crate CHANGELOG](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#030--2026-05-08)
  for the full delta.

  The JS binding is a thin WASM / napi wrapper — no behaviour change
  beyond what `ktav` upstream produces. Inputs that previously parsed
  as `(value)` strings now throw a parse error; round-trip
  (`parse(stringify(v))` deep-equals `v`) is unchanged.

>>>>> lang=ru

## 0.3.0 — 2026-05-08

### Изменено (ломающие)

- **Подхвачен `ktav 0.3.0`** — `key: (value)` и `key: ((value))`
  теперь дают ошибку `ErrorKind::InlineNonEmptyCompound { body: "paren-string" }`
  вместо разбора как обычных строковых скаляров. Эти формы были
  визуально неотличимы от многострочных открывателей и путали читателя;
  форма с сырым маркером `key:: (value)` остаётся каноническим
  способом закодировать такие литералы. Форматтер `ktav-lsp`
  автоматически перезаписывает легаси-форму при сохранении. Полный
  diff — в
  [`ktav` crate CHANGELOG](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#030--2026-05-08).

  JS-биндинг — тонкая обёртка WASM / napi — поведения не меняет
  сверх того, что даёт upstream `ktav`. Входы, которые раньше
  разбирались как строки `(value)`, теперь бросают ошибку разбора;
  round-trip (`parse(stringify(v))` deep-equals `v`) не изменился.

>>>>> lang=zh

## 0.3.0 —— 2026-05-08

### 变更（破坏性）

- **采用 `ktav 0.3.0`** —— `key: (value)` 和 `key: ((value))` 现在会
  报错 `ErrorKind::InlineNonEmptyCompound { body: "paren-string" }`，
  而不再解析为普通字符串标量。这些形状与多行开括号在视觉上无法区分，
  会令读者困惑；带裸标记的形式 `key:: (value)` 仍是编码此类字面量的
  规范方式。`ktav-lsp` 格式化器会在保存时自动重写旧形式。完整差异见
  [`ktav` crate CHANGELOG](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#030--2026-05-08)。

  JS 绑定只是 WASM / napi 的薄包装 —— 除 `ktav` 上游产生的行为外
  别无变化。此前解析为 `(value)` 字符串的输入现在会抛出解析错误；
  round-trip（`parse(stringify(v))` 深度等于 `v`）保持不变。

