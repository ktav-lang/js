# ktav (JavaScript / TypeScript)

[![npm](https://img.shields.io/npm/v/%40ktav-lang%2Fktav?style=flat-square&logo=npm&label=npm)](https://www.npmjs.com/package/@ktav-lang/ktav)
[![CI](https://img.shields.io/github/actions/workflow/status/ktav-lang/js/ci.yml?style=flat-square&logo=github&label=CI)](https://github.com/ktav-lang/js/actions)
![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue?style=flat-square)
[![Playground](https://img.shields.io/badge/playground-try%20online-7c3aed?style=flat-square&logo=rocket&logoColor=white)](https://ktav-lang.github.io/)

> [Ktav](https://github.com/ktav-lang/spec) 的通用 JS/TS 绑定 —— 一种朴素的
> 配置格式。形状与 JSON 相同，常规键和值无需引号，无逗号，嵌套键以点号串联。底层由
> Rust 驱动；面向 Node 与 Bun 以原生 N-API 发布，面向 Deno、浏览器与
> 打包器以 WebAssembly 发布。

**Languages:** [English](../../README.md) · [Русский](../ru/README.ru.md) · **简体中文**

**演练场：** 在浏览器中互转 JSON / YAML / TOML / INI ⇄ Ktav —— **[ktav-lang.github.io](https://ktav-lang.github.io/)**。

**规范：** 本包实现 **Ktav**。该格式独立于本包版本化维护，正式文档见
[`ktav-lang/spec`](https://github.com/ktav-lang/spec)。

---

## 安装

```bash
npm install @ktav-lang/ktav
```

> **命名说明：** 短名 `ktav` 被 npm 的相似名过滤器拦下（与 `koa`、`keyv`、
> `klaw`… 过于相似），因此该包发布在 `@ktav-lang` scope 下。Rust
> （crates.io 上的 `ktav`）与 Python（PyPI 上的 `ktav`）保留短名。

一个包服务所有目标运行时：

| 运行时                              | 后端   | 加载方式                                          |
|-------------------------------------|--------|---------------------------------------------------|
| Node ≥ 18, Bun                      | N-API  | 通过 optional dep 加载平台专属 `.node`            |
| Deno, 浏览器                        | WASM   | `web` 目标，使用方 `await ready()`                 |
| Webpack / Vite / Rollup / esbuild   | WASM   | `bundler` 目标，由打包器解析 `.wasm`              |

原生二进制已为 Linux (x64/arm64, glibc + musl)、macOS (x64/arm64) 与
Windows (x64/arm64) 预编译；npm 通过 `optionalDependencies` 安装与当前
主机匹配的那一个。这八个 optional `@ktav-lang/js-*` 包是本项目自有的
平台二进制产物，并非第三方 runtime 依赖。若没有匹配项，默认原生
加载器会及早抛出清晰的诊断信息。

Node 使用方若明确只导入 `@ktav-lang/ktav/pure`，安装时可省略
optional 包：

```sh
npm install --omit=optional @ktav-lang/ktav
```

根包没有第三方 runtime 依赖。构建、测试和文档工具仅用于开发。
有关 `/pure` 导入方式和 runtime 要求，请参阅[纯 TypeScript 后端](#纯-typescript-后端)。

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

## 快速开始

### 解析 —— 从解析结果中按类型读取字段

```ts
import { loads, dumps } from "@ktav-lang/ktav";

interface DB { host: string; timeout: number; }
interface Config {
  service: string;
  port:    number;
  ratio:   number;
  tls:     boolean;
  tags:    string[];
  db:      DB;
}

const cfg = loads<Config>(`
service: web
port: 8080
ratio: 0.75
tls: true
tags: [
    prod
    eu-west-1
]
db.host: primary.internal
db.timeout: 30
`);

cfg.port;        // 8080 — typed as number
cfg.db.timeout;  // 30
```

### 构建并渲染 —— 用代码搭建文档

```ts
const doc = {
  name:  "frontend",
  port:  8443,
  tls:   true,
  ratio: 0.95,
  upstreams: [
    { host: "a.example", port: 1080 },
    { host: "b.example", port: 1080 },
  ],
  notes: null,
};
const text = dumps(doc);
// name: frontend
// port: 8443
// tls: true
// ratio: 0.95
// upstreams: [
//     { host: a.example  port: 1080 }
//     { host: b.example  port: 1080 }
// ]
// notes: null
```

完整可运行的 Node 示例见 [`examples/node/index.mjs`](../../examples/node/index.mjs)。

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

### WASM 使用方 (Deno、浏览器)

在首次调用 `loads` / `dumps` 之前调用一次 `ready()` —— wasm 目标采用
延迟实例化：

```ts
import { ready, loads } from "@ktav-lang/ktav";
await ready();
loads("port: 8080\n");
```

Node / Bun 使用方无需此步 —— 原生二进制在导入时即加载。

### 原生 FFI 子导出 (Deno、Bun) —— `@ktav-lang/ktav/ffi`

Deno 用户想要原生速度而不付 WASM 开销，Bun 用户想用 `bun:ffi`
而非 N-API —— 都可以选择这个子导出，它直接调用 C ABI 共享库
(`ktav_cabi`，即 Java / Go / .NET 绑定共用的同一个二进制)：

```ts
import { loads, loadsStrict, dumps } from "@ktav-lang/ktav/ffi";

// loads / dumps are ASYNC here (waiting on dlopen on first call)
const cfg = await loads("port: 8080\n");
await loadsStrict("port: 8080\n");
const text = await dumps({ port: 8443 });
```

| Runtime  | 机制               | 权限标志                                                                   |
|----------|--------------------|----------------------------------------------------------------------------|
| Deno     | `Deno.dlopen`      | `--allow-ffi=<path-to-libktav_cabi>`（或不限目标的 `--allow-ffi`）         |
| Bun      | `bun:ffi`          | 无需 —— Bun 默认信任 FFI                                                   |
| Node     | n/a                | 抛错 —— 请改用默认导入（本身已是 N-API 原生）                              |
| Browser  | n/a                | 抛错 —— 请改用 `@ktav-lang/ktav/wasm`                                     |

库文件随对应的 `@ktav-lang/js-<rid>` optional dep 一起分发（就是存放
`.node` 二进制的那一个），因此 `npm install @ktav-lang/ktav` 即可 ——
无需单独下载。本地 cabi 构建可用 `KTAV_LIB_PATH` 覆盖。

权衡：在大文档 parse / dump 上比 WASM 快约 3–5 倍；在 Deno 上需要
授权；失去了 Deno“任意沙箱皆可运行”的特性。除非测出真实需求，
否则请保持默认导入。

可运行示例：[`examples/deno/ffi.ts`](../../examples/deno/ffi.ts)、
[`examples/bun/ffi.ts`](../../examples/bun/ffi.ts)。

## 公开 API

```ts
function loads<T = KtavValue>(s: string): T;
function loadsStrict<T = KtavValue>(s: string): T;
function dumps<T extends KtavInput = KtavInput>(obj: T): string;
function stringifyForceStrings<T extends KtavInput = KtavInput>(obj: T): string;
function format(s: string): string;
function canonicalFromSource(s: string): string;
function emitCanonical<T extends KtavInput = KtavInput>(obj: T): string;
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;

// web / Deno / browser only; Node + Bun ignore it
function ready(input?: URL | Response | ArrayBuffer): Promise<void>;
```

`loadsStrict` 会执行 canonical scalar 校验：拒绝有损写法，同时接受
canonical writer 生成的形式。

`stringifyForceStrings` 的输出与 `dumps` 一致，但会把每个叶子标量 ——
integer、float、boolean、`null` —— 通过原始标记（`::`）压平为文本形式。
复合值保持其结构，结果经 `loads` 解析回来仍是同一组 String 标量。

> **尚未发布（0.9 准备版本）：** 这些编辑 API 和更新后的诊断不包含在已发布的 0.8.1 包中。原生后端需要固定的 0.9 核心（C-FFI 使用 C ABI 2）；纯实现仍完全独立。

## 源码编辑（spec 0.9）

两个操作在**现有文档内部**替换一个值，方式是对源文本做拼接（splice）
而不是重新序列化：注释、空白、键的拼写与顺序、BOM、CR / LF / CRLF 风格
（以及末尾换行符的有无）在有效编辑范围之外逐字节保留：

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
```

- **只替换已存在的值。** 不支持创建、删除或重命名。缺失的键、穿过标量的
  下行、越界或非数字的数组索引、空段列表都会抛出 `EditNotFound`。
- **路径。** `textualPath` 是点分形式 `key1.key2.0.key4`；段内 `\.` 表示
  字面点号，`\\` 表示字面反斜杠；任何其他转义、结尾孤立的反斜杠或空段
  都会抛出 `EditInvalidPath`，`body` 是路径参数中出错位置的十进制
  **UTF-8 字节偏移**。`editValueSegments` 接收已解码的字面段，不做额外
  反转义。数字段在 Object 中是字符串键，在 Array 中是从零开始的
  ASCII 数字索引（允许前导零，不允许符号）。
- **错误**是通常的十字段 envelope，
  `error === "EditInvalidPath" | "EditNotFound" | "EditUnsupported"`；
  所有位置字段为 null（编辑失败不是解析错误）。`EditUnsupported.body`
  携带原因：非连续（dotted-key / reopen）的整体目标、会删除容器内部
  注释的结构性替换、或包含一行 `))` 的多行字符串——不存在无损形式。
- **保证。** 字节相同的替换是字节相同的 no-op，即使拼写非规范亦然。
  每个成功的补丁都会重新解析并做语义校验：恰好替换目标值，其余树相等。
  无效的源文本抛出解析器自己的 envelope，而不是编辑错误。
- **版式。** dotted、inline 与块形态均被保留，包括完整的 inline 容器和
  被清空（但不折叠）的块容器。当出现多行字符串、行宽超过
  `max(100 个 Unicode 标量, 原行宽)`，或替换需要 ≥ 4 个转义且开销
  ≥ 25 % 时，inline 包装沿被触及的分支最小展开。替换值是 JS 值：
  `bigint` 与整数 `number` 保持精确的 Integer 形式，非整数则成为
  Float。

所有后端均可用：`@ktav-lang/ktav`（N-API）、`/wasm`、`/pure` 以及
`/ffi` 子导出（Bun / Deno，异步）。早于 0.9 内核的原生二进制会报告
清晰的版本不支持错误，而不是静默回退。

有三个函数都产生规范输出，而它们并不可以互换：

| | 输入 | 注释 | 标量的写法 |
| --- | --- | --- | --- |
| `format(s)` | 源文本 | **保留** | 保留 |
| `canonicalFromSource(s)` | 源文本 | 丢弃 | 保留 |
| `emitCanonical(obj)` | JS 值 | 无注释可留 | 可能改变 |

`canonicalFromSource` 是文本进、规范文本出，中间没有 JavaScript 值，
因此 `1.0`、`1e9` 与 `-0.0` 都能逐字节保留。`emitCanonical` 无法给出
这个保证：JS 的 `number` 表达不了 Ktav 的 Integer/Float 之分，所以
`1.0` 到达时与 `1` 无从区分。手上是值时用 `emitCanonical`，手上是文档
时用 `canonicalFromSource`。

`loads` 上的泛型参数是**未经检查的类型断言** —— 当你已知数据形状、
希望获得 IDE 自动补全时使用。不传则得到结构化类型 `KtavValue`。

## 错误

绑定抛出的每一个错误都是类型化的 `KtavError`，携带
`ktav::ErrorEnvelope` 的十个字段：
`error`（类别，如 `"UnclosedCompound"`）、`reason`（稳定的 writer 阶段
错误码）、`line`、`line_text`、`span`（`{start, end}` —— UTF-8 源文本的
**字节**偏移量，而非 UTF-16 索引）、`path`（由精确解码的键段组成的数组，
绝不是拼接后的字符串）、`body`、`canonical`、`spec_section` 和 `message`。
消息逐字取用，绝不由其他字段拼装，也绝不包含原始 JSON。某个具体错误不具备的字段
为 `null`。

```ts
import { loads } from "@ktav-lang/ktav";

try {
  loads("a: [");
} catch (e) {
  e.name;          // "KtavError"
  e.error;         // "UnclosedCompound"
  e.line_text;     // "a: ["
  e.span;          // { start: 3, end: 4 } — UTF-8 byte offsets
  e.spec_section;  // "§6.1"
  e.message;       // "Syntax error: Unclosed array at end of input"
}
```

## 类型映射

| Ktav             | JavaScript                                         |
|------------------|----------------------------------------------------|
| `null`           | `null`                                             |
| `true` / `false` | `boolean`                                          |
| 裸整数           | `number` (安全范围) / `bigint` (更大)              |
| 裸小数           | `number`                                           |
| 其他标量         | `string`                                           |
| `[ ... ]`        | `Array`                                            |
| `{ ... }`        | 普通对象 (保留插入顺序)                            |

Ktav 按**词法形式**为数字定型 —— 裸 `port: 8080` 是 `number`，
`ratio: 0.5` 是浮点数，而任何并非裸数字的内容都保持为 `string`。
要让看起来像数字的值保持为字符串，用 `::` 强制（`zip:: 01007`）。

编码时，`Number.isInteger(x)` 决定输出整数还是小数；`bigint` 始终
编码为裸整数。`NaN` 与 `±Infinity` 会被拒绝 —— Ktav 不表示它们。

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

## 理念

Ktav 有意保持小巧。五条设计原则
(来自 [`spec/CONTRIBUTING.md`](https://github.com/ktav-lang/spec/blob/main/CONTRIBUTING.md)):

1. **局部性** —— 一行的含义不依赖另一行。
2. **一句话** —— 任何新规则都能用规范中的一句话写完。
3. **不对空白敏感** (换行除外)。
4. **不耍小聪明** —— 格式永不替你判断 `"8080"` 是数字。
5. **显式优于机灵** —— `::` 的冗长是刻意的。

本绑定遵循同样的原则：没有 schema 推断、没有自动类型转换、没有默认值。
想要类型，请在边界层用你自己的工具 (Zod、io-ts、手写校验器) 作用在
本库返回的原生结构上。

## 相关项目

- [`ktav-lang/spec`](https://github.com/ktav-lang/spec) —— 规范的
  标准文档与跨语言一致性测试套件。
- [`ktav-lang/rust`](https://github.com/ktav-lang/rust) —— 参考 Rust
  实现。N-API crate 与 WASM crate 都对其做了封装。
- [`ktav-lang/python`](https://github.com/ktav-lang/python) —— 基于同
  一 crate 的 Python 绑定 (PyO3)。

## 版本策略

遵循 [Semantic Versioning](https://semver.org/)，采用 pre-1.0 约定：
MINOR 版本升级视为破坏性。包版本与 `ktav` crate 版本同步推进。

## 开发

开发环境、跨运行时测试矩阵与贡献流程见
[CONTRIBUTING.md](../CONTRIBUTING.md)。

## 支持本项目

作者有许多构想，可能对全球 IT 广泛有益 —— 不局限于 Ktav。实现这些
构想需要资金支持。如果您愿意提供帮助，请联系
**phpcraftdream@gmail.com**。

## 许可证

MIT OR Apache-2.0。详见 [LICENSE-MIT](../../LICENSE-MIT) 和 [LICENSE-APACHE](../../LICENSE-APACHE)。

## 其他 Ktav 实现

- [`spec`](https://github.com/ktav-lang/spec) —— 规范 + 一致性测试套件
- [`rust`](https://github.com/ktav-lang/rust) —— 参考 Rust crate（`cargo add ktav`）
- [`csharp`](https://github.com/ktav-lang/csharp) —— C# / .NET（`dotnet add package Ktav`）
- [`golang`](https://github.com/ktav-lang/golang) —— Go（`go get github.com/ktav-lang/golang`）
- [`java`](https://github.com/ktav-lang/java) —— Java / JVM（`io.github.ktav-lang:ktav`，Maven Central）
- [`php`](https://github.com/ktav-lang/php) —— PHP（`composer require ktav-lang/ktav`）
- [`python`](https://github.com/ktav-lang/python) —— Python（`pip install ktav`）
