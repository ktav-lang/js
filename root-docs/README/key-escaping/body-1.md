>>>>> lang=en
## Key escaping

Bare key segments can escape structural characters with a backslash.
For keys that need spaces, quotes, or other characters that are awkward
in bare form, quote an individual segment with `"..."`, `'...'`, or
`` `...` ``. Quoted segments support escapes such as `\uXXXX` for a
Unicode code point (spec 0.8.0, § 3.7.1):

```text
"service name": web
"a.b".child: v
"caf\u00E9": yes
```

A literal `.` or `:` in a bare segment is escaped as `\.` or `\:`;
a literal backslash is `\\`. A dot between segments remains the path
separator.

>>>>> lang=ru
## Экранирование в ключах

В голых сегментах структурные символы можно экранировать обратной
косой чертой. Если ключ содержит пробелы, кавычки или другие символы,
неудобные для голой формы, заключите отдельный сегмент в `"..."`,
`'...'` или `` `...` ``. В кавычках поддерживаются escape-последовательности,
например `\uXXXX` для кодовой точки Unicode (spec 0.8.0, § 3.7.1):

```text
"service name": web
"a.b".child: v
"caf\u00E9": yes
```

Литеральные `.` и `:` в голом сегменте записываются как `\.` и `\:`;
литеральный обратный слеш — как `\\`. Точка между сегментами остаётся
разделителем пути.

>>>>> lang=zh
## 键的转义

裸键段可以用反斜杠转义结构字符。对于含空格、引号或其他不适合
裸写的字符的键，可将单个键段用 `"..."`、`'...'` 或 `` `...` ``
括起。带引号的键段支持 escape，例如用 `\uXXXX` 表示 Unicode
码点（spec 0.8.0，§ 3.7.1）：

```text
"service name": web
"a.b".child: v
"caf\u00E9": yes
```

裸键段中的字面量 `.` 或 `:` 分别写作 `\.` 或 `\:`；字面量反斜杠
写作 `\\`。段间的点仍是路径分隔符。

