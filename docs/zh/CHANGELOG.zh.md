# Changelog

**Languages:** [English](../../CHANGELOG.md) · [Русский](../ru/CHANGELOG.ru.md) · **简体中文**

本文档记录 JavaScript / TypeScript 绑定的所有重要变更。格式基于
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本采用
[Semantic Versioning](https://semver.org/)，遵循 pre-1.0 约定：
MINOR 版本升级视为破坏性。

本 changelog 跟踪**包发布**，不涉及 Ktav 格式本身的变更 —— 后者见
[`ktav-lang/spec`](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md)。

## 0.8.0

### 新增

- 新增 `format()`（保留注释的格式化器）和 `emitCanonical()`，并在每个
  入口暴露：Node N-API、Bun、Deno、浏览器/bundler WASM，以及 Deno/Bun
  的 FFI 子导出（由新的 C ABI 符号 `ktav_format` / `ktav_emit_canonical`
  支持）。`format()` 的保证：每条注释都逐字保留；连续空行折叠为恰好
  一行空行；键的顺序永不改变；它是定点变换
  （`format(format(x)) === format(x)`）；当且仅当文档中既无注释也无
  空行时，其输出与 canonical writer 的输出完全一致。
- 新增 `canonicalFromSource(s)` —— 文本到文本的入口，从源文本产生
  字节级精确的 canonical 输出。它存在的原因是：JS 的 number 无法承载
  Ktav 的 Integer/Float 区分，因此接受对象的 `emitCanonical({})`
  无法为含浮点数的文档产生字节级精确的 canonical 文本。
- Conformance 套件现在会在每个运行时上将 writer 输出与语料库的
  `.canonical.ktav` fixture 进行字节级比较，运行格式化器不动点测试，
  并断言结构化错误 envelope 字段。

### 变更

- Conformance 运行器已更新至 spec 0.7 语料库：新增的 `unrepresentable/`
  （5 个 writer 拒绝 fixture）和 `parseable-unrepresentable/`（4 个
  先解析后拒绝 fixture）类别现在会在每个运行时上执行。
- `invalid/` fixture 现在会断言每个 fixture 的 JSON oracle 所预期的
  错误类别，`invalid_utf8/` fixture 则在字节→字符串边界通过严格 UTF-8
  解码校验（原始字节即 fixture 本身）。
- 新增 spec 0.7 冒烟测试：带引号的键（§ 5.3.3）和 `\uXXXX` 转义
  （§ 3.7.1），包括 lone-surrogate 拒绝和 U+0000 键 round-trip。
- 绑定抛出的每个错误现在都是携带 `ktav::ErrorEnvelope` 全部十个字段的
  类型化 `KtavError`（`error`、`reason`、`line`、`line_text`、`span`
  —— UTF-8 字节偏移，`path` —— 精确键段数组，`body`、`canonical`、
  `spec_section`、`message`）；消息保持人类可读，且绝不包含原始 JSON。
  这是对绑定在失败时呈现的文本的破坏性变更 —— 依赖消息字符串进行匹配的
  调用方会注意到（有意为之；envelope 从未在任何绑定中发布过）。

- `crates/cabi`/`crates/napi`/`crates/wasm` 改为单次调用
  `ktav::declare_cabi!()`（ktav 的 `cabi` 特性），取代手写的 C ABI
  垫片；导出的符号集不变，因此 JS/TS API 不受影响。依赖下限提升至
  `ktav = "0.8"`，三个 crate 的 `[package.metadata.ktav] spec-version`
  均设为 `"0.8.0"`，spec 子模块重新固定到 `v0.8.0`（新增 § 5.2：
  带有多余前导零的十进制数解析为 String，而非 Integer）。
- 包版本升至 **0.8.0**，与核心和规范同步。
- `npm publish` 现在带 `--provenance` 运行，以启用 npm 的 Trusted
  Publishing（OIDC），取代长期有效的 `NPM_TOKEN`。
- 一致性测试套件读取 `spec/versions/0.8/tests`(子模块重新固定到
  `0.8.0` 之后，它一直静默读取过期的 `0.7` 语料——路径是硬编码的，
  并非从固定版本推导而来），并执行语料中的每个类别，包括新增的
  `strict-lossy/`（`loads()` 必须等于 lax 值，`loadsStrict()` 必须以
  匹配的原因、body 与规范形式抛出异常）。一个 guard 测试会在语料中
  出现无法识别的类别目录时使构建失败，以防止这个问题再次悄然发生。

### 修复

- N-API：包含 U+0000 的对象键 —— 在 spec 0.7 中通过新增的 `\uXXXX`
  转义合法 —— 不再因 `nul byte found in provided data` 失败；键的
  设置/读取现在走基于 JsString 的 property API，而不是基于 CString
  的命名属性调用。

## [0.6.4] — 2026-08-23

与 Ktav 规范和 Rust core 0.6.4 同步。

### 新增

- WASM、N-API 和 C-ABI FFI 入口新增 `loadsStrict()`，用于严格检查
  canonical scalar。canonical 的科学计数法浮点形式会被接受。

### 修复

- 移除 WASM 和 N-API 中重复的顶层数组包装，嵌套数组现在可无多余层级
  地 round-trip。
- 本地 N-API 构建和 FFI 测试路径现在遵循 `CARGO_TARGET_DIR`。

### 变更

- 包、平台子包、workspace metadata 和 lockfile 版本统一为 `0.6.4`。
- Rust 依赖使用 `ktav = "0.6"`，lockfile 解析到 `0.6.4`。
- 规范 submodule 固定到已发布的 Ktav 0.6.4 提交。

## [0.6.1] — 2026-06-05

- 文档：将所有 README 示例改写为 spec 0.6 语法（裸数字替代已移除的 `:i`/`:f` 标记；`##` 注释替代 `#`）。

## 0.6.0 —— 2026-06-01

同步至 Ktav 0.6.0 —— 键现在支持转义。

### 新增

- 键处理完整的 §3.7 转义集合，并新增两个转义：
  - `\.` → `.`（字面量点 —— **不**会切分 dotted-path）
  - `\:` → `:`（字面量冒号 —— **不**作为键/值分隔符）
- 示例：`a\.b: v` → `{"a.b": "v"}`，`a\:b: v` → `{"a:b": "v"}`，
  `x.y\.z: v` → `{"x": {"y.z": "v"}}`。

### 破坏性变更

- 键中的字面量反斜杠现在需要写作 `\\`（此前键中的 `\` 是普通字节）。
  实际中很少出现；按 pre-1.0 SemVer 为 MINOR bump。

### 变更

- 跟踪 ktav-rust 0.6.0 / Ktav 规范 0.6.0。绑定源码未改动 —— escape
  语义的变化完全在 Rust 内核中实现，WASM / N-API / FFI 路径均透明。

---

## 0.5.0 —— 2026-05-28

跟踪 [`ktav 0.5.0`](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#050--2026-05-28)
和 [spec 0.5.0](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md#050--2026-05-28)。

### 新增

- **`emitCanonical`** —— WASM 和 N-API 均新增导出；返回符合 spec 0.5.0
  的规范化、round-trip 稳定表示。它镜像 Rust crate 中的
  `ktav::emit_canonical`。
- **Spec 0.5.0 一致性测试** —— 测试运行器现在读取
  `spec/versions/0.5/tests`，并覆盖完整的 0.5.0 fixture 集合。

### 变更

- **许可证** —— 双重许可 `MIT OR Apache-2.0`（之前为 `MIT`）。
  `LICENSE-MIT` 和 `LICENSE-APACHE` 均包含在 npm 包中。
- Spec 子模块更新至标签 `v0.5.0`（提交 `4d0a8aa`）。

## 0.3.1 —— 2026-05-10

向后兼容的功能发布版本，跟踪
[`ktav 0.3.1`](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#031--2026-05-10)
和 [spec 0.1.1](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md#011--2026-05-10)。

### 新增

- **顶层 Array 支持**（spec § 5.0.1）—— 若文档的第一个内容行具有数组
  项形状（裸标量、`:: text`、`:i 42`、`:f 3.14`、单独的 `{` / `[`，
  或多行开括号 `(` / `((`），现在会 `loads` 为根级 JS `Array`。此前
  解析器要求根必须是 Object，并将此类输入作为 `MissingSeparator`
  拒绝。`dumps` 现在也接受顶层数组，并按裸形式渲染（每项一行，
  不包裹 `[...]`）。空文档或仅含注释的文档仍默认为空 Object
  （保持 0.3.0 的行为）。`KtavInput` 已扩展为
  `Record<string, unknown> | unknown[]`。
- **`stringifyForceStrings(value)`** —— 在每个运行时入口
  （`node`、`web`、`bundler`、Deno + Bun 的 `/ffi`）导出的新函数。
  将 JS 值渲染为 Ktav 文档，所有标量一律强制为 String —— 类型化整数
  （`:i`）、类型化浮点（`:f`）、布尔值和 `null` 都会被展平为文本
  形式；连接结构保持原样。经由 `loads` 的 round-trip 会得到同一组
  String 标量。适用于为不理解类型化标记的下游消费者生成“全字符串”
  转储，或生成利于 diff 的 canonical 文本。是围绕上游 Rust 函数
  `ktav::to_string_force_strings` 的、符合 JS 习惯的 camelCase 包装。
- 新增 cabi 导出 `ktav_dumps_force_strings`，其 JSON-wire 契约与
  `ktav_dumps` 相同，驱动 Deno + Bun 上的 FFI 子导出。

### 兼容性

变更为纯增量。所有在 0.3.0 下有效的文档在 0.3.1 下依然有效，并产生
相同的 JS 值（仍为 Object）。只有 0.3.0 中以 `MissingSeparator` 拒绝的
输入（首行为裸标量）现在会被接受为数组。此前 `dumps` 会以
"must be an object" 拒绝顶层数组；该错误已消失。依赖该拒绝行为的代码
应重新调整其输入。

### 规范

- spec 子模块同步至 `0.1.1`（顶层 Array fixture 添加于
  `valid/top_level_array/` 与 `invalid/top_level/`）。


## 0.3.0 —— 2026-05-08

### 变更（破坏性）

- **采用 `ktav 0.3.0`** —— `key: (value)` 和 `key: ((value))` 现在会
  报错 `ErrorKind::InlineNonEmptyCompound { body: "paren-string" }`，
  而不再解析为普通字符串标量。这些形状与多行开括号在视觉上无法区分，
  会令读者困惑；带裸标记的形式 `key:: (value)` 仍是编码此类字面量的
  规范方式。`ktav-lsp` 格式化器会在保存时自动重写旧形式。完整差异见
  [`ktav` crate CHANGELOG](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#030--2026-05-08)。

  JS 绑定只是 WASM / napi 的薄包装 —— 除 `ktav` 上游产生的行为外
  别无变化。此前解析为 `(value)` 字符串的输入现在会抛出解析错误；
  round-trip（`parse(stringify(v))` 深度等于 `v`）保持不变。

### 修复

- **`DuplicateKey` / `KeyPathConflict` 的诊断 span** 现在指向有问题的
  键，而不再指向该连接的结尾 `}` / `]`。消费绑定错误消息的编辑器 /
  IDE 会因此将键的位置标注出来。这是来自上游的 span 取值修复；
  API 无变化。

### 规范

- spec 子模块已同步（paren-string 处理收紧 —— 针对
  `inline_paren_string_double` / `inline_paren_string_single` 的
  fixture 加入 invalid；`partial_parens` 从 valid 中移除）。


## 0.2.0 —— 2026-05-07

### 变更（破坏性）

- **采用 `ktav 0.2.0`** —— 多行字符串现在默认以缩进去壳的 `( ... )`
  形式序列化（原样输出的 `(( ... ))` 仍作为后备，适用于含前导空白或
  仅有 `)` 的行的内容）。`:f 42` 现在接受整数字面量，并解析为
  `42.0`。完整的规范 / 行为差异见
  [`ktav` crate CHANGELOG](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#020--2026-05-07)。

  JS 绑定本身只是 WASM / napi 的薄包装 —— 除 `ktav` 上游产生的行为
  外别无变化。将 `stringify()` 输出与内置 `((...))` 字面量逐字节比较
  的代码必须更新；round-trip（`parse(stringify(v))` 深度等于 `v`）
  保持不变。

### 规范

- spec 子模块已同步（typed_float_without_decimal fixture 从 invalid
  移至 valid/typed_float_integer_body）。


## 0.1.5 —— 2026-05-03

### 变更

- **已采用 `ktav 0.1.5`** —— 上游 Rust crate 引入了结构化错误 API
  （`Error::Structured(ErrorKind)` 带字节偏移 span）、对错误枚举追溯
  应用了 `#[non_exhaustive]`，以及公开的事件式解析器 `ktav::thin`。
  JS 绑定对用户可见的行为没有变化：抛出的 `Error` 值仍携带相同的
  人类可读消息（七个标准类别的 Display 字符串与 ktav 0.1.4 完全
  字节相同，由 ktav 自己的 pinning 测试验证）。将 `ktav::ErrorKind`
  映射到结构化 JS 错误类层级（`KtavMissingSeparatorSpaceError`、
  `KtavDuplicateKeyError` 等）是单独的后续工作，记录在
  [`STRUCTURED_ERRORS.md`](https://github.com/ktav-lang/.github/blob/main/STRUCTURED_ERRORS.md)。

### 修复

- **CI/release workflow 由 `npm ci` 改为 `npm install`。** 当
  `package.json` 中以 npm registry 上尚不存在的版本声明 per-platform
  `optionalDependencies`（`@ktav-lang/js-<triple>`）时，严格的
  `npm ci` 会拒绝 lockfile —— 而这正是发布时的状态，因为这些包
  正要由 workflow 自己的 matrix 作业构建并发布。`npm install` 会让
  `package.json` 与 lockfile 调和后继续。代价：略慢（重新解析少数
  条目），但消除了自 0.1.3 起阻塞每一次发布尝试的循环依赖死锁。

npm: `ktav@0.1.5`（main）+ `@ktav-lang/js-<triple>@0.1.5`（8 个平台包）。

## 0.1.3 —— 2026-04-26

### 变更

- **升级到 `ktav 0.1.4`** —— 上游 Rust crate 中
  `cabi`/`napi`/`wasm` 共用的 untyped `parse() → Value` 路径，小
  文档加速约 30%、大文档加速约 13%，只是 `Frame::Object` 的初始
  容量微调（4 → 8）。每次 `loads` 都会透明地受益 —— Node、Deno、
  Bun、浏览器 build 全部覆盖。

npm: `@ktav-lang/ktav@0.1.3`。

## 0.1.2 —— Bun FFI 修复 + package-lock 同步

0.1.1 的补丁版本。

### 修复

- `bun:ffi` 的 out 参数处理。0.1.1 把 `Uint8Array` /
  `BigUint64Array` 包在 `ffi.ptr()` 里；后者返回 `number`，
  而 Bun 的 `FFIType.ptr` 拒绝接受裸 number
  ("Unable to convert N to a pointer")。现在 `TypedArray` /
  `Buffer` 实例 **直接** 传入 —— Bun 自动 pin 其底层缓冲并转发
  地址。out-pointer 通过 `Number(BigUint64Array[0])` 读取，
  数据通过 `ffi.toArrayBuffer(ptr, 0, len)` 解包。
- `package-lock.json` 已与升版后的 subpackage 版本同步 ——
  `npm ci` 在新 clone 上不再因 `EUSAGE` 报错。

## 0.1.1 —— `/ffi` 子导出（Deno + Bun）、aarch64-linux-musl 原生二进制

### 新增

- **`@ktav-lang/ktav/ffi` 子导出** —— 通过 `Deno.dlopen`（Deno）
  和 `bun:ffi`（Bun）直接调用 C ABI。与 Java / Go / .NET 绑定共用
  同一个 `ktav_cabi` 共享库，以及 `{"$i":"…"}` / `{"$f":"…"}`
  的 JSON wire 格式。在大文档上比 WASM 路径快约 3–5 倍。
  默认导入保持不变 —— 这是给测出有真实需求的用户准备的 opt-in。
  在 Node 上抛错（改用默认导入，本身已经是 N-API 原生）；
  在浏览器上抛错（改用 `@ktav-lang/ktav/wasm`）。
  - Deno 需要 `--allow-ffi=<path>`；Bun 无需权限。
  - `ktav_cabi` 二进制随对应的 `@ktav-lang/js-<rid>` optional dep
    一起分发（就是装 `.node` 的那一个）。本地 cabi 构建可通过
    `$KTAV_LIB_PATH` 覆盖。
- **`@ktav-lang/ktav/wasm` 子导出** —— 显式访问 WASM 构建，
  对于条件 `exports` 映射无法正确选择（某些 bundler）的环境很有用。
- **`@ktav-lang/js-linux-arm64-musl`** —— 面向 Alpine Linux ARM64
  的原生 N-API 二进制。已加入 `optionalDependencies`；
  `npm install @ktav-lang/ktav` 在该平台上会自动选用原生 `.node`，
  不再报 missing-binary。

### 测试

- 为 `/ffi` 路径新增 Bun + Deno smoke 套件
  (`tests/run-bun-ffi.mjs`、`tests/run-deno-ffi.ts`)。
  CI 在 Linux / macOS / Windows 上分别运行。

### 构建管线

- `release.yml` 通过 `cargo-zigbuild` + `zig` 交叉编译
  `aarch64-unknown-linux-musl`；zig 的安装步骤按 target 条件启用，
  其他 7 个 target 不为此下载 150 MB 的 zig。
- `.cargo/config.toml` 针对 musl 目标关闭 `crt-static`—— 否则
  Rust 拒绝生成 `cdylib`。

其他内容—— 公开 API、类型映射、运行时支持 —— 相对 0.1.0 没有变化。

## 0.1.0 —— 首次公开发布

首次发布。面向 **Ktav 格式 0.1**。

### 包名

在 npm 上以 **`@ktav-lang/ktav`** 发布。短名 `ktav`（Rust crate 与 PyPI
包都用它）被 npm 的相似名过滤器拦下 —— 与 `koa` / `keyv` / `klaw`
等流行包太相似。若未来短名开放，后续版本可能加入别名；目前 scoped
形式为正式名。

### 公开 API

- `loads<T = KtavValue>(s: string): T` —— 解析 Ktav 文档。
- `dumps<T extends KtavInput = KtavInput>(obj: T): string` —— 序列化
  JavaScript 值 (顶层必须是对象)。
- `ready(input?): Promise<void>` —— 初始化 WASM 模块。在 Node / Bun
  上为 no-op，在 Deno / 浏览器上必须调用一次。
- TypeScript 类型 `KtavValue`、`KtavObject`、`KtavArray`、`KtavInput`、
  `KtavError`。

### 后端

- **N-API** (`crates/napi`) —— 面向 Node ≥ 18 与 Bun ≥ 1.0 的原生
  `.node` 二进制。为 Linux (x64/arm64, gnu + musl)、macOS
  (x64/arm64)、Windows (x64/arm64) 预编译；八个平台子包以
  `@ktav-lang/js-<triple>` 发布，并作为主包的
  `optionalDependencies` 声明。
- **WebAssembly** (`crates/wasm`) —— 一个包提供两个 wasm-pack 目标：
  - `web` 面向 Deno 与浏览器 (使用方调用 `ready()`)，还包含
    `ktav.inline.js` —— 同一入口，将 `.wasm` 以 base64 内嵌，单个
    文件即可放入 `<script type="module">`，无需另外发起 fetch。
  - `bundler` 面向 webpack / rollup / esbuild / vite。

### 类型映射

| Ktav             | JavaScript                      |
|------------------|---------------------------------|
| `null`           | `null`                          |
| `true` / `false` | `boolean`                       |
| `:i <digits>`    | `number` (安全范围) / `bigint` (更大) |
| `:f <number>`    | `number`                        |
| 裸标量              | `string`                        |
| `[ ... ]`        | `Array`                         |
| `{ ... }`        | 普通对象 (保留插入顺序)                   |

编码时，`Number.isInteger(x)` 选择 `:i`；`bigint` 始终编码为 `:i`。
`NaN` 与 `±Infinity` 会被拒绝。

### 测试覆盖

每个运行时都跑完整的 153 个断言的一致性套件（规范 fixture + 冒烟
测试）：Node 18 / 20 / 22 在 Linux / macOS / Windows 上，Bun 在
三种 OS 上，Deno 2.x 在三种 OS 上，通过 Playwright 的无头 Chromium
在三种 OS 上。

### 致谢

基于参考 `ktav` Rust crate 构建；PyO3 风格的绑定机制借鉴自 Python
包。
