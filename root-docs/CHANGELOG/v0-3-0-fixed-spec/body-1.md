>>>>> lang=en
### Fixed

- **Diagnostic spans for `DuplicateKey` / `KeyPathConflict`** now
  point at the offending key rather than the closing `}` / `]` of the
  compound. Editors / IDEs consuming the binding's error messages
  underline the key location. This is a span-value fix from upstream;
  no API change.

### Spec

- spec submodule synced (paren-string handling tightened — fixtures
  for `inline_paren_string_double` / `inline_paren_string_single` added
  to invalid; `partial_parens` removed from valid).

>>>>> lang=ru
### Исправлено

- **Диагностические span'ы для `DuplicateKey` / `KeyPathConflict`**
  теперь указывают на проблемный ключ, а не на закрывающие `}` / `]`
  соединения. Редакторы / IDE, потребляющие сообщения об ошибках
  биндинга, подчёркивают расположение ключа. Это исправление значений
  span из upstream; API не меняется.

### Spec

- подмодуль spec синхронизирован (обработка paren-string ужесточена —
  фикстуры `inline_paren_string_double` / `inline_paren_string_single`
  добавлены в invalid; `partial_parens` убран из valid).

>>>>> lang=zh
### 修复

- **`DuplicateKey` / `KeyPathConflict` 的诊断 span** 现在指向有问题的
  键，而不再指向该连接的结尾 `}` / `]`。消费绑定错误消息的编辑器 /
  IDE 会因此将键的位置标注出来。这是来自上游的 span 取值修复；
  API 无变化。

### 规范

- spec 子模块已同步（paren-string 处理收紧 —— 针对
  `inline_paren_string_double` / `inline_paren_string_single` 的
  fixture 加入 invalid；`partial_parens` 从 valid 中移除）。

