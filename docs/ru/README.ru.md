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

Правки соединяют части исходного текста, не пересериализуя его. Вне изменения побайтно сохраняются комментарии, пробелы, написание/порядок ключей, BOM, EOL и наличие финального EOL.

```ts
function editValue(source: string, textualPath: string, replacement: KtavValue): string;
function editValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function insertValue(source: string, textualPath: string, replacement: KtavValue): string;
function insertValueSegments(source: string, segments: readonly string[], replacement: KtavValue): string;
function removeValue(source: string, textualPath: string): string;
function removeValueSegments(source: string, segments: readonly string[]): string;
function renameKey(source: string, textualPath: string, newKey: string): string;
function renameKeySegments(source: string, segments: readonly string[], newKey: string): string;
```

Bun/Deno FFI возвращает `Promise<string>`; указанные сигнатуры синхронны.

- Пути используют `.` как разделитель; `\.` кодирует буквальную точку, а `\\` — буквальную обратную косую черту. Другие escape-последовательности, завершающая обратная косая черта, пустой путь или сегмент дают `EditInvalidPath`; `body` — смещение в байтах UTF-8 в пути. API сегментов принимает декодированные строки. Числовой сегмент Object — ключ; индекс Array состоит из ASCII-цифр, допускает ведущие нули, но не знаки.

- `editValue` заменяет существующее значение; пропущенный ключ, спуск через скаляр, неверный индекс и пустой список сегментов дают `EditNotFound`. `insertValue` добавляет только новый последний ключ в существующий Object (при совпадении — `EditAlreadyExists`); промежуточные предки не создаются, вставка в Array не выполняется. `removeValue` удаляет лист, поддерево или элемент Array; пустые предки остаются. `renameKey` переименовывает ключ Object, используя буквальный `newKey`, сохраняя порядок и значение; переименование в то же имя побайтно идентично, совпадение с другим ключом даёт `EditAlreadyExists`. Удаление комментариев внутри контейнера не поддерживается.

- Ошибки используют десятиполевой edit-envelope: `EditInvalidPath`, `EditNotFound`, `EditAlreadyExists` или `EditUnsupported`; поля позиции равны null. Неверный исходник даёт envelope парсера. `EditUnsupported.body` содержит причину: несмежная цель (dotted/reopened), удаление внутренних комментариев или отсутствие lossless-представления в контексте.
- Байт-идентичная замена — no-op даже при неканоничном написании. Успешный патч повторно разбирается и проверяется относительно предполагаемого семантического дерева; меняется только цель. Нетронутые соседние элементы не раскрываются. Ошибка не возвращает частичный патч и не меняет исходник.
- Dotted-, inline- и блочная формы сохраняются; пустые блочные контейнеры не схлопываются. Inline-предки минимально раскрываются при многострочной замене, росте сверх `max(100, длина исходной строки)` либо при ≥4 escape и накладных расходах ≥25% для отдельной строки. Ширина — в Unicode scalar values; раскрывается только затронутая ветвь. `bigint` и целый `number` сохраняют Integer; нецелый становится Float.
- API доступны в N-API, WASM, pure и FFI. Старые нативные бинарники сообщают о неподдерживаемой версии.

### Практические примеры правки исходника

Примеры относятся к ещё не выпущенному API 0.9, а не к опубликованному пакету 0.8.1. Они заменяют только существующие значения: не переименовывают ключи, не создают отсутствующие пути и не удаляют записи. Фрагменты независимы; Rust `?` предполагает внешнюю функцию с результатом `Result`. В Go panic используется только для фиксированных корректных данных примера; приложение должно обработать возвращённую ошибку.

