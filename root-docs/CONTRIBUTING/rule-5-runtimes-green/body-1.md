>>>>> lang=en
### 5. Every runtime stays green

A change that passes `npm run test:node-napi` but breaks
`npm run test:browser` is not ready to merge. CI runs all five runtime
matrices on every PR — don't gate them out.

>>>>> lang=ru
### 5. Все рантаймы остаются зелёными

Изменение, которое проходит `npm run test:node-napi`, но ломает
`npm run test:browser`, не готово к мерджу. CI прогоняет все пять
рантайм-матриц на каждом PR — не выключайте их.

>>>>> lang=zh
### 5. 每个运行时都保持绿色

只通过 `npm run test:node-napi` 却让 `npm run test:browser` 挂掉的
改动不算可合并。CI 在每个 PR 上都跑完全部五个运行时矩阵 —— 不要
关掉它们。

