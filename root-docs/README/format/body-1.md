>>>>> lang=en
### Format — comment-preserving formatter

```ts
import { format } from "@ktav-lang/ktav";

format(`
port: 8080

## the port

host: localhost
`);
// port: 8080
//
// ## the port
//
// host: localhost
```

`format` guarantees: every comment is preserved verbatim; runs of
blank lines collapse to exactly one; key order is never changed; it is
a fixed point (`format(format(x)) === format(x)`); and its output
equals the canonical writer's exactly when the document has no
comments and no blank lines.

>>>>> lang=ru
### Форматирование — форматтер с сохранением комментариев

```ts
import { format } from "@ktav-lang/ktav";

format(`
port: 8080

## the port

host: localhost
`);
// port: 8080
//
// ## the port
//
// host: localhost
```

Гарантии `format`: каждый комментарий сохраняется дословно; серии
пустых строк схлопываются ровно в одну; порядок ключей никогда не
меняется; это фиксированная точка (`format(format(x)) === format(x)`);
и его вывод совпадает с выдачей canonical writer'а тогда и только
тогда, когда в документе нет ни комментариев, ни пустых строк.

>>>>> lang=zh
### 格式化 —— 保留注释的格式化器

```ts
import { format } from "@ktav-lang/ktav";

format(`
port: 8080

## the port

host: localhost
`);
// port: 8080
//
// ## the port
//
// host: localhost
```

`format` 的保证：每条注释都逐字保留；连续空行折叠为恰好一行空行；
键的顺序永不改变；它是定点变换（`format(format(x)) === format(x)`）；
当且仅当文档中既无注释也无空行时，其输出与 canonical writer 的输出
完全一致。

