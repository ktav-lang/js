>>>>> lang=en
# `{{PACKAGE_NAME}}` platform binaries

This package contains the prebuilt N-API and C ABI libraries for the
compatibility platform `{{TARGET_TRIPLE}}`. It is an optional dependency of
[`@ktav-lang/ktav`](https://www.npmjs.com/package/@ktav-lang/ktav) and is normally
installed automatically; install the main package to use the JavaScript API.

Platform identifiers and filenames preserve loader compatibility; they do not
identify the compiler used. Windows packages retain their legacy `msvc` names,
while the libraries in this build use GNU/LLVM. `native-package-manifest.json`
records the actual target, source identity and notice hashes for each library.

Complete third-party notices and required original legal/source materials are
kept separately under `third_party/napi/` and `third_party/cabi/`. The root
`LICENSE-MIT` and `LICENSE-APACHE` files cover the project's own code; the bundled
third-party materials retain their original terms.
>>>>> lang=ru
# Платформенные бинарники `{{PACKAGE_NAME}}`

Этот пакет содержит готовые библиотеки N-API и C ABI для платформы совместимости
`{{TARGET_TRIPLE}}`. Он является необязательной зависимостью
[`@ktav-lang/ktav`](https://www.npmjs.com/package/@ktav-lang/ktav) и обычно
устанавливается автоматически. Для JavaScript API установите основной пакет.

Обозначения платформ и имена файлов сохраняют совместимость с загрузчиками,
но не определяют использованный компилятор. Windows-пакеты сохраняют прежние
имена с `msvc`, а библиотеки этой сборки собраны GNU/LLVM.
`native-package-manifest.json` содержит фактический target, идентификатор исходников
и хеши notices каждой библиотеки.

Полные third-party notices и необходимые оригинальные лицензионные материалы
и исходники сохранены отдельно в `third_party/napi/` и `third_party/cabi/`.
Корневые `LICENSE-MIT` и `LICENSE-APACHE` относятся к собственному коду проекта;
для включённых сторонних материалов сохраняются исходные условия.
>>>>> lang=zh
# `{{PACKAGE_NAME}}` 平台二进制包

此包包含兼容平台 `{{TARGET_TRIPLE}}` 的预构建 N-API 和 C ABI 库。它是
[`@ktav-lang/ktav`](https://www.npmjs.com/package/@ktav-lang/ktav) 的可选依赖，
通常会自动安装；使用 JavaScript API 时请安装主包。

平台标识和文件名用于保持加载器兼容性，不代表实际使用的编译器。Windows 包保留
含 `msvc` 的旧名称，而本次构建中的库使用 GNU/LLVM。
`native-package-manifest.json` 记录每个库的实际 target、源代码标识及 notices 哈希。

完整的第三方 notices 及所需的原始法律和源代码材料分别保存在
`third_party/napi/` 和 `third_party/cabi/` 中。根目录中的 `LICENSE-MIT` 和
`LICENSE-APACHE` 适用于项目自身代码；捆绑的第三方材料保留其原始条款。
