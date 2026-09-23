>>>>> lang=en
## Philosophy

Ktav is intentionally small. Its five design principles
(from [`spec/CONTRIBUTING.md`](https://github.com/ktav-lang/spec/blob/main/CONTRIBUTING.md)):

1. **Locality** — a line's meaning does not depend on another line.
2. **One sentence** — any new rule fits in one sentence of the spec.
3. **No whitespace sensitivity** (line breaks aside).
4. **No magic types** — the format never decides `"8080"` means a number.
5. **Explicit over clever** — `::` is verbose on purpose.

These bindings honour that: no schema inference, no auto-casting, no
defaulting. If you want typing, do it at the boundary with your own
tool (Zod, io-ts, hand-written validators) against the native
structures this library returns.

>>>>> lang=ru
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

>>>>> lang=zh
## 理念

Ktav 有意保持小巧。五条设计原则
(来自 [`spec/CONTRIBUTING.md`](https://github.com/ktav-lang/spec/blob/main/CONTRIBUTING.md)):

1. **局部性** —— 一行的含义不依赖另一行。
2. **一句话** —— 任何新规则都能用规范中的一句话写完。
3. **不对空白敏感** (换行除外)。
4. **不耍小聪明** —— 格式永不替你判断 `"8080"` 是数字。
5. **显式优于机灵** —— `::` 的冗长是刻意的。

本绑定遵循同样的原则：没有 schema 推断、没有自动类型转换、没有默认值。
想要类型，请在边界层用你自己的工具 (Zod、io-ts、手写校验器) 作用在
本库返回的原生结构上。