Примеры привязок используют самостоятельный pure-бэкенд без native-бинарника. Нативные точки входа принимают те же пути и значения: `ktav.EditValue` (Go), `Ktav.editValue` (Java), `KtavApi.EditValue(..., KtavBackend.Native)` (C#), `Ktav::editValue` (PHP), native/FFI-экспорты пакета (JS), `ktav.edit_value` (Python). C ABI требует версию 2; PyO3/N-API/WASM — совместимое ядро подготовки 0.9. FFI-вызовы Bun/Deno возвращают promise и требуют `await`; показанные pure/Node/WASM-варианты синхронны.

```ts
import { editValue, editValueSegments } from "@ktav-lang/ktav/pure";
```

#### 1. Настройка развёртывания через dotted-ключ

Меняется только адрес; комментарий, dotted-форма и соседнее поле пользователя сохраняются байт-в-байт.

```ts
const source = "## deployment\ntargets.storagehost.address: old\ntargets.storagehost.user: mcp-agent\n";
const updated = editValue(source, "targets.storagehost.address", "192.168.0.88:22");
```

Результат:

```ktav
## deployment
targets.storagehost.address: 192.168.0.88:22
targets.storagehost.user: mcp-agent
```

#### 2. Буквальные точки: текстовый путь или сегменты

Ключ исходника в кавычках буквально называется `a.b`. В текстовом пути точка экранируется; API сегментов получает декодированное имя напрямую. Оба вызова возвращают одинаковый результат.

```ts
const source = "\"a.b\": {port: 80}\n";
const updated = editValue(source, "a\\.b.port", 90);
const same = editValueSegments(source, ["a.b", "port"], 90);
```

Результат:

```ktav
"a.b": {port: 90}
```

#### 3. Лист внутри массива со смешанными формами

Здесь `0` — индекс массива. В объекте такой же сегмент обозначал бы ключ с именем `0`; нетронутые контейнеры остаются inline.

```ts
const source = "servers: [{host: old, keep: yes}, standby]\n";
const updated = editValueSegments(source, ["servers", "0", "host"], "new");
```

Результат:

```ktav
servers: [{host: new, keep: yes}, standby]
```

#### 4. Похожая на число строка остаётся строкой

Замена имеет тип String, а не Integer. Raw-маркер сохраняет это различие. Для числового значения передавайте типизированный Integer.

```ts
const source = "port: 8080\n";
const updated = editValue(source, "port", "9090");
```

Результат:

```ktav
port:: 9090
```

#### 5. Многострочная замена: раскрывается только необходимое

Изменённый массив раскрывается с отступом четыре пробела. Нетронутый объект остаётся inline, содержимое verbatim-строки не переотступается.

```ts
const source = "a: [old, {keep: yes}]\n";
const updated = editValue(source, "a.0", "x\ny");
```

Результат:

```ktav
a: [
    ((
x
y
    ))
    {keep: yes}
]
```

#### 6. No-op сохраняет неканоническое написание

Значение Integer уже равно 1. Проверка равенства возвращает исходные байты, включая `+1` и пробелы разделителя; критерии читаемости не применяются.

```ts
const source = "n  : +1\n";
const updated = editValue(source, "n", 1);
if (updated !== source) throw new Error("no-op changed source");
```

Результат:

```ktav
n  : +1
```

#### 7. BOM, CRLF и последняя строка без перевода

Результат сохраняет BOM и CRLF, не добавляя финальный перевод строки. Экранированное представление делает эти байты видимыми.

```ts
const source = "\ufeffport: 8080\r\nhost: db";
const updated = editValue(source, "port", 9090);
```

Результат:

```text
"\uFEFFport: 9090\r\nhost: db"
```

Критерии раскрытия фиксированы: многострочная замена, рост сверх `max(100, исходная длина строки)` либо не менее четырёх экранирований с накладными расходами от 25% для отдельной строки замены. Ширина считается в Unicode scalar values, а не байтах UTF-8 или колонках терминала. Уже длинная строка без роста сохраняется. Новые уровни используют четыре пробела и EOL исходника. Если CR или строка данных `))` мешают lossless-кодированию вне inline, сохраняется корректный inline-вариант; эти символы не означают автоматический отказ любой inline-правки.

#### 8. Точная замена Integer

Домен Integer в исходнике — знаковый 64-битный. Это значение больше безопасного диапазона JavaScript Number, но помещается в i64; используйте точное host-представление, а не округлённое число с плавающей точкой. Типизированный Integer вне i64 невозможно сохранить в исходнике как Integer: правка отказывает, не обрезая значение. Для текстового большого идентификатора используйте String. Float различает отрицательный и положительный нуль; no-op для Object не зависит от порядка ключей, порядок Array значим.

```ts
const updated = editValue("n: 1\n", "n", 9007199254740993n);
```

```ktav
n: 9007199254740993
```

### Диагностика и безопасные отказы в 0.9

Координаты исходника — байтовые смещения UTF-8 с учётом BOM; spans полуоткрыты `[start, end)`, строки нумеруются с 1. Поддерживаются LF, отдельный CR и CRLF; CRLF считается одним переводом строки. Один Unicode-символ может занимать несколько байтов.

Незавершённый `a: [\n` даёт `UnclosedCompound`, строку 1 и span `3..5`: начало — самая внутренняя незакрытая скобка, а не начало ключа или строки. Для сырых байтов `61 3A 20 FF` (`a: ` и невалидный UTF-8) валидация сообщает `InvalidUtf8`, строку 1 и покрывающий span `3..4`; `line_text` равен null, а не придуманному тексту после lossy-декодирования. Проверка UTF-8 предшествует грамматике.

Некорректный текстовый путь, включая пустой путь или пустой текстовый сегмент, даёт `EditInvalidPath`; смещение считается в байтах UTF-8 самого пути. Пустой список сегментов, отсутствующий ключ, индекс вне диапазона или спуск через скаляр дают `EditNotFound`. В объекте числовой сегмент остаётся ключом; индекс массива содержит ASCII-цифры, допускает ведущие нули, но не знаки.

Целые промежуточные объекты из dotted/reopened-определений могут занимать несколько физических диапазонов и давать `EditUnsupported`; их существующие листья остаются редактируемыми. Структурная замена контейнера не должна удалять внутренние комментарии. Ошибка не возвращает частичный патч и не меняет переданный исходник. Результат повторно разбирается и семантически проверяется: цель должна равняться замене, остальное дерево значений — исходному.

В привязках ошибочный исходник даёт обычный конверт парсера до проверки пути. Некорректный wire-payload — ошибка `Message` без выдуманных координат. Wire-конверт содержит `error`, `reason`, `line`, `line_text`, `span`, `path`, `body`, `canonical`, `spec_section`, `message`; имена host-accessors описаны в разделе ошибок. В `body` находятся десятичное байтовое смещение пути для `EditInvalidPath`, null для `EditNotFound` и причина отказа для `EditUnsupported`.

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
