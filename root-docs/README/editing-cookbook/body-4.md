>>>>> lang=en
```ktav
a: [
    ((
x
y
    ))
    {keep: yes}
]
```

#### 6. No-op preserves noncanonical spelling

The Integer value is already 1. Equality returns the original bytes, including `+1` and the original separator spacing; readability thresholds are bypassed.

```ts
const source = "n  : +1\n";
const updated = editValue(source, "n", 1);
if (updated !== source) throw new Error("no-op changed source");
```

Result:

```ktav
n  : +1
```

#### 7. BOM, CRLF and an unterminated final line

>>>>> lang=ru
```ktav
a: [
    ((
x
y
    ))
    {keep: yes}
]
```

#### 6. No-op сохраняет неканоническое написание

Значение Integer уже равно 1. Проверка равенства возвращает исходные байты, включая `+1` и пробелы разделителя; критерии читаемости не применяются.

```ts
const source = "n  : +1\n";
const updated = editValue(source, "n", 1);
if (updated !== source) throw new Error("no-op changed source");
```

Результат:

```ktav
n  : +1
```

#### 7. BOM, CRLF и последняя строка без перевода

>>>>> lang=zh
```ktav
a: [
    ((
x
y
    ))
    {keep: yes}
]
```

#### 6. 无变化时保留非规范拼写

Integer 的值已经是 1。相等判断直接返回原始字节，包括 `+1` 及分隔符周围的空白，不应用可读性阈值。

```ts
const source = "n  : +1\n";
const updated = editValue(source, "n", 1);
if (updated !== source) throw new Error("no-op changed source");
```

结果:

```ktav
n  : +1
```

#### 7. BOM、CRLF 及无换行符的末行

