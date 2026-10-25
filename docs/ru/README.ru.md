# ktav (JavaScript / TypeScript)

[![npm](https://img.shields.io/npm/v/%40ktav-lang%2Fktav?style=flat-square&logo=npm&label=npm)](https://www.npmjs.com/package/@ktav-lang/ktav)
[![CI](https://img.shields.io/github/actions/workflow/status/ktav-lang/js/ci.yml?style=flat-square&logo=github&label=CI)](https://github.com/ktav-lang/js/actions)
![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue?style=flat-square)
[![Playground](https://img.shields.io/badge/playground-try%20online-7c3aed?style=flat-square&logo=rocket&logoColor=white)](https://ktav-lang.github.io/)

> Универсальные JS/TS-биндинги для [Ktav](https://github.com/ktav-lang/spec) —
> простого формата конфигураций. Форма как у JSON; обычные ключи и значения
> не требуют кавычек. Запятые не нужны, вложенность задают точки в ключах.
> Под капотом Rust; для Node и Bun
> поставляется нативный N-API, для Deno, браузеров и бандлеров — WebAssembly.

**Languages:** [English](../../README.md) · **Русский** · [简体中文](../zh/README.zh.md)

**Песочница:** конвертируйте JSON / YAML / TOML / INI ⇄ Ktav прямо в браузере — **[ktav-lang.github.io](https://ktav-lang.github.io/)**.

**Спецификация:** этот пакет реализует **Ktav**. Формат версионируется
и развивается независимо от пакета — нормативный документ см. в
[`ktav-lang/spec`](https://github.com/ktav-lang/spec).

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

| Рантайм                           | Бэкенд  | Как загружается                                        |
|-----------------------------------|---------|--------------------------------------------------------|
| Node ≥ 18, Bun                    | N-API   | Платформенный `.node` через optional dep              |
| Deno, браузер                     | WASM    | Цель `web`, потребитель ожидает `ready()`             |
| Webpack / Vite / Rollup / esbuild | WASM    | Цель `bundler`, `.wasm` резолвит бандлер              |

Нативные бинарники предсобраны для Linux (x64/arm64, glibc + musl),
macOS (x64/arm64) и Windows (x64/arm64); npm устанавливает подходящий
текущему хосту вариант через `optionalDependencies`. Эти восемь optional-
пакетов `@ktav-lang/js-*` — собственные платформенные бинарные артефакты
проекта, а не сторонние runtime-зависимости. Если подходящего бинарника
нет, основной нативный загрузчик рано выдаёт понятную ошибку.

Для Node-потребителя, который явно импортирует только
`@ktav-lang/ktav/pure`, можно исключить optional-пакеты:

```sh
npm install --omit=optional @ktav-lang/ktav
```

У корневого пакета нет сторонних runtime-зависимостей. Инструменты
сборки, тестирования и документации нужны только для разработки.
См. [Чистый TypeScript-бэкенд](#чистый-typescript-бэкенд) для импорта
`/pure` и требований к runtime.

## Чистый TypeScript-бэкенд

`@ktav-lang/ktav/pure` — полный парсер и генератор Ktav для Node, Bun, Deno и браузеров. Он использует только ESM пакета и JS-глобальные объекты (`TextEncoder`, `TextDecoder`, `JSON`, `BigInt`). Сторонних runtime-пакетов, native, WASM, FFI, подпроцессов, сети или fallback нет.

Восемь optional `@ktav-lang/js-*` пакетов — наши бинарники для основного входа; `/pure` их не разрешает и не загружает. Build, test и документация относятся к разработке. Основной вход зависит от рантайма; явно выбирайте `/pure`. Node без optional-пакетов: `npm install --omit=optional @ktav-lang/ktav`.

```ts
import { loads, dumps } from "@ktav-lang/ktav/pure";

const cfg = loads(`service: web\nport: 8080\n`);
console.log(dumps(cfg));
```

Для браузера без сети во время работы раздавайте заранее собранный ESM и локальные модули вместе с приложением; пример не загружает CDN:

```html
<script type="module">
  import { loads, dumps } from "./assets/ktav-pure.js";
  document.body.textContent = dumps(loads("hello: world"));
</script>
```

API включает `loadsBytes()`, операции парсера/генератора и formatter с сохранением комментариев. Целые до ±2^53 — `number`, более крупные — `BigInt`. JS `number` не сохраняет Integer/Float при объектной эмиссии; для побайтового canonical используйте `canonicalFromSource()`. Установка, сборка или доставка файлов пакета может требовать сеть; pure parser и writer не используют сеть во время выполнения.

## Быстрый старт

### Парсинг — типизированное чтение полей разобранного объекта

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
port: 8080
ratio: 0.75
tls: true
tags: [
    prod
    eu-west-1
]
db.host: primary.internal
db.timeout: 30
`);

cfg.port;        // 8080 — typed as number
cfg.db.timeout;  // 30
```

### Сборка и рендер — строим документ в коде

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
// name: frontend
// port: 8443
// tls: true
// ratio: 0.95
// upstreams: [
//     { host: a.example  port: 1080 }
//     { host: b.example  port: 1080 }
// ]
// notes: null
```

Полный запускаемый пример для Node — в [`examples/node/index.mjs`](../../examples/node/index.mjs).

### Форматирование — форматтер с сохранением комментариев

```ts
import { format } from "@ktav-lang/ktav";

format(`
port: 8080

## the port

host: localhost
`);
// port: 8080
//
// ## the port
//
// host: localhost
```

Гарантии `format`: каждый комментарий сохраняется дословно; серии
пустых строк схлопываются ровно в одну; порядок ключей никогда не
меняется; это фиксированная точка (`format(format(x)) === format(x)`);
и его вывод совпадает с выдачей canonical writer'а тогда и только
тогда, когда в документе нет ни комментариев, ни пустых строк.

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

Трейд-офф: ~3–5× быстрее WASM на parse / dump больших документов;
на Deno требует выдачи разрешения; теряет свойство Deno «работает
в любой песочнице». Оставайтесь на импорте по умолчанию, пока не
измерили реальную потребность.

Запускаемые примеры: [`examples/deno/ffi.ts`](../../examples/deno/ffi.ts),
[`examples/bun/ffi.ts`](../../examples/bun/ffi.ts).

## Публичный API

```ts
function loads<T = KtavValue>(s: string): T;
function loadsStrict<T = KtavValue>(s: string): T;
function dumps<T extends KtavInput = KtavInput>(obj: T): string;
function stringifyForceStrings<T extends KtavInput = KtavInput>(obj: T): string;
function format(s: string): string;
function canonicalFromSource(s: string): string;
function emitCanonical<T extends KtavInput = KtavInput>(obj: T): string;
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;

// web / Deno / browser only; Node + Bun ignore it
function ready(input?: URL | Response | ArrayBuffer): Promise<void>;
```

`loadsStrict` применяет валидацию канонических скаляров и отклоняет
lossy-формы, принимая при этом формы, которые выдаёт canonical writer.

`stringifyForceStrings` выводит как `dumps`, но расплющивает каждый
leaf-скаляр — integer, float, boolean, `null` — в текстовую форму через
сырой маркер (`::`). Составные значения сохраняют структуру, а результат
разбирается обратно через `loads` как тот же набор String-скаляров.

> **Ещё не выпущено (подготовка 0.9):** Эти API редактирования и обновлённая диагностика не входят в опубликованные пакеты 0.8.1. Native-backend требует закреплённое ядро 0.9 (C ABI 2 для C-FFI); pure-backend остаётся самостоятельным.

## Редактирование исходника (спека 0.9)

Две операции заменяют значение **внутри существующего документа**,
сплайся исходный текст: документ не пересериализуется, поэтому
комментарии, пробелы, написание и порядок ключей, BOM и стиль CR / LF /
CRLF (а также наличие или отсутствие финального перевода строки)
сохраняются побайтово вне эффективной правки:

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
```

- **Только замена существующего значения.** Создание, удаление и
  переименование не поддерживаются. Отсутствующий ключ, спуск через
  скаляр, выходящий за границы или нечисловой индекс массива, пустой
  список сегментов — `EditNotFound`.
- **Пути.** `textualPath` — форма с точками `key1.key2.0.key4`; внутри
  сегмента `\.` — literal точка, `\\` — literal backslash; любой другой
  escape, хвостовой одиночный `\` или пустой сегмент —
  `EditInvalidPath`, в `body` — десятичный **UTF-8 байтовый офсет** в
  аргументе пути. `editValueSegments` принимает уже декодированные
  литеральные сегменты без повторного unescape. Числовой сегмент — это
  строковый ключ в Object и zero-based индекс из ASCII-цифр в Array
  (ведущие нули допустимы, знаки — нет).
- **Ошибки** — обычный десятиполевой envelope с
  `error === "EditInvalidPath" | "EditNotFound" | "EditUnsupported"`;
  все поля позиции null (ошибка правки — не parse-ошибка).
  `EditUnsupported.body` содержит причину: noncontiguous-цель
  (dotted-key / reopen), структурная замена, стирающая комментарии
  внутри контейнера, или многострочная строка со строкой `))` —
  lossless-формы не существует.
- **Гарантии.** Байт-идентичная замена — байт-идентичный no-op даже
  при неканоничном написании. Каждый успешный патч перепарсится и
  семантически проверяется: заменено ровно целевое значение, остальное
  дерево равно. Невалидный ИСХОДНИК даёт обычный envelope парсера, а
  не ошибку правки.
- **Форма.** Dotted-, inline- и блочные формы сохраняются, включая
  целые inline-контейнеры и опустошённые (но не схлопнутые) блочные.
  Inline-обёртки раскрываются минимально: при многострочной строке, при
  росте строки сверх `max(100 Unicode scalar, прежняя длина)` или при
  ≥ 4 escapes с накладными расходами ≥ 25 % — только по затронутой
  ветке. Замена — JS-значение: `bigint` и целые `number` сохраняют
  точную форму Integer, нецелые — Float.

Доступно на всех бэкендах: `@ktav-lang/ktav` (N-API), `/wasm`,
`/pure` и субэкспорты `/ffi` (Bun / Deno, асинхронно). Нативные
бинарники старше ядра 0.9 сообщают понятную ошибку версии, а не
тихий fallback.

Канонический вывод дают три функции, и они не взаимозаменяемы:

| | вход | комментарии | написание скаляра |
| --- | --- | --- | --- |
| `format(s)` | исходный текст | **сохраняются** | сохраняется |
| `canonicalFromSource(s)` | исходный текст | отбрасываются | сохраняется |
| `emitCanonical(obj)` | значение JS | сохранять нечего | может измениться |

`canonicalFromSource` — это текст на входе и канонический текст на
выходе, без промежуточного значения JavaScript, поэтому `1.0`, `1e9` и
`-0.0` переживают преобразование побайтово. `emitCanonical` такого
обещать не может: `number` в JS не выражает различие Integer/Float из
Ktav, поэтому `1.0` приходит неотличимым от `1`. Берите `emitCanonical`,
когда у вас значение, и `canonicalFromSource`, когда у вас документ.

Дженерик-параметр у `loads` — **непроверяемый каст**: используйте его,
когда знаете форму данных и хотите автокомплит в IDE. Ничего не
передавайте — получите структурный тип `KtavValue`.

## Ошибки

Любая ошибка, которую бросают биндинги, — типизированный `KtavError`
с десятью полями `ktav::ErrorEnvelope`: `error` (класс, например
`"UnclosedCompound"`), `reason` (стабильный writer-time код), `line`,
`line_text`, `span` (`{start, end}` — **байтовые** смещения в UTF-8
исходнике, а не UTF-16-индексы), `path` (массив точно декодированных
сегментов ключа, никогда не склеенная строка), `body`, `canonical`,
`spec_section` и `message`. Сообщение берётся дословно, а не собирается
из остальных полей, и никогда не содержит сырой JSON. Поля, которых у конкретной
ошибки нет, равны `null`.

```ts
import { loads } from "@ktav-lang/ktav";

try {
  loads("a: [");
} catch (e) {
  e.name;          // "KtavError"
  e.error;         // "UnclosedCompound"
  e.line_text;     // "a: ["
  e.span;          // { start: 3, end: 4 } — UTF-8 byte offsets
  e.spec_section;  // "§6.1"
  e.message;       // "Syntax error: Unclosed array at end of input"
}
```

## Соответствие типов

| Ktav             | JavaScript                                          |
|------------------|-----------------------------------------------------|
| `null`           | `null`                                              |
| `true` / `false` | `boolean`                                           |
| голое целое      | `number` (безопасный диапазон) / `bigint` (шире)    |
| голое десятичное | `number`                                            |
| прочий скаляр    | `string`                                            |
| `[ ... ]`        | `Array`                                             |
| `{ ... }`        | обычный объект (порядок вставки сохраняется)        |

Ktav типизирует числа по **лексической форме** — голый `port: 8080`
это `number`, `ratio: 0.5` — float, а всё, что не является голым
числом, остаётся `string`. Чтобы число-подобное значение осталось
строкой, форсируйте его через `::` (`zip:: 01007`).

На сериализации `Number.isInteger(x)` решает, выводить целое или
десятичное; `bigint` всегда кодируется как голое целое. `NaN` и
`±Infinity` отвергаются — Ktav их не представляет.

## Экранирование в ключах

В голых сегментах структурные символы можно экранировать обратной
косой чертой. Если ключ содержит пробелы, кавычки или другие символы,
неудобные для голой формы, заключите отдельный сегмент в `"..."`,
`'...'` или `` `...` ``. В кавычках поддерживаются escape-последовательности,
например `\uXXXX` для кодовой точки Unicode (spec 0.8.0, § 3.7.1):

```text
"service name": web
"a.b".child: v
"caf\u00E9": yes
```

Литеральные `.` и `:` в голом сегменте записываются как `\.` и `\:`;
литеральный обратный слеш — как `\\`. Точка между сегментами остаётся
разделителем пути.

## Однофайловая сборка для браузера

`dist/wasm/web/ktav.inline.js` — вариант с WASM-бинарником, встроенным
через base64: просто положите его в любой `<script type="module">`
без соседнего `.wasm`-файла и без HTTP-сервера. Работает и по `file://`.

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

Биндинги живут по тем же правилам: никакого вывода схем, никакого
авто-каста, никаких значений по умолчанию. Хотите типизацию — делайте
её на границе своим инструментом (Zod, io-ts, рукописные валидаторы)
поверх нативных структур, которые возвращает эта библиотека.

## Связанные проекты

- [`ktav-lang/spec`](https://github.com/ktav-lang/spec) — нормативная
  спецификация формата и language-agnostic conformance-тесты.
- [`ktav-lang/rust`](https://github.com/ktav-lang/rust) — эталонная
  Rust-реализация. И N-API-крейт, и WASM-крейт — обёртки над ней.
- [`ktav-lang/python`](https://github.com/ktav-lang/python) —
  Python-биндинги (PyO3) над тем же крейтом.

## Версионирование

Пакет следует [Semantic Versioning](https://semver.org/) с pre-1.0
соглашением: минорный bump — ломающий. Версия пакета и версия крейта
`ktav` движутся вместе.

## Разработка

Dev-окружение, матрица тестов по рантаймам и процесс вклада описаны в
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Поддержите проект

У автора много идей, которые могут быть полезны IT во всём мире, — и
далеко не только для Ktav. Их реализация требует финансирования. Если
хотите помочь, пожалуйста, напишите на **phpcraftdream@gmail.com**.

## Лицензия

MIT OR Apache-2.0. См. [LICENSE-MIT](../../LICENSE-MIT) и [LICENSE-APACHE](../../LICENSE-APACHE).

## Другие реализации Ktav

- [`spec`](https://github.com/ktav-lang/spec) — спецификация + conformance-тесты
- [`rust`](https://github.com/ktav-lang/rust) — эталонный Rust crate (`cargo add ktav`)
- [`csharp`](https://github.com/ktav-lang/csharp) — C# / .NET (`dotnet add package Ktav`)
- [`golang`](https://github.com/ktav-lang/golang) — Go (`go get github.com/ktav-lang/golang`)
- [`java`](https://github.com/ktav-lang/java) — Java / JVM (`io.github.ktav-lang:ktav` на Maven Central)
- [`php`](https://github.com/ktav-lang/php) — PHP (`composer require ktav-lang/ktav`)
- [`python`](https://github.com/ktav-lang/python) — Python (`pip install ktav`)
