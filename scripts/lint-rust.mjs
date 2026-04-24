#!/usr/bin/env node
// Cross-platform clippy runner for the two Rust crates in the
// workspace. On Windows we force the GNU toolchain for `ktav-wasm`
// so clippy doesn't drag in the MSVC linker just to build the
// proc-macro / build.rs host-side — MinGW's ld is already in PATH.
// `ktav-napi` unavoidably needs MSVC because the final binary links
// against node.dll's import symbols; for the napi crate we invoke
// the same vcvars + optional-xwin wrapper used by build-napi-windows.
//
// Linux / macOS need no of this — default toolchain is gnu-linux or
// apple-darwin; plain `cargo clippy` just works.

import { execSync } from "node:child_process";
import { platform } from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function run(cmd, opts = {}) {
    console.log(`[lint:rust] ${cmd}`);
    execSync(cmd, { cwd: root, stdio: "inherit", ...opts });
}

// `ktav-wasm`: the `clippy-wasm` alias (see .cargo/config.toml)
// locks in the `--target wasm32-unknown-unknown --all-targets`
// incantation. On Windows we force the GNU toolchain so the host
// linker is MinGW's ld rather than MSVC's link.exe, which would
// pull the build scripts / proc-macros through vcvars. On Unix
// the default toolchain is fine.
const toolchainPrefix = platform === "win32" ? "+stable-x86_64-pc-windows-gnu " : "";
run(`cargo ${toolchainPrefix}clippy-wasm -- -D warnings`);

// `ktav-napi`: MSVC-target bound on Windows (linked against
// node.dll imports), the bat wrapper loads vcvars + optional
// xwin libs before invoking `cargo clippy-napi`. Elsewhere, plain
// alias is enough.
if (platform === "win32") {
    run(`cmd /c scripts\\lint-rust-napi-windows.bat`);
} else {
    run(`cargo clippy-napi -- -D warnings`);
}
