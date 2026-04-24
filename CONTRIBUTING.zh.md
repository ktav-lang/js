# 为 ktav (JavaScript / TypeScript) 贡献代码

**语言:** [English](CONTRIBUTING.md) · [Русский](CONTRIBUTING.ru.md) · **简体中文**

## 核心规则

### 1. 每个 bug 修复都伴随一个回归测试

在修复 bug **之前**,先写一个能复现该 bug 的测试 —— 该测试**必须在
`main` 上失败**,并在修复后通过。测试与修复放在同一个 PR。

测试文件位于 `tests/`:

| 文件                           | 范围                                             |
|--------------------------------|--------------------------------------------------|
| `shared/assertions.mjs`        | 运行时无关的测试套件 (source of truth)。         |
| `run-node-napi.mjs`            | Node + 原生 `.node` 绑定。                       |
| `run-node-wasm.mjs`            | Node + WASM `web` 目标。                         |
| `run-bun.mjs`                  | Bun + 原生 `.node`。                             |
| `run-deno.ts`                  | Deno + WASM `web` 目标。                         |
| `run-browser.mjs`              | 无头 Chromium (Playwright) + WASM。              |
| `browser-runner.html`          | 浏览器驱动打开的 harness 页面。                  |

新增测试几乎总是加到 `shared/assertions.mjs`,这样每个运行时都会跑
到。运行时特定的边界情况 (例如 `ready()` 的语义) 可以放在对应的
驱动里。

### 2. 不要在绑定层重新发明格式

本绑定是**有意**做成薄包装。解析器 / 格式行为属于 Rust crate
([`ktav-lang/rust`](https://github.com/ktav-lang/rust)) —— 在那里修改
一次会同时更新所有语言绑定。只有 **JS/TS 特有的人体工学** (TypeScript
类型、运行时加载器、异常类型) 才属于本仓库。

如果你的改动需要改格式,请先去
[`ktav-lang/spec`](https://github.com/ktav-lang/spec) 发起讨论。

### 3. 公开 API 的改动要标注兼容性

如果你动了任何从 `ktav` 或 `ts/` 外观层导出的东西,请在 PR 描述中
注明:

- **semver 兼容** (新增、更宽松的类型、文档变更);或者
- **semver 破坏性** (重命名 / 删除、签名变化、更严格的类型) ——
  这种情况下版本升级会进入下一个 MINOR,因为我们还在 pre-1.0。

同一个 PR 中更新 `CHANGELOG.md` 及其两份翻译。

### 4. 一个提交一件事

提交要原子化:一个 bug 修复与它的测试一起、一个特性与它的测试一起、
重命名单独一个提交、重构单独一个提交。`git log --oneline` 读起来应
像一份 changelog。不要给提交信息加 `feat:` / `fix:` 前缀 —— 本仓库
不用 conventional commits。

### 5. 每个运行时都保持绿色

只通过 `npm run test:node-napi` 却让 `npm run test:browser` 挂掉的
改动不算可合并。CI 在每个 PR 上都跑完全部五个运行时矩阵 —— 不要
关掉它们。

## 开发环境

你需要:

- Node **≥ 18** (与 `engines` 字段一致)。
- Rust stable **≥ 1.70** 用于 `crates/wasm`;**≥ 1.77** 用于
  `crates/napi` (napi-build 的 `cargo::` 指令)。
- `wasm-pack` —— `cargo install wasm-pack`。
- Rust 目标 `wasm32-unknown-unknown` ——
  `rustup target add wasm32-unknown-unknown`。

可选,但对本地跑完整矩阵很有用:

- **Bun** ≥ 1.1 (`bun test`)。
- **Deno** ≥ 2.0。
- **Playwright 浏览器** —— `npx playwright install chromium`
  (一次性下载无头 shell)。

Windows 特别说明:N-API 构建需要完整的 Visual Studio Build Tools +
Windows SDK,或者启用 Windows 开发者模式的 `cargo-xwin`。具体参数见
工作区中的 `AGENTS.md`。

构建与测试:

```bash
git clone --recurse-submodules https://github.com/ktav-lang/js.git
cd js
npm install
npm run build           # napi + wasm × 2 + tsc
npm test                # 五个运行时,每个 153 个断言
```

分块构建:

```bash
npm run build:napi      # 当前主机的 .node
npm run build:wasm      # web + bundler wasm + web/inline
npm run build:ts        # 仅 TypeScript 外观层
```

## 代码风格

- **TypeScript**:strict,NodeNext 模块解析。公开 API 避免 `any`
  —— `loads<T>` 里的泛型断言是唯一有意保留的逃生通道。
- **Rust**:`rustfmt` 默认设置 + `cargo clippy -- -D warnings` 必须
  通过。一行地道代码胜过一行机灵代码。
- **注释**:解释*为什么*,而非*做什么*。公开 API 有 doc 注释;
  内部只在读者可能真的会困惑的地方偶尔出现 `// note:` 块。

## 发布流程

对 `main` 的 `v*` 标签推送会触发 `.github/workflows/release.yml`:

1. 为 8 个平台构建 `.node` 二进制。
2. 构建两个 wasm 目标。
3. 组装 `npm/<triple>/` 平台子包。
4. 通过 npm OIDC 发布各子包与主包 `ktav` (仓库中不存任何 API
   token —— 受信任的 `npm` GitHub environment 代为处理)。

本地 dry-run:`npm pack --dry-run` 展示主 tarball;
`npx napi create-npm-dirs --npm-dir npm --dry-run` 展示平台目录树。

## 安全

如何上报漏洞见 [SECURITY.md](SECURITY.md)。简短版本:请私下发邮件至
**phpcraftdream@gmail.com**,不要为安全问题开公开 issue。
