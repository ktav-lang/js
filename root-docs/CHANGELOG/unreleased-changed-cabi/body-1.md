>>>>> lang=en
- Migrated `crates/cabi`/`crates/napi`/`crates/wasm` to a single
  `ktav::declare_cabi!()` invocation (ktav's `cabi` feature) instead of
  a hand-rolled C ABI shim; the exported symbol surface is unchanged,
  so the JS/TS API is unaffected. Dependency floor raised to
  `ktav = "0.8"`, `[package.metadata.ktav] spec-version` set to
  `"0.8.0"` in all three crates, spec submodule re-pinned to `v0.8.0`
  (adds § 5.2: a decimal with a redundant leading zero parses as a
  String, not an Integer).
- The package version moves to **0.8.0**, in step with the core and the
  specification.
- `npm publish` now runs with `--provenance` so npm's Trusted
  Publishing (OIDC) engages instead of a long-lived `NPM_TOKEN`.
- The conformance suite reads `spec/versions/0.8/tests` (it silently
  kept reading the stale `0.7` corpus after the submodule was re-pinned
  to `0.8.0` — the path was hardcoded, not derived from the pin) and
  executes every fixture category the corpus ships, including the new
  `strict-lossy/` (`loads()` must equal the lax value, `loadsStrict()`
  must throw with the matching reason, body and canonical form). A
  guard test fails the build if an unrecognized category directory
  appears under the corpus, so a future addition can't repeat this
  silently.

>>>>> lang=ru
- `crates/cabi`/`crates/napi`/`crates/wasm` переведены на единственный
  вызов `ktav::declare_cabi!()` (фича `cabi` крейта ktav) вместо
  рукописной C ABI-прослойки; набор экспортируемых символов не
  изменился, поэтому JS/TS API не затронут. Нижняя граница зависимости
  поднята до `ktav = "0.8"`, `[package.metadata.ktav] spec-version`
  установлен в `"0.8.0"` во всех трёх крейтах, подмодуль spec
  перезакреплён на `v0.8.0` (добавлен § 5.2: десятичное число с
  избыточным ведущим нулём разбирается как String, а не Integer).
- Версия пакета — **0.8.0**, синхронно с ядром и спецификацией.
- `npm publish` теперь запускается с `--provenance`, чтобы работала
  Trusted Publishing (OIDC) npm вместо долгоживущего `NPM_TOKEN`.
- Набор конформных тестов читает `spec/versions/0.8/tests` (после
  перезакрепления сабмодуля на `0.8.0` он молча продолжал читать
  устаревший корпус `0.7` — путь был захардкожен, а не выведен из
  пина) и исполняет все категории корпуса, включая новую
  `strict-lossy/` (`loads()` обязан совпасть с lax-значением,
  `loadsStrict()` обязан выбросить исключение с соответствующей
  причиной, телом и канонической формой). Guard-тест обрушивает сборку
  при появлении нераспознанной категории в корпусе, чтобы это не
  повторилось молча.

>>>>> lang=zh
- `crates/cabi`/`crates/napi`/`crates/wasm` 改为单次调用
  `ktav::declare_cabi!()`（ktav 的 `cabi` 特性），取代手写的 C ABI
  垫片；导出的符号集不变，因此 JS/TS API 不受影响。依赖下限提升至
  `ktav = "0.8"`，三个 crate 的 `[package.metadata.ktav] spec-version`
  均设为 `"0.8.0"`，spec 子模块重新固定到 `v0.8.0`（新增 § 5.2：
  带有多余前导零的十进制数解析为 String，而非 Integer）。
- 包版本升至 **0.8.0**，与核心和规范同步。
- `npm publish` 现在带 `--provenance` 运行，以启用 npm 的 Trusted
  Publishing（OIDC），取代长期有效的 `NPM_TOKEN`。
- 一致性测试套件读取 `spec/versions/0.8/tests`(子模块重新固定到
  `0.8.0` 之后，它一直静默读取过期的 `0.7` 语料——路径是硬编码的，
  并非从固定版本推导而来），并执行语料中的每个类别，包括新增的
  `strict-lossy/`（`loads()` 必须等于 lax 值，`loadsStrict()` 必须以
  匹配的原因、body 与规范形式抛出异常）。一个 guard 测试会在语料中
  出现无法识别的类别目录时使构建失败，以防止这个问题再次悄然发生。

