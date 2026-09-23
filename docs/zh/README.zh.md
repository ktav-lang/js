# ktav (JavaScript / TypeScript)

[![npm](https://img.shields.io/npm/v/%40ktav-lang%2Fktav?style=flat-square&logo=npm&label=npm)](https://www.npmjs.com/package/@ktav-lang/ktav)
[![CI](https://img.shields.io/github/actions/workflow/status/ktav-lang/js/ci.yml?style=flat-square&logo=github&label=CI)](https://github.com/ktav-lang/js/actions)
![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue?style=flat-square)
[![Playground](https://img.shields.io/badge/playground-try%20online-7c3aed?style=flat-square&logo=rocket&logoColor=white)](https://ktav-lang.github.io/)

> [Ktav](https://github.com/ktav-lang/spec) 的通用 JS/TS 绑定 —— 一种朴素的
> 配置格式。形状与 JSON 相同，无引号，无逗号，嵌套键以点号串联。底层由
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
主机匹配的那一个。若无匹配项，加载器会及早抛出并给出清晰的诊断信息。

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

// web / Deno / browser only; Node + Bun ignore it
function ready(input?: URL | Response | ArrayBuffer): Promise<void>;
```

`loadsStrict` 会执行 canonical scalar 校验：拒绝有损写法，同时接受
canonical writer 生成的形式。

`stringifyForceStrings` 的输出与 `dumps` 一致，但会把每个叶子标量 ——
integer、float、boolean、`null` —— 通过原始标记（`::`）压平为文本形式。
复合值保持其结构，结果经 `loads` 解析回来仍是同一组 String 标量。

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

绑定抛出的每一个错误都是类型化的 `KtavError`，携带另外九个结构化字段：
`error`（类别，如 `"UnclosedCompound"`）、`reason`（稳定的 writer 阶段
错误码）、`line`、`line_text`、`span`（`{start, end}` —— UTF-8 源文本的
**字节**偏移量，而非 UTF-16 索引）、`path`（由精确解码的键段组成的数组，
绝不是拼接后的字符串）、`body`、`canonical` 与 `spec_section`——此外，
自 ktav 0.8.0 起还有 `message`：信封自身的第十个字段，逐字取用，绝不由
其余九个字段拼装而成。它绝不包含原始 JSON。某个具体错误不具备的字段
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

自 spec 0.6.4 起，键段内的字面量 `.` 或 `:` 通过反斜杠书写：

```text
a\.b: v        // key is the single segment "a.b" → { "a.b": "v" }
a\:b: v        // key contains a colon            → { "a:b": "v" }
x.y\.z: v      // split on the first dot only     → { "x": { "y.z": "v" } }
```

键中的字面量反斜杠写作 `\\`。

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
