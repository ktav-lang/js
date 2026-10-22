>>>>> lang=en
## Pure TypeScript backend

`@ktav-lang/ktav/pure` is a complete Ktav parser and generator written
in pure TypeScript. It ships in the same npm package but requires no
native binary, no WASM, and no subprocess — it runs in Node, Bun,
Deno, and browsers, and works with serverless platforms and bundlers
where native add-ons are inconvenient or unavailable.

Choose `ktav/pure` when:

- you cannot (or prefer not to) install platform-specific native
  binaries — CI images, restricted environments, Alpine/musl edge
  cases;
- you bundle for the browser or a serverless runtime with a bundler
  (Webpack, Vite, esbuild) and want zero native/WASM assets;
- you need the exact same API surface everywhere, on every runtime.

```ts
// Node / Bun / Deno
import { loads, dumps } from "@ktav-lang/ktav/pure";

>>>>> lang=ru
## Чистый TypeScript-бэкенд

`@ktav-lang/ktav/pure` — полный парсер и генератор Ktav на чистом
TypeScript. Он поставляется в том же npm-пакете, но не требует
нативного бинарника, WASM или подпроцесса — работает в Node, Bun,
Deno и браузерах, а также на serverless-платформах и с бандлерами, где
нативные аддоны неудобны или недоступны.

Выбирайте `ktav/pure`, когда:

- нельзя (или не хочется) ставить платформенные нативные бинарники —
  CI-образы, ограниченные окружения, пограничные случаи Alpine/musl;
- вы бандлите для браузера или serverless-рантайма (Webpack, Vite,
  esbuild) и хотите ноль нативных/WASM-ассетов;
- нужен одинаковый API на каждом рантайме.

```ts
// Node / Bun / Deno
import { loads, dumps } from "@ktav-lang/ktav/pure";

>>>>> lang=zh
## 纯 TypeScript 后端

`@ktav-lang/ktav/pure` 是用纯 TypeScript 编写的完整 Ktav 解析器和
生成器。它与主包一起发布，但不需要原生二进制、WASM 或子进程 —— 可在
Node、Bun、Deno 和浏览器中运行，也适用于原生插件不便或不可用的
serverless 平台和打包器场景。

在以下情况选择 `ktav/pure`：

- 无法（或不想）安装平台专属的原生二进制 —— CI 镜像、受限环境、
  Alpine/musl 边缘情况；
- 为浏览器或 serverless 运行时打包（Webpack、Vite、esbuild），希望
  零原生/WASM 资源；
- 需要在每个运行时上使用完全相同的 API。

```ts
// Node / Bun / Deno
import { loads, dumps } from "@ktav-lang/ktav/pure";

