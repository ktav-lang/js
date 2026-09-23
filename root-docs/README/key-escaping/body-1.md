>>>>> lang=en
## Key escaping

Since spec 0.6.4 a literal `.` or `:` inside a key segment is written
with a backslash:

```text
a\.b: v        // key is the single segment "a.b" → { "a.b": "v" }
a\:b: v        // key contains a colon            → { "a:b": "v" }
x.y\.z: v      // split on the first dot only     → { "x": { "y.z": "v" } }
```

A literal backslash in a key is `\\`.

>>>>> lang=ru
## Экранирование в ключах

Начиная со spec 0.6.4, литеральные `.` или `:` внутри сегмента ключа
записываются с обратным слешем:

```text
a\.b: v        // key is the single segment "a.b" → { "a.b": "v" }
a\:b: v        // key contains a colon            → { "a:b": "v" }
x.y\.z: v      // split on the first dot only     → { "x": { "y.z": "v" } }
```

Литеральный обратный слеш в ключе пишется как `\\`.

>>>>> lang=zh
## 键的转义

自 spec 0.6.4 起，键段内的字面量 `.` 或 `:` 通过反斜杠书写：

```text
a\.b: v        // key is the single segment "a.b" → { "a.b": "v" }
a\:b: v        // key contains a colon            → { "a:b": "v" }
x.y\.z: v      // split on the first dot only     → { "x": { "y.z": "v" } }
```

键中的字面量反斜杠写作 `\\`。

