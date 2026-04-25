# Changelog

**语言:** [English](CHANGELOG.md) · [Русский](CHANGELOG.ru.md) · **简体中文**

本文档记录 JavaScript / TypeScript 绑定的所有重要变更。格式基于
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/);版本采用
[Semantic Versioning](https://semver.org/),遵循 pre-1.0 约定:
MINOR 版本升级视为破坏性。

本 changelog 跟踪**包发布**,不涉及 Ktav 格式本身的变更 —— 后者见
[`ktav-lang/spec`](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md)。

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
