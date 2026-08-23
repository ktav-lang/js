# Changelog

**语言:** [English](CHANGELOG.md) · [Русский](CHANGELOG.ru.md) · **简体中文**

本文档记录 JavaScript / TypeScript 绑定的所有重要变更。格式基于
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/);版本采用
[Semantic Versioning](https://semver.org/),遵循 pre-1.0 约定:
MINOR 版本升级视为破坏性。

本 changelog 跟踪**包发布**,不涉及 Ktav 格式本身的变更 —— 后者见
[`ktav-lang/spec`](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md)。

## [0.6.4] — 2026-08-23

与 Ktav 规范和 Rust core 0.6.4 同步。

### 新增

- WASM、N-API 和 C-ABI FFI 入口新增 `loadsStrict()`，用于严格检查
  canonical scalar。writer 生成的科学计数法浮点形式会被接受。

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

- 键处理完整的 §3.7 转义集合,并新增两个转义:
  - `\.` → `.`(字面量点 —— **不**会切分 dotted-path)
  - `\:` → `:`(字面量冒号 —— **不**作为键/值分隔符)
- 示例: `a\.b: v` → `{"a.b": "v"}`,`a\:b: v` → `{"a:b": "v"}`,
  `x.y\.z: v` → `{"x": {"y.z": "v"}}`。

### 破坏性变更

- 键中的字面量反斜杠现在需要写作 `\\`(此前键中的 `\` 是普通字节)。
  实际中很少出现;按 pre-1.0 SemVer 为 MINOR bump。

### 变更

- 跟踪 ktav-rust 0.6.0 / Ktav 规范 0.6.0。绑定源码未改动 —— escape
  语义的变化完全在 Rust 内核中实现,WASM / N-API / FFI 路径均透明。

---

## 0.5.0 —— 2026-05-28

跟踪 [`ktav 0.5.0`](https://github.com/ktav-lang/rust/blob/main/CHANGELOG.md#050--2026-05-28)
和 [spec 0.5.0](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md#050--2026-05-28)。

### 新增

- **`emitCanonical`** —— WASM 和 N-API 均新增导出;返回符合 spec 0.5.0
  的规范化稳定表示。
- **Spec 0.5.0 一致性测试** —— 测试运行器现在读取 `spec/versions/0.5/tests`
  中的 fixture。

### 变更

- **许可证** —— 双重许可 `MIT OR Apache-2.0`(之前为 `MIT`)。`LICENSE-MIT`
  和 `LICENSE-APACHE` 均包含在 npm 包中。
- Spec 子模块更新至标签 `v0.5.0`。

## 0.1.5 —— 2026-05-03

### 变更

- **已采用 `ktav 0.1.5`** —— 上游 Rust crate 引入了结构化错误 API
  (`Error::Structured(ErrorKind)` 带字节偏移 span)、对错误枚举追溯
  应用了 `#[non_exhaustive]`,以及公开的事件式解析器 `ktav::thin`。
  JS 绑定对用户可见的行为没有变化:抛出的 `Error` 值仍携带相同的
  人类可读消息(七个标准类别的 Display 字符串与 ktav 0.1.4 完全
  字节相同,由 ktav 自己的 pinning 测试验证)。将 `ktav::ErrorKind`
  映射到结构化 JS 错误类层级(`KtavMissingSeparatorSpaceError`、
  `KtavDuplicateKeyError` 等)是单独的后续工作,记录在
  [`STRUCTURED_ERRORS.md`](https://github.com/ktav-lang/.github/blob/main/STRUCTURED_ERRORS.md)。

### 修复

- **CI/release workflow 由 `npm ci` 改为 `npm install`。** 当
  `package.json` 中以 npm registry 上尚不存在的版本声明 per-platform
  `optionalDependencies`(`@ktav-lang/js-<triple>`)时,严格的
  `npm ci` 会拒绝 lockfile —— 而这正是发布时的状态,因为这些包
  正要由 workflow 自己的 matrix 作业构建并发布。`npm install` 会让
  `package.json` 与 lockfile 调和后继续。代价:略慢(重新解析少数
  条目),但消除了自 0.1.3 起阻塞每一次发布尝试的循环依赖死锁。

npm:`ktav@0.1.5`(main)+ `@ktav-lang/js-<triple>@0.1.5`(8 个平台包)。

## 0.1.3 —— 2026-04-26

### 变更

- **升级到 `ktav 0.1.4`** —— 上游 Rust crate 中
  `cabi`/`napi`/`wasm` 共用的 untyped `parse() → Value` 路径,小
  文档加速约 30%、大文档加速约 13%,只是 `Frame::Object` 的初始
  容量微调(4 → 8)。每次 `loads` 都会透明地受益 —— Node、Deno、
  Bun、浏览器 build 全部覆盖。

npm:`@ktav-lang/ktav@0.1.3`。

## 0.1.2 —— Bun FFI 修复 + package-lock 同步

0.1.1 的补丁版本。

### 修复

- `bun:ffi` 的 out 参数处理。0.1.1 把 `Uint8Array` /
  `BigUint64Array` 包在 `ffi.ptr()` 里;后者返回 `number`,
  而 Bun 的 `FFIType.ptr` 拒绝接受裸 number
  ("Unable to convert N to a pointer")。现在 TypedArray /
  Buffer 实例 **直接** 传入 —— Bun 自动 pin 其底层缓冲并转发
  地址。out-pointer 通过 `Number(BigUint64Array[0])` 读取,
  数据通过 `ffi.toArrayBuffer(ptr, 0, len)` 解包。
- `package-lock.json` 已与升版后的 subpackage 版本同步 ——
  `npm ci` 在新 clone 上不再因 `EUSAGE` 报错。

## 0.1.1 —— `/ffi` 子导出(Deno + Bun)、aarch64-linux-musl 原生二进制

### 新增

- **`@ktav-lang/ktav/ffi` 子导出** —— 通过 `Deno.dlopen`(Deno)
  和 `bun:ffi`(Bun)直接调用 C ABI。与 Java / Go / .NET 绑定共用
  同一个 `ktav_cabi` 共享库,以及 `{"$i":"…"}` / `{"$f":"…"}`
  的 JSON wire 格式。在大文档上比 WASM 路径快约 3–5 倍。
  默认导入保持不变 —— 这是给测出有真实需求的用户准备的 opt-in。
  在 Node 上抛错(改用默认导入,本身已经是 N-API 原生);
  在浏览器上抛错(改用 `@ktav-lang/ktav/wasm`)。
  - Deno 需要 `--allow-ffi=<path>`;Bun 无需权限。
  - `ktav_cabi` 二进制随对应的 `@ktav-lang/js-<rid>` optional dep
    一起分发(就是装 `.node` 的那一个)。本地 cabi 构建可通过
    `$KTAV_LIB_PATH` 覆盖。
- **`@ktav-lang/ktav/wasm` 子导出** —— 显式访问 WASM 构建,
  对于条件 `exports` 映射无法正确选择(某些 bundler)的环境很有用。
- **`@ktav-lang/js-linux-arm64-musl`** —— 面向 Alpine Linux ARM64
  的原生 N-API 二进制。已加入 `optionalDependencies`;
  `npm install @ktav-lang/ktav` 在该平台上会自动选用原生 `.node`,
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
  上为 no-op,在 Deno / 浏览器上必须调用一次。
- TypeScript 类型 `KtavValue`、`KtavObject`、`KtavArray`、`KtavInput`、
  `KtavError`。

### 后端

- **N-API** (`crates/napi`) —— 面向 Node ≥ 18 与 Bun ≥ 1.0 的原生
  `.node` 二进制。为 Linux (x64/arm64, gnu + musl)、macOS
  (x64/arm64)、Windows (x64/arm64) 预编译;八个平台子包以
  `@ktav-lang/js-<triple>` 发布,并作为主包的
  `optionalDependencies` 声明。
- **WebAssembly** (`crates/wasm`) —— 一个包提供两个 wasm-pack 目标:
  - `web` 面向 Deno 与浏览器 (使用方调用 `ready()`),还包含
    `ktav.inline.js` —— 同一入口,将 `.wasm` 以 base64 内嵌,单个
    文件即可放入 `<script type="module">`,无需另外发起 fetch。
  - `bundler` 面向 webpack / rollup / esbuild / vite。

### 类型映射

| Ktav             | JavaScript                                        |
|------------------|---------------------------------------------------|
| `null`           | `null`                                            |
| `true` / `false` | `boolean`                                         |
| `:i <digits>`    | `number` (安全范围) / `bigint` (更大)             |
| `:f <number>`    | `number`                                          |
| 裸标量           | `string`                                          |
| `[ ... ]`        | `Array`                                           |
| `{ ... }`        | 普通对象 (保留插入顺序)                           |

编码时,`Number.isInteger(x)` 选择 `:i`;`bigint` 始终编码为 `:i`。
`NaN` 与 `±Infinity` 会被拒绝。

### 测试覆盖

每个运行时都跑完整的 153 个断言的一致性套件 (规范 fixture + 冒烟
测试):Node 18 / 20 / 22 在 Linux / macOS / Windows 上,Bun 在
三种 OS 上,Deno 2.x 在三种 OS 上,通过 Playwright 的无头 Chromium
在三种 OS 上。

### 致谢

基于参考 `ktav` Rust crate 构建;PyO3 风格的绑定机制借鉴自 Python
包。
