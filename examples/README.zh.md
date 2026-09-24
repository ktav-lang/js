# 示例

每个运行时示例都会读取相同的 Ktav 片段、解析它、打印派生值，
再将一个小对象序列化为 Ktav。示例侧重展示公开 API，而非高级功能。

| 运行时 | 示例 | 后端 |
|---|---|---|
| Node | `node/` | 原生 N-API |
| Bun | `bun/napi.ts` | 原生 N-API |
| Bun | `bun/ffi.ts` | 通过 `bun:ffi` 使用 C ABI |
| Deno | `deno/wasm.ts` | WASM web target |
| Deno | `deno/ffi.ts` | 通过 `Deno.dlopen` 使用 C ABI（`--allow-ffi`） |
| 浏览器 | `browser/` | 通过 HTTP 提供的 WASM web target |
| Bundler | `bundler-vite/` | Vite 加载的 WASM bundler target |

两个 FFI 示例使用与 Java、Go 和 .NET 绑定相同的 `ktav_cabi` 库。
处理较大文档时，它们可能比 WASM 更快，但需要匹配的原生库。
从源码 checkout 运行时，示例通过 `../../dist/` 解析包；已安装的
消费者则从 `@ktav-lang/ktav` 导入。

运行示例前，请在仓库根目录构建此包：

```sh
npm run build
```
