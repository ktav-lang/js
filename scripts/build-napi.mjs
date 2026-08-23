#!/usr/bin/env node
// Build the native `.node` binary for the current host via napi-rs.
// Output: dist/native/ktav.<os>-<arch>-<abi>.node
//
// Platform notes:
//   Linux / macOS — standard cargo build works out of the box.
//   Windows       — needs the MSVC toolchain + Windows SDK. If the
//                   SDK isn't installed, fall back to
//                   scripts/build-napi-windows.bat which combines
//                   Visual Studio Build Tools with `cargo-xwin`'s
//                   pre-downloaded SDK cache (requires Windows
//                   Developer Mode — see AGENTS.md).
//
// CI runs normal `cargo build` directly in the platform matrix; this
// script exists mostly for local dev convenience.

import { execSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { platform, arch } from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function triple() {
    const abi = platform === "linux" ? "-gnu" : platform === "win32" ? "-msvc" : "";
    const os = platform === "win32" ? "win32" : platform === "darwin" ? "darwin" : "linux";
    return `${os}-${arch}${abi}`;
}

function rustTarget() {
    // Rust target triple for cargo. Matches the napi-rs triple but
    // reshuffled for Rust's toolchain names.
    if (platform === "win32") return "x86_64-pc-windows-msvc";
    if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    if (platform === "linux") return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
    throw new Error(`Unsupported platform: ${platform}`);
}

function build() {
    if (platform === "win32") {
        // The bat helper handles both canonical VS+SDK setups and the
        // cargo-xwin fallback. Exits non-zero on failure, which we
        // propagate.
        const script = resolve(root, "scripts/build-napi-windows.bat");
        const result = spawnSync(process.env.comspec || "cmd.exe", ["/c", script], {
            cwd: root,
            stdio: "inherit",
        });
        if (result.status !== 0) {
            console.error("[build:napi] build-napi-windows.bat exited non-zero");
            process.exit(result.status ?? 1);
        }
        return;
    }
    // Linux / macOS — straight cargo build.
    const cmd = ["cargo", "build", "--release", "--target", rustTarget(), "-p", "ktav-napi"].join(" ");
    console.log(`[build:napi] ${cmd}`);
    execSync(cmd, { cwd: root, stdio: "inherit" });
}

function copyArtifact() {
    const target = rustTarget();
    const ext = platform === "win32" ? "ktav_napi.dll" : platform === "darwin" ? "libktav_napi.dylib" : "libktav_napi.so";
    const cargoTarget = process.env.CARGO_TARGET_DIR
        ? resolve(process.env.CARGO_TARGET_DIR)
        : resolve(root, "target");
    const src = resolve(cargoTarget, target, "release", ext);
    if (!existsSync(src)) {
        console.error(`[build:napi] expected artifact missing: ${src}`);
        process.exit(1);
    }
    const outDir = resolve(root, "dist/native");
    mkdirSync(outDir, { recursive: true });
    const dst = resolve(outDir, `ktav.${triple()}.node`);
    copyFileSync(src, dst);
    console.log(`[build:napi] ${dst}`);
}

build();
copyArtifact();
