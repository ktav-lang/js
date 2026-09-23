>>>>> lang=en
### Tests

- New Bun + Deno smoke suites for the `/ffi` path
  (`tests/run-bun-ffi.mjs`, `tests/run-deno-ffi.ts`). CI runs both
  on Linux / macOS / Windows.

### Build plumbing

- `release.yml` cross-compiles `aarch64-unknown-linux-musl` via
  `cargo-zigbuild` + `zig`, gated behind a per-target setup step so
  the other 7 entries don't pay the 150 MB zig download.
- `.cargo/config.toml` disables `crt-static` on musl targets — Rust's
  default refuses `cdylib` otherwise.

Everything else — the public API, type mapping, runtime support — is
unchanged from 0.1.0.

>>>>> lang=ru
### Тесты

- Новые smoke-сьюты под Bun + Deno для `/ffi`-пути
  (`tests/run-bun-ffi.mjs`, `tests/run-deno-ffi.ts`). CI гоняет оба
  на Linux / macOS / Windows.

### Внутренности сборки

- `release.yml` кросс-компилирует `aarch64-unknown-linux-musl`
  через `cargo-zigbuild` + `zig`, шаг установки zig условно — только
  для этого target'а, остальные 7 не тянут лишние 150 МБ.
- `.cargo/config.toml` отключает `crt-static` на musl-targets — без
  этого Rust не соглашается собирать `cdylib`.

Остальное — публичный API, type mapping, поддержка рантаймов — без
изменений с 0.1.0.

>>>>> lang=zh
### 测试

- 为 `/ffi` 路径新增 Bun + Deno smoke 套件
  (`tests/run-bun-ffi.mjs`、`tests/run-deno-ffi.ts`)。
  CI 在 Linux / macOS / Windows 上分别运行。

### 构建管线

- `release.yml` 通过 `cargo-zigbuild` + `zig` 交叉编译
  `aarch64-unknown-linux-musl`；zig 的安装步骤按 target 条件启用，
  其他 7 个 target 不为此下载 150 MB 的 zig。
- `.cargo/config.toml` 针对 musl 目标关闭 `crt-static`—— 否则
  Rust 拒绝生成 `cdylib`。

其他内容—— 公开 API、类型映射、运行时支持 —— 相对 0.1.0 没有变化。

