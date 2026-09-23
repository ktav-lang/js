>>>>> lang=en
## Code style

- **TypeScript**: strict, NodeNext module resolution. Avoid `any` in
  public APIs — the generic cast in `loads<T>` is the only intentional
  escape hatch.
- **Rust**: standard `rustfmt` defaults + `cargo clippy -- -D warnings`
  must pass. One idiomatic line > one clever line.
- **Comments**: explain *why*, not *what*. The public API has doc
  comments; internals have occasional `// note:` blocks only where
  a reader could plausibly be confused.

>>>>> lang=ru
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

>>>>> lang=zh
## 代码风格

- **TypeScript**:strict,NodeNext 模块解析。公开 API 避免 `any`
  —— `loads<T>` 里的泛型断言是唯一有意保留的逃生通道。
- **Rust**:`rustfmt` 默认设置 + `cargo clippy -- -D warnings` 必须
  通过。一行地道代码胜过一行机灵代码。
- **注释**:解释*为什么*,而非*做什么*。公开 API 有 doc 注释;
  内部只在读者可能真的会困惑的地方偶尔出现 `// note:` 块。

