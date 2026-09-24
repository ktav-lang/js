>>>>> lang=en
# Examples

Each runtime example reads the same Ktav snippet, parses it, prints a
derived value, and renders a small object. The examples focus on the
public API rather than advanced features.

| Runtime | Example | Backend |
|---|---|---|
| Node | `node/` | Native N-API |
| Bun | `bun/napi.ts` | Native N-API |
| Bun | `bun/ffi.ts` | C ABI via `bun:ffi` |
| Deno | `deno/wasm.ts` | WASM web target |
| Deno | `deno/ffi.ts` | C ABI via `Deno.dlopen` (`--allow-ffi`) |
| Browser | `browser/` | WASM web target served over HTTP |
| Bundler | `bundler-vite/` | WASM bundler target with Vite |

The two FFI examples use the same `ktav_cabi` library as the Java, Go,
and .NET bindings. They can be faster than WASM for larger documents,
but require a matching native library. From a checkout, examples resolve
the package through `../../dist/`; installed consumers import
`@ktav-lang/ktav`.

Build the package from the repository root before running an example:

```sh
npm run build
```
>>>>> lang=ru
# Примеры

Каждый пример для отдельной среды читает один и тот же фрагмент Ktav,
разбирает его, выводит вычисленное значение и сериализует небольшой
объект. Примеры показывают публичный API, а не сложные возможности.

| Среда | Пример | Backend |
|---|---|---|
| Node | `node/` | Нативный N-API |
| Bun | `bun/napi.ts` | Нативный N-API |
| Bun | `bun/ffi.ts` | C ABI через `bun:ffi` |
| Deno | `deno/wasm.ts` | WASM web target |
| Deno | `deno/ffi.ts` | C ABI через `Deno.dlopen` (`--allow-ffi`) |
| Браузер | `browser/` | WASM web target через HTTP |
| Bundler | `bundler-vite/` | WASM bundler target с Vite |

Оба FFI-примера используют ту же библиотеку `ktav_cabi`, что и биндинги
Java, Go и .NET. На больших документах они могут быть быстрее WASM,
но требуют подходящую нативную библиотеку. В checkout примеры разрешают
пакет через `../../dist/`; установленные потребители импортируют
`@ktav-lang/ktav`.

Перед запуском примера соберите пакет из корня репозитория:

```sh
npm run build
```
>>>>> lang=zh
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
