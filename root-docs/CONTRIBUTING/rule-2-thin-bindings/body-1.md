>>>>> lang=en
### 2. Don't reinvent the format in the bindings

These bindings are deliberately a thin wrapper. Parser / format
behaviour belongs in the Rust crate
([`ktav-lang/rust`](https://github.com/ktav-lang/rust)) — changing it
there updates every language binding at once. Only **JS/TS-specific
ergonomics** (TypeScript types, runtime loaders, exception types) belong
in this repo.

If your change requires a format change, start a discussion in
[`ktav-lang/spec`](https://github.com/ktav-lang/spec) first.

>>>>> lang=ru
### 2. Не изобретайте формат на уровне биндингов

Эти биндинги — намеренно тонкая обёртка. Поведение парсера и формата
принадлежит Rust-крейту
([`ktav-lang/rust`](https://github.com/ktav-lang/rust)) — изменение
там обновляет все language-биндинги одновременно. В этот репозиторий
идёт только **JS/TS-specific эргономика**: TypeScript-типы, загрузчики
под рантаймы, типы исключений.

Если ваше изменение требует правки формата — сначала начните обсуждение
в [`ktav-lang/spec`](https://github.com/ktav-lang/spec).

>>>>> lang=zh
### 2. 不要在绑定层重新发明格式

本绑定是**有意**做成薄包装。解析器 / 格式行为属于 Rust crate
([`ktav-lang/rust`](https://github.com/ktav-lang/rust)) —— 在那里修改
一次会同时更新所有语言绑定。只有 **JS/TS 特有的人体工学** (TypeScript
类型、运行时加载器、异常类型) 才属于本仓库。

如果你的改动需要改格式,请先去
[`ktav-lang/spec`](https://github.com/ktav-lang/spec) 发起讨论。

