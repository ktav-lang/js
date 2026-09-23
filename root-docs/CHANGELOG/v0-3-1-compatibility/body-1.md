>>>>> lang=en
### Compatibility

Strictly additive. Every document valid under 0.3.0 stays valid
under 0.3.1 and produces the same JS value (still an Object). Only
inputs 0.3.0 rejected as `MissingSeparator` (bare-scalar first
lines) are now accepted as Arrays. `dumps` previously rejected
top-level arrays with "must be an object"; that error is gone.
Code that relied on the rejection should re-shape its input.

### Spec

- spec submodule synced to `0.1.1` (top-level Array fixtures added
  under `valid/top_level_array/` and `invalid/top_level/`).

>>>>> lang=ru
### Совместимость

Изменения чисто аддитивные. Каждый документ, валидный в 0.3.0,
остаётся валидным в 0.3.1 и даёт то же JS-значение (всё ещё Object).
Только входы, которые 0.3.0 отвергал как `MissingSeparator` (первая
строка — голый скаляр), теперь принимаются как массивы. Раньше `dumps`
отвергал массив на верхнем уровне с ошибкой "must be an object"; этой
ошибки больше нет. Код, полагавшийся на отказ, должен перестроить свой
вход.

### Spec

- подмодуль spec синхронизирован с `0.1.1` (фикстуры массивов верхнего
  уровня добавлены в `valid/top_level_array/` и `invalid/top_level/`).

>>>>> lang=zh
### 兼容性

变更为纯增量。所有在 0.3.0 下有效的文档在 0.3.1 下依然有效，并产生
相同的 JS 值（仍为 Object）。只有 0.3.0 中以 `MissingSeparator` 拒绝的
输入（首行为裸标量）现在会被接受为数组。此前 `dumps` 会以
"must be an object" 拒绝顶层数组；该错误已消失。依赖该拒绝行为的代码
应重新调整其输入。

### 规范

- spec 子模块同步至 `0.1.1`（顶层 Array fixture 添加于
  `valid/top_level_array/` 与 `invalid/top_level/`）。

