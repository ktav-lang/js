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

编辑直接拼接源码，不重新序列化。编辑范围外逐字节保留注释、空白、键的拼写/顺序、BOM、EOL 风格及末尾 EOL 是否存在。

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function insertValue(source: string, textualPath: string, replacement: KtavValue): string;
function insertValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function removeValue(source: string, textualPath: string): string;
function removeValueSegments(source: string, segments: readonly string[]): string;
function renameKey(source: string, textualPath: string, newKey: string): string;
function renameKeySegments(source: string, segments: readonly string[], newKey: string): string;
```

Bun/Deno FFI 返回 `Promise<string>`；以上签名为同步导出。

- 路径使用 `.` 分隔；`\.` 表示字面点，`\\` 表示字面反斜杠。其他转义、末尾反斜杠、空路径或空段均产生 `EditInvalidPath`；`body` 是路径中的 UTF-8 字节偏移。段 API 接受已解码的字符串。Object 的数字段是键；Array 索引使用 ASCII 数字，允许前导零，不允许正负号。

- `editValue` 替换已有值；缺失键、穿过标量、无效索引和空段列表为 `EditNotFound`。`insertValue` 只向已有 Object 添加新的最后一个键（冲突时为 `EditAlreadyExists`）；不会创建中间祖先，也不向 Array 插入。`removeValue` 删除叶值、子树或 Array 元素；空祖先保留。`renameKey` 使用字面 `newKey` 重命名 Object 键，保留顺序和值；重命名为同名时逐字节不变，与现有键冲突时为 `EditAlreadyExists`。删除容器内注释不受支持。

- 失败使用十字段编辑信封：`EditInvalidPath`、`EditNotFound`、`EditAlreadyExists` 或 `EditUnsupported`；位置字段为 null。无效源码使用解析器信封。`EditUnsupported.body` 给出原因：非连续整体目标（dotted/reopened）、删除内部注释，或上下文中无法无损表示。
- 字节相同的替换是 no-op，即使拼写非规范。成功补丁会重新解析，并根据预期语义树验证；仅目标发生变化。未触及的兄弟节点不会展开。失败不返回部分补丁，也不修改源码。
- 保留 dotted、inline 与块布局；空块容器不折叠。多行替换、行长增长超过 `max(100, 原始行长)`，或单个字符串至少 4 个转义且编码开销至少 25% 时，inline 祖先才最小展开。宽度按 Unicode 标量计算；只展开受影响分支。`bigint` 和整数 `number` 保持 Integer；非整数成为 Float。
- N-API、WASM、pure 和 FFI 后端均提供 API。旧原生二进制报告版本不受支持。

### 源文本编辑示例

以下示例适用于尚未发布的 0.9 API，而非已发布的 0.8.1 包。只能替换已有值：不会重命名键、创建缺失路径或删除条目。各代码片段相互独立；Rust 的 `?` 假定外层函数返回 `Result`。Go 示例仅针对固定且有效的输入使用 panic；应用程序应处理返回的错误。

绑定示例使用无需原生二进制的独立纯实现。原生入口接收相同的路径和值：Go 的 `ktav.EditValue`、Java 的 `Ktav.editValue`、C# 的 `KtavApi.EditValue(..., KtavBackend.Native)`、PHP 的 `Ktav::editValue`、JS 包的 native/FFI 导出及 Python 的 `ktav.edit_value`。C ABI 后端要求 ABI 2；PyO3/N-API/WASM 要求兼容的 0.9 准备核心。Bun/Deno FFI 返回 promise，需要 `await`；此处 pure/Node/WASM 示例为同步调用。

```ts
import { editValue, editValueSegments } from "@ktav-lang/ktav/pure";
```

#### 1. 通过点分键修改部署配置

只修改地址；注释、点分形式及相邻的用户字段逐字节保持不变。

```ts
const source = "## deployment\ntargets.storagehost.address: old\ntargets.storagehost.user: mcp-agent\n";
const updated = editValue(source, "targets.storagehost.address", "192.168.0.88:22");
```

结果:

```ktav
## deployment
targets.storagehost.address: 192.168.0.88:22
targets.storagehost.user: mcp-agent
```

#### 2. 字面点号：文本路径或路径段

源码中带引号的键名就是 `a.b`。文本路径需要转义点号；路径段 API 直接接收解码后的键名。两个调用返回相同结果。

```ts
const source = "\"a.b\": {port: 80}\n";
const updated = editValue(source, "a\\.b.port", 90);
const same = editValueSegments(source, ["a.b", "port"], 90);
```

结果:

```ktav
"a.b": {port: 90}
```

#### 3. 修改混合形式数组中的叶子值

此处 `0` 是数组索引；在对象中，同一个路径段表示名称为 `0` 的键。未修改的容器保持行内形式。

```ts
const source = "servers: [{host: old, keep: yes}, standby]\n";
const updated = editValueSegments(source, ["servers", "0", "host"], "new");
```

结果:

```ktav
servers: [{host: new, keep: yes}, standby]
```

#### 4. 看似数字的字符串仍然是字符串

替换值是 String，而不是 Integer。raw 标记保留这种区别；需要数值时请传入类型化 Integer。

```ts
const source = "port: 8080\n";
const updated = editValue(source, "port", "9090");
```

结果:

```ktav
port:: 9090
```

#### 5. 多行替换：仅展开必要的容器

修改的数组以四空格缩进展开。未修改的对象保持行内形式，verbatim 字符串内容不会重新缩进。

```ts
const source = "a: [old, {keep: yes}]\n";
const updated = editValue(source, "a.0", "x\ny");
```

结果:

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

返回值保留 BOM 和 CRLF，且不会增加末尾换行。以下转义表示使这些字节清晰可见。

```ts
const source = "\ufeffport: 8080\r\nhost: db";
const updated = editValue(source, "port", 9090);
```

结果:

```text
"\uFEFFport: 9090\r\nhost: db"
```

展开条件固定：替换中包含多行字符串、修改后行长增长并超过 `max(100, 原始行长)`，或单个替换字符串需要至少四个转义且编码开销达到 25%。宽度按 Unicode 标量值计算，而非 UTF-8 字节或终端列。原本已很长但没有增长的行保持不变。新层级使用四空格及源文本的 EOL。若 CR 或数据行 `))` 无法无损转换为独立行，则保留有效的行内候选；这些字符不会使所有行内编辑自动失败。

#### 8. 精确替换 Integer

源文本的 Integer 域是有符号 64 位。此值超过 JavaScript Number 的安全整数范围，但仍在 i64 内；应使用精确的宿主表示，而非已舍入的浮点值。超出 i64 的类型化 Integer 无法在源码中保持 Integer 身份，因此会被拒绝而不是截断。大型文本标识符应使用 String。Float 区分负零和正零；Object 的 no-op 相等忽略键顺序，而 Array 顺序仍然重要。

```ts
const updated = editValue("n: 1\n", "n", 9007199254740993n);
```

```ktav
n: 9007199254740993
```

### 0.9 的诊断与安全失败

源码坐标为包含 BOM 的 UTF-8 字节偏移，span 使用半开区间 `[start, end)`，行号从 1 开始。支持 LF、独立 CR 和 CRLF，且 CRLF 计为一个换行。一个 Unicode 字符可能占用多个字节。

未完成的 `a: [\n` 报告 `UnclosedCompound`、第 1 行和 span `3..5`：区间从最内层未闭合的起始括号开始，而非键或行的开头。原始字节 `61 3A 20 FF`（`a: ` 后接无效 UTF-8）报告 `InvalidUtf8`、第 1 行及覆盖区间 `3..4`；`line_text` 为 null，不会通过有损解码伪造文本。UTF-8 校验优先于语法处理。

非法文本路径（包括空路径或空文本段）报告 `EditInvalidPath`，偏移按路径本身的 UTF-8 字节计算。空路径段列表、缺失键、索引越界或穿过标量下钻报告 `EditNotFound`。对象中的数字段仍是键；数组索引仅接受 ASCII 数字，允许前导零，不允许正负号。

由 dotted/reopened 定义拼成的整个中间对象可能占据多个物理范围，因此报告 `EditUnsupported`；已有叶子值仍可修改。容器结构替换不能删除内部注释。失败调用不会返回部分补丁，也不会修改传入的源码。返回文本会重新解析并进行语义检查：目标必须等于替换值，其余值树必须与原文相等。

在绑定中，无效源码会先于路径验证报告普通解析错误信封。非法 wire 载荷是无虚构源码坐标的 `Message` 错误。wire 信封包含 `error`、`reason`、`line`、`line_text`、`span`、`path`、`body`、`canonical`、`spec_section`、`message`；宿主语言的访问器名称见错误章节。`body` 分别承载 `EditInvalidPath` 的十进制路径字节偏移、`EditNotFound` 的 null，以及 `EditUnsupported` 的拒绝原因。

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
