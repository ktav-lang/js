>>>>> lang=en
Build + test:

```bash
git clone --recurse-submodules https://github.com/ktav-lang/js.git
cd js
npm install
npm run build           # napi + wasm × 2 + tsc
npm test                # five runtimes, 153 assertions each
```

Build individual pieces:

```bash
npm run build:napi      # .node for the current host
npm run build:wasm      # web + bundler wasm + web/inline
npm run build:ts        # TypeScript facade only
```

>>>>> lang=ru
Сборка и тесты:

```bash
git clone --recurse-submodules https://github.com/ktav-lang/js.git
cd js
npm install
npm run build           # napi + wasm × 2 + tsc
npm test                # пять рантаймов, по 153 ассерта в каждом
```

Собирать по кускам:

```bash
npm run build:napi      # .node под текущий хост
npm run build:wasm      # web + bundler wasm + web/inline
npm run build:ts        # только TypeScript-фасад
```

>>>>> lang=zh
构建与测试:

```bash
git clone --recurse-submodules https://github.com/ktav-lang/js.git
cd js
npm install
npm run build           # napi + wasm × 2 + tsc
npm test                # 五个运行时,每个 153 个断言
```

分块构建:

```bash
npm run build:napi      # 当前主机的 .node
npm run build:wasm      # web + bundler wasm + web/inline
npm run build:ts        # 仅 TypeScript 外观层
```

