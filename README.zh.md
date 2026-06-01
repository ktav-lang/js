# ktav (JavaScript / TypeScript)

> [Ktav](https://github.com/ktav-lang/spec) 的通用 JS/TS 绑定 —— 一种朴素的
> 配置格式。JSON 形状,无引号,无逗号,以点号串联的嵌套键。底层由 Rust
> 驱动;面向 Node 与 Bun 以原生 N-API 发布,面向 Deno、浏览器与打包器以
> WebAssembly 发布。

**语言:** [English](README.md) · [Русский](README.ru.md) · **简体中文**

**规范:** 本包实现 **Ktav 0.1**。格式独立于本包版本化维护,参见
[`ktav-lang/spec`](https://github.com/ktav-lang/spec) 的正式文档。

---

## 安装

```bash
npm install @ktav-lang/ktav
```

> **命名说明：** 短名 `ktav` 被 npm 的相似名过滤器拦下（与 `koa`、`keyv`、
> `klaw`… 过于相似），因此该包发布在 `@ktav-lang` scope 下。Rust
> （crates.io 上的 `ktav`）与 Python（PyPI 上的 `ktav`）保留短名。

一个包服务所有目标运行时:

| 运行时                              | 后端   | 加载方式                                          |
|-------------------------------------|--------|---------------------------------------------------|
| Node ≥ 18, Bun                      | N-API  | 通过 optional dep 加载平台专属 `.node`            |
| Deno, 浏览器                        | WASM   | `web` 目标,使用方 `await ready()`                |
| Webpack / Vite / Rollup / esbuild   | WASM   | `bundler` 目标,由打包器解析 `.wasm`              |

原生二进制已为 Linux (x64/arm64, glibc + musl)、macOS (x64/arm64) 与
Windows (x64/arm64) 预编译;npm 通过 `optionalDependencies` 安装与当前
主机匹配的那一个。若无匹配项,加载器会及早抛出并给出清晰的诊断信息。

## 快速开始

### 解析 —— 按类型读取字段

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
port:i 8080
ratio:f 0.75
tls: true
tags: [
    prod
    eu-west-1
]
db.host: primary.internal
db.timeout:i 30
`);

cfg.port;        // 8080 —— 类型为 number
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
```

完整可运行的 Node 示例:[`examples/node/index.mjs`](examples/node/index.mjs)。

### WASM 使用方(Deno、浏览器)

首次调用 `loads` / `dumps` 之前调用一次 `ready()` —— wasm 目标
采用延迟实例化:

```ts
import { ready, loads } from "@ktav-lang/ktav";
await ready();
loads("port:i 8080\n");
```

Node / Bun 的使用方无需此步 —— 原生二进制会在导入时加载。

### 原生 FFI 子导出(Deno、Bun)—— `@ktav-lang/ktav/ffi`

Deno 用户想要原生速度而不付出 WASM 开销,Bun 用户想用 `bun:ffi`
而非 N-API —— 都可以选择这个子导出,直接调用 C ABI 共享库
(`ktav_cabi`,与 Java / Go / .NET 绑定共用同一个二进制):

```ts
import { loads, dumps } from "@ktav-lang/ktav/ffi";

// 这里 loads / dumps 是 ASYNC(首次调用要 dlopen)
const cfg = await loads("port:i 8080\n");
const text = await dumps({ port: 8443 });
```

| 运行时   | 机制               | 权限标志                                                                |
|----------|--------------------|-------------------------------------------------------------------------|
| Deno     | `Deno.dlopen`      | `--allow-ffi=<libktav_cabi 路径>`(或不限路径的 `--allow-ffi`)          |
| Bun      | `bun:ffi`          | 无需 —— Bun 默认信任 FFI                                               |
| Node     | n/a                | 抛错 —— 改用默认导入(本身已经是 N-API 原生)                          |
| Browser  | n/a                | 抛错 —— 改用 `@ktav-lang/ktav/wasm`                                    |

库文件随对应的 `@ktav-lang/js-<rid>` optional dep 一起分发(就是
存放 `.node` 二进制的那一个),所以 `npm install @ktav-lang/ktav`
即可。本地 cabi 构建可通过 `KTAV_LIB_PATH` 覆盖。

权衡:在大文档 parse / dump 上比 WASM 快约 3–5 倍;Deno 上需要
权限授予;失去了 Deno 的"任意沙箱可用"特性。除非测过有真实需求,
否则建议保持默认导入。

可运行示例:[`examples/deno/ffi.ts`](examples/deno/ffi.ts)、
[`examples/bun/ffi.ts`](examples/bun/ffi.ts)。

## 公开 API

```ts
function loads<T = KtavValue>(s: string): T;
function dumps<T extends KtavInput = KtavInput>(obj: T): string;

// 仅 web / Deno / 浏览器;Node + Bun 忽略此函数
function ready(input?: URL | Response | ArrayBuffer): Promise<void>;
```

`loads` 上的泛型参数是**未经检查的类型断言** —— 当你已知数据形状、
希望获得 IDE 自动补全时使用。不传则得到结构化类型 `KtavValue`。

## 类型映射

| Ktav             | JavaScript                                         |
|------------------|----------------------------------------------------|
| `null`           | `null`                                             |
| `true` / `false` | `boolean`                                          |
| `:i <digits>`    | `number` (安全范围) / `bigint` (更大)              |
| `:f <number>`    | `number`                                           |
| 裸标量           | `string`                                           |
| `[ ... ]`        | `Array`                                            |
| `{ ... }`        | 普通对象 (保留插入顺序)                            |

Ktav 坚持**"不耍小聪明"** —— 裸 `port: 8080` 在解析层面仍然是字符串。
需要数字时请使用类型标记 `:i` / `:f`,或在应用层自行转换。

编码时,`Number.isInteger(x)` 决定使用 `:i` 还是 `:f`;`bigint` 始终
编码为 `:i`。`NaN` 与 `±Infinity` 会被拒绝 —— Ktav 0.1.0 不表示它们。

## 键的转义

自 spec 0.6.0 起,键段内的字面量 `.` 或 `:` 通过反斜杠书写:

```text
a\.b: v        // 键是单个段 "a.b"        → { "a.b": "v" }
a\:b: v        // 键中包含冒号            → { "a:b": "v" }
x.y\.z: v      // 只按第一个点切分        → { "x": { "y.z": "v" } }
```

键中的字面量反斜杠写作 `\\`。

## 单文件浏览器构建

`dist/wasm/web/ktav.inline.js` 是将 WASM 二进制以 base64 内嵌的变体
—— 无需同级 `.wasm` 文件,也无需 HTTP 服务器,直接放进任何
`<script type="module">`。在 `file://` 下也能工作。

```html
<script type="module">
    import init, { loads, dumps } from "https://unpkg.com/ktav/dist/wasm/web/ktav.inline.js";
    await init();
    console.log(loads("hello: world\n"));
</script>
```

代价:未压缩时体积增大约 35 %,gzip 后约 5 % —— base64 对 wasm 那种
接近随机的字节序列压缩效果很好。

## 理念

Ktav 有意保持小巧。五条设计原则
(来自 [`spec/CONTRIBUTING.md`](https://github.com/ktav-lang/spec/blob/main/CONTRIBUTING.md)):

1. **局部性** —— 一行的含义不依赖另一行。
2. **一句话** —— 任何新规则都能用规范中的一句话写完。
3. **不对空白敏感** (换行除外)。
4. **不耍小聪明** —— 格式永不替你判断 `"8080"` 是数字。
5. **显式优于机灵** —— `::` 的冗长是刻意的。

本绑定遵循同样的原则:没有 schema 推断、没有自动类型转换、没有默认值。
想要类型,请在边界层用你自己的工具 (Zod、io-ts、手写校验器) 作用在
本库返回的原生结构上。

## 相关项目

- [`ktav-lang/spec`](https://github.com/ktav-lang/spec) —— 规范的
  标准文档与跨语言一致性测试套件。
- [`ktav-lang/rust`](https://github.com/ktav-lang/rust) —— 参考 Rust
  实现。N-API crate 与 WASM crate 都对其做了封装。
- [`ktav-lang/python`](https://github.com/ktav-lang/python) —— 基于同
  一 crate 的 Python 绑定 (PyO3)。

## 版本策略

遵循 [Semantic Versioning](https://semver.org/),采用 pre-1.0 约定:
MINOR 版本升级视为破坏性。包版本与 `ktav` crate 版本同步推进。

## 开发

开发环境、跨运行时测试矩阵与贡献流程见
[CONTRIBUTING.md](CONTRIBUTING.md)。

## 支持本项目

作者有许多构想,可能对全球 IT 广泛有益 —— 不局限于 Ktav。实现这些
构想需要资金支持。如果您愿意提供帮助,请联系
**phpcraftdream@gmail.com**。

## 许可证

MIT OR Apache-2.0。详见 [LICENSE-MIT](LICENSE-MIT) 和 [LICENSE-APACHE](LICENSE-APACHE)。

## 其他 Ktav 实现

- [`spec`](https://github.com/ktav-lang/spec) —— 规范 + 一致性测试套件
- [`rust`](https://github.com/ktav-lang/rust) —— 参考 Rust crate(`cargo add ktav`)
- [`csharp`](https://github.com/ktav-lang/csharp) —— C# / .NET(`dotnet add package Ktav`)
- [`golang`](https://github.com/ktav-lang/golang) —— Go(`go get github.com/ktav-lang/golang`)
- [`java`](https://github.com/ktav-lang/java) —— Java / JVM(`io.github.ktav-lang:ktav`,Maven Central)
- [`php`](https://github.com/ktav-lang/php) —— PHP(`composer require ktav-lang/ktav`)
- [`python`](https://github.com/ktav-lang/python) —— Python(`pip install ktav`)
