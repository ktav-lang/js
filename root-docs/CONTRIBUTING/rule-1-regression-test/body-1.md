>>>>> lang=en
### 1. Every bug fix ships with a regression test

When you find a bug, **before fixing it**, write a test that reproduces
it — the test **must fail on `main`** and pass after the fix. Include
both in the same PR.

Tests live under `tests/`:

| File                           | Scope                                          |
|--------------------------------|------------------------------------------------|
| `shared/assertions.mjs`        | Runtime-agnostic suite (source of truth).      |
| `run-node-napi.mjs`            | Node runtime + native `.node` binding.         |
| `run-node-wasm.mjs`            | Node runtime + WASM web target.                |
| `run-bun.mjs`                  | Bun runtime + native `.node`.                  |
| `run-deno.ts`                  | Deno runtime + WASM web target.                |
| `run-browser.mjs`              | Headless Chromium (Playwright) + WASM.         |
| `browser-runner.html`          | The harness page the browser driver opens.     |

New tests almost always go into `shared/assertions.mjs` so they run in
every runtime. Runtime-specific edge cases (e.g. `ready()` semantics)
can live in the matching driver.

>>>>> lang=ru
### 1. Каждый багфикс сопровождается регрессионным тестом

Когда вы нашли баг, **до того, как его исправлять**, напишите
воспроизводящий тест — он **должен падать на `main`** и проходить
после фикса. И тест, и фикс — в одном PR.

Тесты лежат в `tests/`:

| Файл                           | Область                                        |
|--------------------------------|------------------------------------------------|
| `shared/assertions.mjs`        | Рантайм-агностичная сьюта (source of truth).   |
| `run-node-napi.mjs`            | Node + нативный биндинг `.node`.               |
| `run-node-wasm.mjs`            | Node + WASM-цель `web`.                        |
| `run-bun.mjs`                  | Bun + нативный `.node`.                        |
| `run-deno.ts`                  | Deno + WASM-цель `web`.                        |
| `run-browser.mjs`              | Headless Chromium (Playwright) + WASM.         |
| `browser-runner.html`          | HTML-страница-харнесс, которую открывает драйвер браузера. |

Новые тесты почти всегда идут в `shared/assertions.mjs` — так они
проходят во всех рантаймах. Рантайм-специфичные граничные случаи
(например, семантика `ready()`) могут жить в соответствующем драйвере.

>>>>> lang=zh
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

