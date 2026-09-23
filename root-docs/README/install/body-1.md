>>>>> lang=en
## Install

```bash
npm install @ktav-lang/ktav
```

> **Naming note:** the bare `ktav` name is blocked on npm's similarity
> filter (too close to `koa`, `keyv`, `klaw`, …), so the package ships
> under the `@ktav-lang` scope. Rust (`ktav` on crates.io) and Python
> (`ktav` on PyPI) keep the short form.

One package serves every target runtime:

| Runtime          | Backend  | How it's loaded                          |
|------------------|----------|------------------------------------------|
| Node ≥ 18, Bun   | N-API    | Platform-specific `.node` via optional dep |
| Deno, browser    | WASM     | `web` target, consumer awaits `ready()`  |
| Webpack / Vite / Rollup / esbuild | WASM | `bundler` target, bundler resolves `.wasm` |

Native binaries are prebuilt for Linux (x64/arm64, glibc + musl),
macOS (x64/arm64), and Windows (x64/arm64); npm installs the one that
matches the current host through `optionalDependencies`. If nothing
matches, the loader throws early with a clear diagnostic.

>>>>> lang=ru
## Установка

```bash
npm install @ktav-lang/ktav
```

> **Про имя:** короткое `ktav` заблокировано фильтром похожих имён на npm
> (слишком близко к `koa`, `keyv`, `klaw`, …), поэтому пакет публикуется
> под скоупом `@ktav-lang`. В Rust (`ktav` на crates.io) и Python
> (`ktav` на PyPI) короткая форма сохранена.

Один пакет обслуживает все целевые рантаймы:

| Рантайм                           | Бэкенд  | Как загружается                                        |
|-----------------------------------|---------|--------------------------------------------------------|
| Node ≥ 18, Bun                    | N-API   | Платформенный `.node` через optional dep              |
| Deno, браузер                     | WASM    | Цель `web`, потребитель ожидает `ready()`             |
| Webpack / Vite / Rollup / esbuild | WASM    | Цель `bundler`, `.wasm` резолвит бандлер              |

Нативные бинарники предсобраны для Linux (x64/arm64, glibc + musl),
macOS (x64/arm64) и Windows (x64/arm64); npm ставит тот, что подходит
текущему хосту, через `optionalDependencies`. Если подходящего нет,
загрузчик рано падает с понятной диагностикой.

>>>>> lang=zh
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
主机匹配的那一个。若无匹配项，加载器会及早抛出并给出清晰的诊断信息。

