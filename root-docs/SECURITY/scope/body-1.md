>>>>> lang=en
## Scope

Issues that count as security problems for this package:

- Out-of-bounds reads / writes or panics in the native `.node` binary
  that crash or hang Node / Bun.
- Runaway memory or CPU when parsing crafted input (both backends).
- Any behaviour that allows crafted Ktav input to escape the expected
  value-domain (arbitrary code execution, prototype pollution on the
  JS side, etc.).

Issues that are **not** security problems here — please use regular
issues for these:

- Performance regressions without crash / hang characteristics.
- Behavioural mismatches between the backends that aren't exploitable.
- Problems in the Ktav format itself — those belong in
  [`ktav-lang/spec`](https://github.com/ktav-lang/spec).
>>>>> lang=ru
## Область

Что считается проблемой безопасности для этого пакета:

- Out-of-bounds чтения / записи или паники в нативном `.node`, которые
  ведут к падению или зависанию Node / Bun.
- Неконтролируемое потребление памяти или CPU при разборе специально
  сформированного входа (оба бэкенда).
- Любое поведение, при котором сформированный Ktav-вход выходит за
  ожидаемый value-домен (произвольное выполнение кода, prototype
  pollution со стороны JS и т. п.).

Что **не** считается проблемой безопасности здесь — пожалуйста,
используйте обычные issue:

- Регрессии производительности без характеристик crash / hang.
- Поведенческие расхождения между бэкендами, которые не эксплуатируются.
- Проблемы в самом формате Ktav — им место в
  [`ktav-lang/spec`](https://github.com/ktav-lang/spec).
>>>>> lang=zh
## 范围

以下问题会按本包的安全问题处理:

- 原生 `.node` 二进制中的越界读写或 panic,导致 Node / Bun 崩溃或挂起。
- 解析构造输入时出现失控的内存或 CPU 消耗 (两个后端都适用)。
- 任何允许构造的 Ktav 输入逃逸出预期值域的行为 (任意代码执行、
  JS 侧的原型污染等)。

以下**不**算本包的安全问题 —— 请走普通 issue:

- 没有崩溃 / 挂起特征的性能回归。
- 两个后端之间无法利用的行为差异。
- Ktav 格式本身的问题 —— 这类问题属于
  [`ktav-lang/spec`](https://github.com/ktav-lang/spec)。
