>>>>> lang=en
### 3. Public API changes note compatibility

If you touch anything exported from `ktav` or the `ts/` facade, say in
the PR description whether it is:

- **semver-compatible** (additions, looser types, doc changes); or
- **semver-breaking** (renamed / removed items, changed signatures,
  tightened types) — in which case the version bump lands in the next
  MINOR while we are pre-1.0.

Update the CHANGELOG source units under `root-docs/CHANGELOG/` (all
three `>>>>> lang=` blocks) in the same PR and regenerate the output.

>>>>> lang=ru
### 3. Публичный API — пометка совместимости

Если вы трогаете что-то экспортируемое из `ktav` или из фасада в
`ts/`, в описании PR укажите:

- **semver-совместимое** (добавления, ослабленные типы, изменения в
  документации); или
- **semver-ломающее** (переименование / удаление, изменение сигнатур,
  ужесточение типов) — в этом случае bump версии попадает в следующий
  MINOR, пока мы до 1.0.

Обновите CHANGELOG-юниты под `root-docs/CHANGELOG/` (все три блока
`>>>>> lang=`) в том же PR и перегенерируйте вывод.

>>>>> lang=zh
### 3. 公开 API 的改动要标注兼容性

如果你动了任何从 `ktav` 或 `ts/` 外观层导出的东西,请在 PR 描述中
注明:

- **semver 兼容** (新增、更宽松的类型、文档变更);或者
- **semver 破坏性** (重命名 / 删除、签名变化、更严格的类型) ——
  这种情况下版本升级会进入下一个 MINOR,因为我们还在 pre-1.0。

在同一个 PR 中更新 `root-docs/CHANGELOG/` 下的 CHANGELOG 源单元
(全部三个 `>>>>> lang=` 块)并重新生成产物。

