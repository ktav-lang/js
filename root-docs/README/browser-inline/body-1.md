>>>>> lang=en
## Single-file browser build

`dist/wasm/web/ktav.inline.js` is a variant with the WASM binary
base64-embedded — drop it into any `<script type="module">` without a
sibling `.wasm` file and without any HTTP server. Works over `file://`.

```html
<script type="module">
    import init, { loads, dumps } from "https://unpkg.com/ktav/dist/wasm/web/ktav.inline.js";
    await init();
    console.log(loads("hello: world\n"));
</script>
```

Trade-off: ≈ 35 % bigger uncompressed, ≈ 5 % after gzip — base64
compresses well against the wasm's near-random bytes.

>>>>> lang=ru
## Однофайловая сборка для браузера

`dist/wasm/web/ktav.inline.js` — вариант с WASM-бинарником, встроенным
через base64: просто положите его в любой `<script type="module">`
без соседнего `.wasm`-файла и без HTTP-сервера. Работает и по `file://`.

```html
<script type="module">
    import init, { loads, dumps } from "https://unpkg.com/ktav/dist/wasm/web/ktav.inline.js";
    await init();
    console.log(loads("hello: world\n"));
</script>
```

Цена: ≈ 35 % больше без сжатия, ≈ 5 % после gzip — base64 хорошо
сжимается на фоне почти случайных байтов wasm.

>>>>> lang=zh
## 单文件浏览器构建

`dist/wasm/web/ktav.inline.js` 是将 WASM 二进制以 base64 内嵌的变体
—— 无需同级 `.wasm` 文件，也无需 HTTP 服务器，直接放进任何
`<script type="module">`。在 `file://` 下也能工作。

```html
<script type="module">
    import init, { loads, dumps } from "https://unpkg.com/ktav/dist/wasm/web/ktav.inline.js";
    await init();
    console.log(loads("hello: world\n"));
</script>
```

代价：未压缩时体积增大约 35 %，gzip 后约 5 % —— base64 对 wasm 那种
接近随机的字节序列压缩效果很好。

