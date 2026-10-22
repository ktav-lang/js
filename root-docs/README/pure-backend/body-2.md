>>>>> lang=en
const cfg = loads(`service: web\nport: 8080\n`);
console.log(dumps(cfg));
```

```html
<script type="module">
  import { loads, dumps } from "https://esm.sh/@ktav-lang/ktav@0.8.1/pure";
  document.body.textContent = dumps(loads("hello: world"));
</script>
```

The API surface is identical to the native entry point (plus
`loadsBytes()` for parsing directly from UTF-8 bytes), and numeric
behavior matches native: integers within ±2^53 arrive as `number`,
larger ones as `BigInt` — there is no silent rounding. One inherent
limit: a JS `number` cannot carry Ktav's Integer/Float distinction
across `dumps()`/`emitCanonical()`, so object-taking emitters cannot
guarantee byte-exact canonical output for float-bearing documents —
use `canonicalFromSource()` when you need byte-exact canonical text.

The bare `.` entry point keeps the native backends (N-API/WASM/FFI)
as the default; `ktav/pure` is strictly opt-in.

>>>>> lang=ru
const cfg = loads(`service: web\nport: 8080\n`);
console.log(dumps(cfg));
```

```html
<script type="module">
  import { loads, dumps } from "https://esm.sh/@ktav-lang/ktav@0.8.1/pure";
  document.body.textContent = dumps(loads("hello: world"));
</script>
```

Поверхность API идентична нативному входу (плюс `loadsBytes()` для
разбора прямо из UTF-8 байтов), числовое поведение совпадает с
нативным: целые в пределах ±2^53 приходят как `number`, большие — как
`BigInt`, без скрытого округления. Одно принципиальное ограничение:
JS-`number` не может нести различие Integer/Float из Ktav через
`dumps()`/`emitCanonical()`, поэтому эмиттеры, принимающие объект, не
гарантируют побайтово точный канонический вывод для документов с
float'ами — для побайтово точного канонического текста используйте
`canonicalFromSource()`.

Основной вход `.` сохраняет нативные бэкенды (N-API/WASM/FFI) по
умолчанию; `ktav/pure` — строго опциональный выбор.

>>>>> lang=zh
const cfg = loads(`service: web\nport: 8080\n`);
console.log(dumps(cfg));
```

```html
<script type="module">
  import { loads, dumps } from "https://esm.sh/@ktav-lang/ktav@0.8.1/pure";
  document.body.textContent = dumps(loads("hello: world"));
</script>
```

API 表面与原生入口完全一致（外加用于直接解析 UTF-8 字节的
`loadsBytes()`），数值行为与原生一致：±2^53 以内的整数是 `number`，
更大的整数是 `BigInt` —— 没有静默舍入。一个固有限制：JS 的
`number` 无法在 `dumps()`/`emitCanonical()` 之间承载 Ktav 的
Integer/Float 区分，因此接受对象的发射器无法为含浮点数的文档保证
字节级精确的 canonical 输出 —— 需要字节级精确的 canonical 文本时请
使用 `canonicalFromSource()`。

裸入口 `.` 仍以原生后端（N-API/WASM/FFI）为默认；`ktav/pure` 严格
按需选择。

