# Вклад в ktav (JavaScript / TypeScript)

**Языки:** [English](CONTRIBUTING.md) · **Русский** · [简体中文](CONTRIBUTING.zh.md)

## Базовые правила

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

### 2. Не изобретайте формат на уровне биндингов

Эти биндинги — намеренно тонкая обёртка. Поведение парсера и формата
принадлежит Rust-крейту
([`ktav-lang/rust`](https://github.com/ktav-lang/rust)) — изменение
там обновляет все language-биндинги одновременно. В этот репозиторий
идёт только **JS/TS-specific эргономика**: TypeScript-типы, загрузчики
под рантаймы, типы исключений.

Если ваше изменение требует правки формата — сначала начните обсуждение
в [`ktav-lang/spec`](https://github.com/ktav-lang/spec).

### 3. Публичный API — пометка совместимости

Если вы трогаете что-то экспортируемое из `ktav` или из фасада в
`ts/`, в описании PR укажите:

- **semver-совместимое** (добавления, ослабленные типы, изменения в
  документации); или
- **semver-ломающее** (переименование / удаление, изменение сигнатур,
  ужесточение типов) — в этом случае bump версии попадает в следующий
  MINOR, пока мы до 1.0.

Обновите `CHANGELOG.md` и два перевода в том же PR.

### 4. Один концепт — один коммит

Коммиты атомарны: фикс бага и его тест вместе, фича и её тесты вместе,
переименование — отдельным коммитом, рефакторинг — отдельным.
`git log --oneline` должен читаться как changelog. Не ставьте перед
сообщением префиксы `feat:` / `fix:` — никаких conventional commits.

### 5. Все рантаймы остаются зелёными

Изменение, которое проходит `npm run test:node-napi`, но ломает
`npm run test:browser`, не готово к мерджу. CI прогоняет все пять
рантайм-матриц на каждом PR — не выключайте их.

## Dev-окружение

Нужно:

- Node **≥ 18** (соответствует полю `engines`).
- Rust stable **≥ 1.70** для `crates/wasm`; **≥ 1.77** для
  `crates/napi` (директивы `cargo::` из napi-build).
- `wasm-pack` — `cargo install wasm-pack`.
- Rust-цель `wasm32-unknown-unknown` —
  `rustup target add wasm32-unknown-unknown`.

Опционально, но полезно для локального прогона всей матрицы:

- **Bun** ≥ 1.1 (`bun test`).
- **Deno** ≥ 2.0.
- **Playwright-браузеры** — `npx playwright install chromium`
  (один раз скачивает headless-шелл).

Особенность Windows: для сборки N-API нужен либо полный Visual Studio
Build Tools + Windows SDK, либо `cargo-xwin` с включённым Windows
Developer Mode. Точные флаги — в `AGENTS.md` воркспейса.

Сборка и тесты:

```bash
git clone --recurse-submodules https://github.com/ktav-lang/js.git
cd js
npm install
npm run build           # napi + wasm × 2 + tsc
npm test                # пять рантаймов, по 153 ассерта в каждом
```

Собирать по кускам:

```bash
npm run build:napi      # .node под текущий хост
npm run build:wasm      # web + bundler wasm + web/inline
npm run build:ts        # только TypeScript-фасад
```

## Локальный прогон clippy (нюанс Windows)

`cargo clippy --target wasm32-unknown-unknown` всё равно компилирует
host-сторонние proc-macro'ы и `build.rs`-скрипты — они всегда
собираются под HOST-triple. На Windows-машине, где активный toolchain
— MSVC (наш дефолт после `rustup override set stable-x86_64-pc-windows-msvc`
для N-API-сборки), clippy тянет MSVC-овский `link.exe` и падает,
если в шелле не загружен `vcvars64.bat`.

Чтобы обойти всю эту возню, гоняй clippy для wasm-крейта через
GNU-toolchain — линкер MinGW уже в PATH, никакой настройки не нужно:

```bash
cargo +stable-x86_64-pc-windows-gnu clippy-wasm -- -D warnings
```

Алиасы `clippy-wasm` / `clippy-napi` живут в `.cargo/config.toml` и
подставляют нужные `--target`-флаги. Для N-API-крейта MSVC-toolchain
обязателен (линковка против импортов node.dll) — оборачивай через
`scripts/lint-rust-napi-windows.bat` или просто запускай
`npm run lint:rust`, который по платформе сам выберет правильную
обёртку.

На Linux / macOS ничего из этого не нужно — дефолтный toolchain это
GNU / Darwin, `cargo clippy-wasm` и `cargo clippy-napi` работают
как есть.

## Стиль кода

- **TypeScript**: strict, NodeNext module resolution. Избегайте `any`
  в публичном API — дженерик-каст в `loads<T>` — единственная
  намеренная лазейка.
- **Rust**: стандартные дефолты `rustfmt` +
  `cargo clippy -- -D warnings` должны проходить. Одна идиоматичная
  строка лучше одной хитрой.
- **Комментарии**: объясняйте *почему*, а не *что*. Публичный API
  имеет doc-комментарии; у внутренних — редкие `// note:`-блоки
  только там, где читатель может реально запутаться.

## Релизный процесс

Теговые пуши `v*` в `main` запускают `.github/workflows/release.yml`:

1. Собирают `.node`-бинарники под 8 платформ.
2. Собирают две wasm-цели.
3. Формируют платформенные подпакеты `npm/<triple>/`.
4. Публикуют каждый подпакет и основной пакет `ktav` через npm OIDC
   (никаких API-токенов в репо — доверенный GitHub-environment `npm`).

Для локальных dry-run-ов: `npm pack --dry-run` показывает основной
тарболл; `npx napi create-npm-dirs --npm-dir npm --dry-run` —
платформенные деревья.

## Безопасность

См. [SECURITY.md](SECURITY.md) — как сообщать об уязвимостях. Кратко:
пишите на **phpcraftdream@gmail.com** приватно, пожалуйста, не
открывайте публичные issue по проблемам безопасности.

### Лицензия вкладов

Если вы явно не заявите иное, любой вклад, намеренно отправленный
для включения в этот проект, в соответствии с определением лицензии
Apache-2.0, будет лицензирован на условиях **MIT OR Apache-2.0** без
каких-либо дополнительных условий или ограничений.
