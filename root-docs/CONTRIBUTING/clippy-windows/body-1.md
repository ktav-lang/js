>>>>> lang=en
## Running clippy locally (Windows quirk)

`cargo clippy --target wasm32-unknown-unknown` still compiles host-side
proc-macros and `build.rs` scripts — those always build for the host
triple. On a Windows box whose default toolchain is MSVC (our default
after `rustup override set stable-x86_64-pc-windows-msvc` for the N-API
build), clippy pulls in MSVC's `link.exe` and fails unless the shell
already has `vcvars64.bat` sourced.

Dodge the whole dance by running the wasm-crate clippy through the
GNU toolchain — MinGW's linker is already in PATH, no setup needed:

```bash
cargo +stable-x86_64-pc-windows-gnu clippy-wasm -- -D warnings
```

The `clippy-wasm` / `clippy-napi` aliases live in `.cargo/config.toml`
and lock in the right target flags. For the N-API crate, the MSVC
toolchain is unavoidable (it links against node.dll imports) — wrap
it with `scripts/lint-rust-napi-windows.bat` or just run
`npm run lint:rust`, which dispatches to the right wrapper per
platform.

Linux / macOS need none of this — default toolchain is GNU / Darwin,
`cargo clippy-wasm` and `cargo clippy-napi` work as-is.

>>>>> lang=ru
## Локальный прогон clippy (нюанс Windows)

`cargo clippy --target wasm32-unknown-unknown` всё равно компилирует
host-сторонние proc-macro'ы и `build.rs`-скрипты — они всегда
собираются под HOST-triple. На Windows-машине, где активный toolchain
— MSVC (наш дефолт после `rustup override set stable-x86_64-pc-windows-msvc`
для N-API-сборки), clippy тянет MSVC-овский `link.exe` и падает,
если в шелле не загружен `vcvars64.bat`.

Чтобы обойти всю эту возню, гоняй clippy для wasm-крейта через
GNU-toolchain — линкер MinGW уже в PATH, никакой настройки не нужно:

```bash
cargo +stable-x86_64-pc-windows-gnu clippy-wasm -- -D warnings
```

Алиасы `clippy-wasm` / `clippy-napi` живут в `.cargo/config.toml` и
подставляют нужные `--target`-флаги. Для N-API-крейта MSVC-toolchain
обязателен (линковка против импортов node.dll) — оборачивай через
`scripts/lint-rust-napi-windows.bat` или просто запускай
`npm run lint:rust`, который по платформе сам выберет правильную
обёртку.

На Linux / macOS ничего из этого не нужно — дефолтный toolchain это
GNU / Darwin, `cargo clippy-wasm` и `cargo clippy-napi` работают
как есть.

>>>>> lang=zh
## 在 Windows 本地运行 clippy（注意点）

`cargo clippy --target wasm32-unknown-unknown` 仍然会把宿主侧的 proc-macro
和 `build.rs` 脚本按宿主三元组编译 —— 这两类东西永远是按 host 编译的。
在 Windows 上，如果默认 toolchain 是 MSVC（我们为 N-API 构建执行过
`rustup override set stable-x86_64-pc-windows-msvc` 之后就是这个状态），
clippy 会拉起 MSVC 的 `link.exe`，除非当前 shell 已经 source 过
`vcvars64.bat`，否则就会报错。

绕过这套流程的办法：给 wasm crate 的 clippy 指定 GNU toolchain —— MinGW
的链接器已经在 PATH 里，不用任何配置：

```bash
cargo +stable-x86_64-pc-windows-gnu clippy-wasm -- -D warnings
```

`clippy-wasm` / `clippy-napi` 这两个 alias 写在 `.cargo/config.toml`
里，封装了正确的 target 参数。N-API crate 绕不开 MSVC（需要链接
node.dll 的导入符号）—— 用 `scripts/lint-rust-napi-windows.bat`
包一层，或者直接 `npm run lint:rust`，脚本会按平台选合适的包装器。

Linux / macOS 完全不需要这些 —— 默认 toolchain 就是 GNU / Darwin，
直接 `cargo clippy-wasm` 和 `cargo clippy-napi` 即可。

