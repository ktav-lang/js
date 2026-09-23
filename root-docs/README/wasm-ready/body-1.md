>>>>> lang=en
### WASM consumers (Deno, browser)

Call `ready()` once before the first `loads` / `dumps` — the wasm
target defers instantiation:

```ts
import { ready, loads } from "@ktav-lang/ktav";
await ready();
loads("port: 8080\n");
```

Node / Bun consumers skip this — the native binary is loaded at import
time.

>>>>> lang=ru
### Потребители WASM (Deno, браузер)

Вызовите `ready()` один раз до первого `loads` / `dumps` — wasm-цель
инстанцируется отложенно:

```ts
import { ready, loads } from "@ktav-lang/ktav";
await ready();
loads("port: 8080\n");
```

Потребители Node / Bun этот шаг пропускают — нативный бинарник
загружается в момент импорта.

>>>>> lang=zh
### WASM 使用方 (Deno、浏览器)

在首次调用 `loads` / `dumps` 之前调用一次 `ready()` —— wasm 目标采用
延迟实例化：

```ts
import { ready, loads } from "@ktav-lang/ktav";
await ready();
loads("port: 8080\n");
```

Node / Bun 使用方无需此步 —— 原生二进制在导入时即加载。

