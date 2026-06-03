# ktav (JavaScript / TypeScript)

[![npm](https://img.shields.io/npm/v/%40ktav-lang%2Fktav?style=flat-square&logo=npm&label=npm)](https://www.npmjs.com/package/@ktav-lang/ktav)
[![CI](https://img.shields.io/github/actions/workflow/status/ktav-lang/js/ci.yml?style=flat-square&logo=github&label=CI)](https://github.com/ktav-lang/js/actions)
![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue?style=flat-square)
[![Playground](https://img.shields.io/badge/playground-try%20online-7c3aed?style=flat-square&logo=rocket&logoColor=white)](https://ktav-lang.github.io/)

> Универсальные JS/TS-биндинги для [Ktav](https://github.com/ktav-lang/spec) —
> простого формата конфигов. Форма JSON, без кавычек, без запятых, вложенность
> через точки в ключах. Под капотом — Rust, поставляется как нативный N-API
> для Node и Bun, как WebAssembly — для Deno, браузеров и бандлеров.

**Языки:** [English](README.md) · **Русский** · [简体中文](README.zh.md)

**Песочница:** конвертация JSON / YAML / TOML / INI ⇄ Ktav прямо в браузере — **[ktav-lang.github.io](https://ktav-lang.github.io/)**.

**Спецификация:** этот пакет реализует **Ktav 0.1**. Формат версионируется
и развивается отдельно от пакета — см.
[`ktav-lang/spec`](https://github.com/ktav-lang/spec) для нормативного
документа.

---

## Установка

```bash
npm install @ktav-lang/ktav
```

> **Про имя:** короткое `ktav` заблокировано фильтром похожих имён на npm
> (слишком близко к `koa`, `keyv`, `klaw`, …), поэтому пакет публикуется
> под скоупом `@ktav-lang`. В Rust (`ktav` на crates.io) и Python
> (`ktav` на PyPI) короткая форма сохранена.

Один пакет обслуживает все целевые рантаймы:

| Рантайм                           | Бэкенд | Как подгружается                                |
|-----------------------------------|--------|-------------------------------------------------|
| Node ≥ 18, Bun                    | N-API  | Платформенный `.node` через optional dep        |
| Deno, браузер                     | WASM   | Цель `web`, потребитель ожидает `ready()`       |
| Webpack / Vite / Rollup / esbuild | WASM   | Цель `bundler`, бандлер сам резолвит `.wasm`    |

Нативные бинарники предсобраны для Linux (x64/arm64, glibc + musl),
macOS (x64/arm64) и Windows (x64/arm64); npm через `optionalDependencies`
ставит тот, что подходит текущему хосту. Если ничего не подошло —
загрузчик ранне падает с чёткой диагностикой.

## Быстрый старт

### Парсинг — типизированно читаем поля

```ts
import { loads, dumps } from "@ktav-lang/ktav";

interface DB { host: string; timeout: number; }
interface Config {
  service: string;
  port:    number;
  ratio:   number;
  tls:     boolean;
  tags:    string[];
  db:      DB;
}

const cfg = loads<Config>(`
service: web
port:i 8080
ratio:f 0.75
tls: true
tags: [
    prod
    eu-west-1
]
db.host: primary.internal
db.timeout:i 30
`);

cfg.port;        // 8080 — типизирован как number
cfg.db.timeout;  // 30
```

### Билд + рендер — собираем документ в коде

```ts
const doc = {
  name:  "frontend",
  port:  8443,
  tls:   true,
  ratio: 0.95,
  upstreams: [
    { host: "a.example", port: 1080 },
    { host: "b.example", port: 1080 },
  ],
  notes: null,
};
const text = dumps(doc);
```

Полный запускаемый пример (Node) — в [`examples/node/index.mjs`](examples/node/index.mjs).

### Потребители WASM (Deno, браузер)

Один раз вызовите `ready()` до первого `loads` / `dumps` — wasm
инстанцируется отложенно:

```ts
import { ready, loads } from "@ktav-lang/ktav";
await ready();
loads("port:i 8080\n");
```

Node / Bun это пропускают — нативный бинарник подгружается в момент
импорта.

### Нативный FFI subexport (Deno, Bun) — `@ktav-lang/ktav/ffi`

Для пользователей Deno, кому нужна нативная скорость без WASM-overhead'а,
и для пользователей Bun, кому больше нравится `bun:ffi` чем N-API, —
есть opt-in subexport, который ходит напрямую в C ABI shared library
(`ktav_cabi`, тот же бинарник что у биндингов Java / Go / .NET):

```ts
import { loads, dumps } from "@ktav-lang/ktav/ffi";

// loads / dumps здесь ASYNC (ждут dlopen на первом вызове)
const cfg = await loads("port:i 8080\n");
const text = await dumps({ port: 8443 });
```

| Runtime  | Механизм           | Permission flag                                                              |
|----------|--------------------|------------------------------------------------------------------------------|
| Deno     | `Deno.dlopen`      | `--allow-ffi=<путь-до-libktav_cabi>` (или `--allow-ffi` для любых FFI)       |
| Bun      | `bun:ffi`          | не нужен — Bun доверяет FFI                                                  |
| Node     | n/a                | бросает — используйте default import (уже N-API нативный)                    |
| Browser  | n/a                | бросает — используйте `@ktav-lang/ktav/wasm`                                 |

Файл библиотеки лежит в соответствующем `@ktav-lang/js-<rid>`
optional dep (тот же что хранит `.node`-бинарник), так что
`npm install @ktav-lang/ktav` — достаточно. Переопределить через
`KTAV_LIB_PATH` для локальных cabi-билдов.

Трейд-офф: ~3–5× быстрее WASM на parse / dump больших документов;
требует permission grant на Deno; теряет deno-свойство "работает в
любом песочничном окружении". Используйте default import, если не
измерили реальную потребность.

Запускаемые примеры: [`examples/deno/ffi.ts`](examples/deno/ffi.ts),
[`examples/bun/ffi.ts`](examples/bun/ffi.ts).

## Публичный API

```ts
function loads<T = KtavValue>(s: string): T;
function dumps<T extends KtavInput = KtavInput>(obj: T): string;

// только web / Deno / браузер; Node + Bun игнорируют
function ready(input?: URL | Response | ArrayBuffer): Promise<void>;
```

Дженерик-параметр у `loads` — **непроверяемый каст**: используйте его,
когда знаете форму данных и хотите автокомплит в IDE. Ничего не
передавайте — получите структурный тип `KtavValue`.

## Соответствие типов

| Ktav             | JavaScript                                          |
|------------------|-----------------------------------------------------|
| `null`           | `null`                                              |
| `true` / `false` | `boolean`                                           |
| `:i <digits>`    | `number` (безопасный диапазон) / `bigint` (шире)    |
| `:f <number>`    | `number`                                            |
| скаляр без маркера | `string`                                          |
| `[ ... ]`        | `Array`                                             |
| `{ ... }`        | обычный объект (порядок вставки сохраняется)        |

Ktav живёт по принципу **«никакой магии в типах»** — голый `port: 8080`
на уровне парсера остаётся строкой. Нужны числа — используйте
типизированные маркеры `:i` / `:f`, либо приводите на прикладном
уровне.

На сериализации `Number.isInteger(x)` решает `:i` или `:f`; `bigint`
всегда кодируется как `:i`. `NaN` и `±Infinity` отвергаются — Ktav
0.1.0 их не представляет.

## Экранирование в ключах

Начиная со spec 0.6.0 литеральные `.` или `:` внутри сегмента ключа
записываются через backslash:

```text
a\.b: v        // ключ — один сегмент "a.b"     → { "a.b": "v" }
a\:b: v        // двоеточие внутри ключа        → { "a:b": "v" }
x.y\.z: v      // делим только по первой точке  → { "x": { "y.z": "v" } }
```

Литеральный backslash в ключе пишется как `\\`.

## Однофайловая сборка для браузера

`dist/wasm/web/ktav.inline.js` — вариант с WASM-бинарником, встроенным
через base64: кладите его прямо в `<script type="module">` без
соседнего `.wasm`-файла и без HTTP-сервера. Работает и по `file://`.

```html
<script type="module">
    import init, { loads, dumps } from "https://unpkg.com/ktav/dist/wasm/web/ktav.inline.js";
    await init();
    console.log(loads("hello: world\n"));
</script>
```

Цена: ≈ 35 % больше без сжатия, ≈ 5 % после gzip — base64 хорошо
сжимается на фоне почти случайных байтов wasm.

## Философия

Ktav намеренно маленький. Пять принципов проектирования
(из [`spec/CONTRIBUTING.md`](https://github.com/ktav-lang/spec/blob/main/CONTRIBUTING.md)):

1. **Локальность** — смысл строки не зависит от другой строки.
2. **Одно предложение** — новое правило умещается в одну фразу спеки.
3. **Нет чувствительности к пробелам** (кроме переноса строк).
4. **Никакой магии в типах** — формат не решает, что `"8080"` — число.
5. **Явно лучше, чем хитро** — `::` избыточен намеренно.

Биндинги живут по тем же правилам: никакой inference-ы схемы, никакого
авто-каста, никаких defaults. Хотите типизацию — делайте её на границе
своим инструментом (Zod, io-ts, рукописные валидаторы) поверх нативных
структур, которые возвращает эта библиотека.

## Связанные проекты

- [`ktav-lang/spec`](https://github.com/ktav-lang/spec) — нормативная
  спецификация формата и language-agnostic conformance-тесты.
- [`ktav-lang/rust`](https://github.com/ktav-lang/rust) — reference
  Rust-реализация. И N-API-крейт, и WASM-крейт — обёртки над ней.
- [`ktav-lang/python`](https://github.com/ktav-lang/python) —
  Python-биндинги (PyO3) над тем же крейтом.

## Версионирование

Пакет следует [Semantic Versioning](https://semver.org/) с pre-1.0
соглашением: минорный bump — ломающий. Версия пакета и версия крейта
`ktav` движутся вместе.

## Разработка

Dev-окружение, матрица тестов по рантаймам и процесс вклада описаны в
[CONTRIBUTING.md](CONTRIBUTING.md).

## Поддержите проект

У автора много идей, которые могут быть полезны IT во всём мире, — и
далеко не только для Ktav. Их реализация требует финансирования. Если
вы хотите помочь — пишите на **phpcraftdream@gmail.com**.

## Лицензия

MIT OR Apache-2.0. См. [LICENSE-MIT](LICENSE-MIT) и [LICENSE-APACHE](LICENSE-APACHE).

## Другие реализации Ktav

- [`spec`](https://github.com/ktav-lang/spec) — спецификация + conformance-тесты
- [`rust`](https://github.com/ktav-lang/rust) — эталонный Rust crate (`cargo add ktav`)
- [`csharp`](https://github.com/ktav-lang/csharp) — C# / .NET (`dotnet add package Ktav`)
- [`golang`](https://github.com/ktav-lang/golang) — Go (`go get github.com/ktav-lang/golang`)
- [`java`](https://github.com/ktav-lang/java) — Java / JVM (`io.github.ktav-lang:ktav` на Maven Central)
- [`php`](https://github.com/ktav-lang/php) — PHP (`composer require ktav-lang/ktav`)
- [`python`](https://github.com/ktav-lang/python) — Python (`pip install ktav`)
