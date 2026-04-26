# Changelog

**Языки:** [English](CHANGELOG.md) · **Русский** · [简体中文](CHANGELOG.zh.md)

Все значимые изменения JavaScript / TypeScript-биндингов документируются
здесь. Формат основан на
[Keep a Changelog](https://keepachangelog.com/ru/1.1.0/); версионирование
— [Semantic Versioning](https://semver.org/) с pre-1.0 соглашением, что
MINOR bump — ломающий.

Этот changelog отслеживает **релизы пакета**, а не изменения самого
формата Ktav — для последнего см.
[`ktav-lang/spec`](https://github.com/ktav-lang/spec/blob/main/CHANGELOG.md).

## 0.1.3 — 2026-04-26

### Изменено

- **Подхватили `ktav 0.1.4`** — untyped путь `parse() → Value` в
  upstream Rust crate (тот, что используют `cabi`/`napi`/`wasm`)
  теперь ~30% быстрее на маленьких документах и ~13% на больших,
  благодаря однострочной правке initial capacity для `Frame::Object`
  (4 → 8). Каждый `loads` получит ускорение прозрачно — Node, Deno,
  Bun и browser build.

npm: `@ktav-lang/ktav@0.1.3`.

## 0.1.2 — фиксы Bun FFI + sync package-lock

Patch-релиз поверх 0.1.1.

### Исправлено

- Обработка out-параметров `bun:ffi`. В 0.1.1 аргументы
  `Uint8Array` / `BigUint64Array` оборачивались в `ffi.ptr()`;
  тот возвращает `number`, а Bun'овский `FFIType.ptr` отказывается
  принимать сырое число ("Unable to convert N to a pointer").
  Теперь TypedArray / Buffer передаются **напрямую** — Bun
  автоматически пинит backing-buffer и передаёт адрес.
  Out-pointer'ы читаются как `Number(BigUint64Array[0])`,
  данные распаковываются через `ffi.toArrayBuffer(ptr, 0, len)`.
- `package-lock.json` синхронизирован с забампленными версиями
  subpackages — `npm ci` больше не падает с `EUSAGE` на свежих
  клонах.

## 0.1.1 — `/ffi` subexport для Deno и Bun, нативный aarch64-linux-musl

### Добавлено

- **`@ktav-lang/ktav/ffi` subexport** — прямой доступ к C ABI через
  `Deno.dlopen` (Deno) и `bun:ffi` (Bun). Тот же `ktav_cabi`
  бинарник, что у биндингов Java / Go / .NET, тот же JSON wire-формат
  с `{"$i":"…"}` / `{"$f":"…"}`. ~3–5× быстрее WASM на больших
  документах. Default import не меняется — это opt-in для тех, кто
  измерил потребность. Бросает на Node (используйте default —
  уже N-API нативный) и в браузере (`@ktav-lang/ktav/wasm`).
  - Требует `--allow-ffi=<path>` на Deno; permission-free на Bun.
  - Бинарник `ktav_cabi` лежит в соответствующем
    `@ktav-lang/js-<rid>` optional dep рядом с `.node`. Переопределить
    через `$KTAV_LIB_PATH` для локальных билдов.
- **`@ktav-lang/ktav/wasm` subexport** — явный доступ к WASM-сборке,
  полезно для окружений, где conditional `exports` map не выбирает
  правильную ветку (некоторые бандлеры).
- **`@ktav-lang/js-linux-arm64-musl`** — нативный N-API бинарь для
  Alpine Linux на ARM64. Теперь в `optionalDependencies`;
  `npm install @ktav-lang/ktav` на этой платформе автоматически
  подхватит нативный `.node` вместо ошибки missing-binary.

### Тесты

- Новые smoke-сьюты под Bun + Deno для `/ffi`-пути
  (`tests/run-bun-ffi.mjs`, `tests/run-deno-ffi.ts`). CI гоняет оба
  на Linux / macOS / Windows.

### Внутренности сборки

- `release.yml` кросс-компилирует `aarch64-unknown-linux-musl`
  через `cargo-zigbuild` + `zig`, шаг установки zig условно — только
  для этого target'а, остальные 7 не тянут лишние 150 МБ.
- `.cargo/config.toml` отключает `crt-static` на musl-targets — без
  этого Rust не соглашается собирать `cdylib`.

Остальное — публичный API, type mapping, поддержка рантаймов — без
изменений с 0.1.0.

## 0.1.0 — первый публичный релиз

Первый релиз. Цель — **формат Ktav 0.1**.

### Имя пакета

Опубликовано как **`@ktav-lang/ktav`** на npm. Короткое имя `ktav`
(как у Rust-крейта и PyPI-пакета) заблокировано фильтром похожих имён
npm — слишком близко к популярным `koa` / `keyv` / `klaw`. Если имя
позже освободится, будущий релиз может добавить алиас; пока канонически
scoped.

### Публичный API

- `loads<T = KtavValue>(s: string): T` — разобрать Ktav-документ.
- `dumps<T extends KtavInput = KtavInput>(obj: T): string` —
  сериализовать JavaScript-значение (верхний уровень должен быть
  объектом).
- `ready(input?): Promise<void>` — инициализировать WASM-модуль. No-op
  для Node / Bun, требуется один раз на Deno / в браузере.
- TypeScript-типы `KtavValue`, `KtavObject`, `KtavArray`, `KtavInput`,
  `KtavError`.

### Бэкенды

- **N-API** (`crates/napi`) — нативный бинарник `.node` для Node ≥ 18
  и Bun ≥ 1.0. Предсобран под Linux (x64/arm64, gnu + musl), macOS
  (x64/arm64), Windows (x64/arm64); восемь платформенных подпакетов
  публикуются под `@ktav-lang/js-<triple>` и объявлены как
  `optionalDependencies` основного пакета.
- **WebAssembly** (`crates/wasm`) — две wasm-pack-цели из одного
  пакета:
  - `web` — для Deno и браузера (потребитель вызывает `ready()`),
    плюс `ktav.inline.js` — тот же вход с `.wasm`, встроенным через
    base64, так что один файл попадает в
    `<script type="module">` без соседнего fetch.
  - `bundler` — для webpack / rollup / esbuild / vite.

### Соответствие типов

| Ktav             | JavaScript                                          |
|------------------|-----------------------------------------------------|
| `null`           | `null`                                              |
| `true` / `false` | `boolean`                                           |
| `:i <digits>`    | `number` (безопасный диапазон) / `bigint` (шире)    |
| `:f <number>`    | `number`                                            |
| скаляр без маркера | `string`                                          |
| `[ ... ]`        | `Array`                                             |
| `{ ... }`        | обычный объект (порядок вставки сохраняется)        |

На сериализации `Number.isInteger(x)` выбирает `:i`; `bigint` всегда
кодируется как `:i`. `NaN` и `±Infinity` отвергаются.

### Протестировано на

Каждый рантайм прогоняет всю conformance-сьюту из 153 ассертов
(spec-фикстуры + smoke): Node 18 / 20 / 22 на Linux / macOS / Windows,
Bun на всех трёх ОС, Deno 2.x на всех трёх ОС, headless Chromium
через Playwright на всех трёх ОС.

### Благодарности

Построено поверх reference-Rust-крейта `ktav`; механика биндингов в
духе PyO3 заимствована из Python-пакета.
