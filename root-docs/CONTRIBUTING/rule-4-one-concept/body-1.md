>>>>> lang=en
### 4. One concept per commit

Commits should be atomic: a bug fix and its test together, a feature
and its tests together, a rename on its own, a refactor on its own.
`git log --oneline` should read like a changelog. Don't prefix commit
messages with `feat:` / `fix:` — no conventional commits here.

>>>>> lang=ru
### 4. Один концепт — один коммит

Коммиты атомарны: фикс бага и его тест вместе, фича и её тесты вместе,
переименование — отдельным коммитом, рефакторинг — отдельным.
`git log --oneline` должен читаться как changelog. Не ставьте перед
сообщением префиксы `feat:` / `fix:` — никаких conventional commits.

>>>>> lang=zh
### 4. 一个提交一件事

提交要原子化:一个 bug 修复与它的测试一起、一个特性与它的测试一起、
重命名单独一个提交、重构单独一个提交。`git log --oneline` 读起来应
像一份 changelog。不要给提交信息加 `feat:` / `fix:` 前缀 —— 本仓库
不用 conventional commits。

