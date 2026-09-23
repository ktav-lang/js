>>>>> lang=en
### Fixed

- **CI/release workflows switched from `npm ci` to `npm install`.**
  Strict `npm ci` validation rejects the lockfile when
  `package.json` declares per-platform `optionalDependencies`
  (`@ktav-lang/js-<triple>`) at a version that does not yet exist
  on the npm registry — which is exactly the state at release-time
  when these packages are about to be built and published by the
  workflow's own matrix jobs. `npm install` reconciles
  `package.json` with the lockfile and proceeds. Trade-off:
  marginally slower (re-resolves a few entries) but eliminates the
  chicken-and-egg deadlock that has blocked every release attempt
  since 0.1.3.

npm: `ktav@0.1.5` (main) + `@ktav-lang/js-<triple>@0.1.5` (eight platform packages).

>>>>> lang=ru
### Исправлено

- **CI/release workflow-ы переведены с `npm ci` на `npm install`.**
  Строгая валидация `npm ci` отвергает lockfile, когда `package.json`
  декларирует per-platform `optionalDependencies`
  (`@ktav-lang/js-<triple>`) в версии, которой ещё нет на npm-реестре
  — а это именно состояние на момент релиза, когда эти пакеты как раз
  собираются и публикуются собственными matrix-job-ами workflow-а.
  `npm install` примиряет `package.json` с lockfile и продолжает.
  Trade-off: чуть медленнее (передоразрешает несколько записей), но
  устраняет chicken-and-egg deadlock, который блокировал каждую
  попытку релиза начиная с 0.1.3.

npm: `ktav@0.1.5` (main) + `@ktav-lang/js-<triple>@0.1.5` (восемь
платформенных пакетов).

>>>>> lang=zh
### 修复

- **CI/release workflow 由 `npm ci` 改为 `npm install`。** 当
  `package.json` 中以 npm registry 上尚不存在的版本声明 per-platform
  `optionalDependencies`（`@ktav-lang/js-<triple>`）时，严格的
  `npm ci` 会拒绝 lockfile —— 而这正是发布时的状态，因为这些包
  正要由 workflow 自己的 matrix 作业构建并发布。`npm install` 会让
  `package.json` 与 lockfile 调和后继续。代价：略慢（重新解析少数
  条目），但消除了自 0.1.3 起阻塞每一次发布尝试的循环依赖死锁。

npm: `ktav@0.1.5`（main）+ `@ktav-lang/js-<triple>@0.1.5`（8 个平台包）。

