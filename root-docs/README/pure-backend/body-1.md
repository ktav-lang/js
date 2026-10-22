>>>>> lang=en
## Pure TypeScript backend

`@ktav-lang/ktav/pure` is a complete Ktav parser and generator for Node, Bun, Deno, and browsers. It uses package ESM and JavaScript globals only (`TextEncoder`, `TextDecoder`, `JSON`, `BigInt`). No third-party runtime dependencies, native binaries, WASM, FFI, subprocess, network access, or fallback.

The eight optional `@ktav-lang/js-*` packages are our native binaries for the default entry; `/pure` does not resolve or load them. Build, test, and documentation tools are development-only. The default entry remains backend-specific; select `/pure` explicitly. For Node, install without optional native packages: `npm install --omit=optional @ktav-lang/ktav`.

```ts
import { loads, dumps } from "@ktav-lang/ktav/pure";

const cfg = loads(`service: web\nport: 8080\n`);
console.log(dumps(cfg));
```

For a browser without runtime network access, serve a prebundled ESM artifact and its local modules with the app; this example does not load a CDN:

```html
<script type="module">
  import { loads, dumps } from "./assets/ktav-pure.js";
  document.body.textContent = dumps(loads("hello: world"));
</script>
```

The API includes `loadsBytes()`, all parser/generator operations, and the comment-preserving formatter. Integers within ±2^53 arrive as `number`, larger ones as `BigInt`. JS `number` cannot preserve Ktav's Integer/Float distinction through object emission; use `canonicalFromSource()` for byte-exact canonical text from source. Installing, building, or distributing the package files may require network access; the pure parser and writer do not use the network at runtime.

>>>>> lang=ru
## Чистый TypeScript-бэкенд

`@ktav-lang/ktav/pure` — полный парсер и генератор Ktav для Node, Bun, Deno и браузеров. Он использует только ESM пакета и JS-глобальные объекты (`TextEncoder`, `TextDecoder`, `JSON`, `BigInt`). Сторонних runtime-пакетов, native, WASM, FFI, подпроцессов, сети или fallback нет.

Восемь optional `@ktav-lang/js-*` пакетов — наши бинарники для основного входа; `/pure` их не разрешает и не загружает. Build, test и документация относятся к разработке. Основной вход зависит от рантайма; явно выбирайте `/pure`. Node без optional-пакетов: `npm install --omit=optional @ktav-lang/ktav`.

```ts
import { loads, dumps } from "@ktav-lang/ktav/pure";

const cfg = loads(`service: web\nport: 8080\n`);
console.log(dumps(cfg));
```

Для браузера без сети во время работы раздавайте заранее собранный ESM и локальные модули вместе с приложением; пример не загружает CDN:

```html
<script type="module">
  import { loads, dumps } from "./assets/ktav-pure.js";
  document.body.textContent = dumps(loads("hello: world"));
</script>
```

API включает `loadsBytes()`, операции парсера/генератора и formatter с сохранением комментариев. Целые до ±2^53 — `number`, более крупные — `BigInt`. JS `number` не сохраняет Integer/Float при объектной эмиссии; для побайтового canonical используйте `canonicalFromSource()`. Установка, сборка или доставка файлов пакета может требовать сеть; pure parser и writer не используют сеть во время выполнения.

>>>>> lang=zh
## 纯 TypeScript 后端

`@ktav-lang/ktav/pure` 是面向 Node、Bun、Deno 和浏览器的完整解析器与生成器。它只使用包内 ESM 和 JS 全局对象（`TextEncoder`、`TextDecoder`、`JSON`、`BigInt`）。没有第三方 runtime 包、native、WASM、FFI、子进程、网络或 fallback。

八个 optional `@ktav-lang/js-*` 包是默认入口使用的自有二进制；`/pure` 不会解析或加载它们。Build、test、文档工具属于开发工具。默认入口依运行时而异；请显式选择 `/pure`。Node 省略 optional 包：`npm install --omit=optional @ktav-lang/ktav`。

```ts
import { loads, dumps } from "@ktav-lang/ktav/pure";

const cfg = loads(`service: web\nport: 8080\n`);
console.log(dumps(cfg));
```

浏览器无运行时网络时，应将预先打包的 ESM 产物和本地模块与应用一起提供；示例不加载 CDN：

```html
<script type="module">
  import { loads, dumps } from "./assets/ktav-pure.js";
  document.body.textContent = dumps(loads("hello: world"));
</script>
```

API 包括 `loadsBytes()`、全部解析/生成操作和保留注释的 formatter。±2^53 内整数为 `number`，更大为 `BigInt`。对象发射不能保留 Integer/Float 种类；字节级 canonical 源文本请用 `canonicalFromSource()`。安装、构建或分发包文件可能需要网络；pure parser 和 writer 在运行时不使用网络。

