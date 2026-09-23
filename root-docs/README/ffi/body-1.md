>>>>> lang=en
### Native FFI subexport (Deno, Bun) — `@ktav-lang/ktav/ffi`

For Deno users who want native speed without the WASM tax — and for
Bun users who prefer `bun:ffi` over the N-API path — there's an
opt-in subexport that talks directly to the C ABI shared library
(`ktav_cabi`, the same binary used by the Java / Go / .NET bindings):

```ts
import { loads, loadsStrict, dumps } from "@ktav-lang/ktav/ffi";

// loads / dumps are ASYNC here (waiting on dlopen on first call)
const cfg = await loads("port: 8080\n");
await loadsStrict("port: 8080\n");
const text = await dumps({ port: 8443 });
```

| Runtime  | Mechanism          | Permission flag                                                             |
|----------|--------------------|-----------------------------------------------------------------------------|
| Deno     | `Deno.dlopen`      | `--allow-ffi=<path-to-libktav_cabi>` (or `--allow-ffi` for any FFI target)  |
| Bun      | `bun:ffi`          | none — Bun trusts FFI                                                       |
| Node     | n/a                | throws — use the default import (already N-API native)                      |
| Browser  | n/a                | throws — use `@ktav-lang/ktav/wasm` instead                                 |

The library file ships in the matching `@ktav-lang/js-<rid>`
optional dependency (same one that holds the `.node` binary), so
`npm install @ktav-lang/ktav` is enough — no separate download.
Override with `KTAV_LIB_PATH` for local cabi builds.

>>>>> lang=ru
### Нативный FFI subexport (Deno, Bun) — `@ktav-lang/ktav/ffi`

Пользователям Deno, которым нужна нативная скорость без WASM-налога,
и пользователям Bun, которые предпочитают `bun:ffi` пути N-API, —
предназначен opt-in subexport, работающий напрямую с C ABI shared library
(`ktav_cabi`, тот же бинарник, что используют биндинги Java / Go / .NET):

```ts
import { loads, loadsStrict, dumps } from "@ktav-lang/ktav/ffi";

// loads / dumps are ASYNC here (waiting on dlopen on first call)
const cfg = await loads("port: 8080\n");
await loadsStrict("port: 8080\n");
const text = await dumps({ port: 8443 });
```

| Runtime  | Механизм           | Permission flag                                                             |
|----------|--------------------|-----------------------------------------------------------------------------|
| Deno     | `Deno.dlopen`      | `--allow-ffi=<path-to-libktav_cabi>` (или `--allow-ffi` — для любой FFI)    |
| Bun      | `bun:ffi`          | не нужен — Bun доверяет FFI                                                 |
| Node     | n/a                | бросает — используйте импорт по умолчанию (уже N-API)                       |
| Browser  | n/a                | бросает — используйте `@ktav-lang/ktav/wasm`                                |

Файл библиотеки поставляется в соответствующем optional dep
`@ktav-lang/js-<rid>` (том же, что держит `.node`-бинарник), так что
достаточно `npm install @ktav-lang/ktav` — отдельная загрузка не нужна.
Переопределяется через `KTAV_LIB_PATH` для локальных cabi-сборок.

>>>>> lang=zh
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

