# `@ktav-lang/js-darwin-arm64` 平台二进制包

此包包含兼容平台 `aarch64-apple-darwin` 的预构建 N-API 和 C ABI 库。它是
[`@ktav-lang/ktav`](https://www.npmjs.com/package/@ktav-lang/ktav) 的可选依赖，
通常会自动安装；使用 JavaScript API 时请安装主包。

平台标识和文件名用于保持加载器兼容性，不代表实际使用的编译器。Windows 包保留
含 `msvc` 的旧名称，而本次构建中的库使用 GNU/LLVM。
`native-package-manifest.json` 记录每个库的实际 target、源代码标识及 notices 哈希。

完整的第三方 notices 及所需的原始法律和源代码材料分别保存在
`third_party/napi/` 和 `third_party/cabi/` 中。根目录中的 `LICENSE-MIT` 和
`LICENSE-APACHE` 适用于项目自身代码；捆绑的第三方材料保留其原始条款。
