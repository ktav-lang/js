>>>>> lang=en

## 0.1.5 — 2026-05-03

### Changed

- **Picked up `ktav 0.1.5`** — the upstream Rust crate now exposes
  `Error::Structured(ErrorKind)` with byte-offset spans, retroactive
  `#[non_exhaustive]` on the error enums, and a public `ktav::thin`
  event-based parser. The JS binding's user-visible behaviour is
  unchanged: thrown `Error` values carry the same human-readable
  message (Display strings for the seven canonical categories are
  byte-identical to ktav 0.1.4 — verified by ktav's own pinning
  tests). Mapping `ktav::ErrorKind` to a structured JS error class
  hierarchy (`KtavMissingSeparatorSpaceError`, `KtavDuplicateKeyError`,
  etc.) is separate follow-up work tracked in the workspace's
  [`STRUCTURED_ERRORS.md`](https://github.com/ktav-lang/.github/blob/main/STRUCTURED_ERRORS.md).

>>>>> lang=ru

## 0.1.5 — 2026-05-03

### Изменено

- **Подхватили `ktav 0.1.5`** — в upstream Rust crate появился API
  структурированных ошибок (`Error::Structured(ErrorKind)` с
  byte-offset spans), retroactive `#[non_exhaustive]` на error-enum-ах,
  и публичный event-based парсер `ktav::thin`. Поведение JS-биндинга
  для пользователя не меняется: брошенные `Error`-значения несут то
  же читаемое сообщение (Display-строки семи канонических категорий
  byte-identical к ktav 0.1.4 — проверено собственными pinning-тестами
  ktav). Маппинг `ktav::ErrorKind` на структурную JS-иерархию ошибок
  (`KtavMissingSeparatorSpaceError`, `KtavDuplicateKeyError` и т.д.) —
  отдельная follow-up работа, описанная в
  [`STRUCTURED_ERRORS.md`](https://github.com/ktav-lang/.github/blob/main/STRUCTURED_ERRORS.md).

>>>>> lang=zh

## 0.1.5 —— 2026-05-03

### 变更

- **已采用 `ktav 0.1.5`** —— 上游 Rust crate 引入了结构化错误 API
  （`Error::Structured(ErrorKind)` 带字节偏移 span）、对错误枚举追溯
  应用了 `#[non_exhaustive]`，以及公开的事件式解析器 `ktav::thin`。
  JS 绑定对用户可见的行为没有变化：抛出的 `Error` 值仍携带相同的
  人类可读消息（七个标准类别的 Display 字符串与 ktav 0.1.4 完全
  字节相同，由 ktav 自己的 pinning 测试验证）。将 `ktav::ErrorKind`
  映射到结构化 JS 错误类层级（`KtavMissingSeparatorSpaceError`、
  `KtavDuplicateKeyError` 等）是单独的后续工作，记录在
  [`STRUCTURED_ERRORS.md`](https://github.com/ktav-lang/.github/blob/main/STRUCTURED_ERRORS.md)。

