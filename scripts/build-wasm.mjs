#!/usr/bin/env node
// Build two wasm-bindgen targets so a single npm package serves every
// WASM-consuming runtime. package.json `exports` picks the right one
// per runtime at import time.
//
//   web     — ES module for Deno / browser, consumer awaits `ready()`
//   bundler — ES module for webpack / rollup / esbuild / vite, bundler
//             resolves the sibling `.wasm` import at build time
//
// Node and Bun go through the native `.node` binary (crates/napi) —
// see scripts/build-napi.mjs. A `nodejs` wasm-pack target is therefore
// intentionally absent.
//
// `--no-pack` suppresses wasm-pack's own package.json — we ship our own.

import { execSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outRoot = resolve(root, "dist/wasm");

rmSync(outRoot, { recursive: true, force: true });

const targets = [
    ["web", "web"],
    ["bundler", "bundler"],
];

for (const [target, subdir] of targets) {
    const out = resolve(outRoot, subdir);
    const cmd = [
        "wasm-pack",
        "build",
        "--release",
        "--target", target,
        "--out-dir", out,
        "--out-name", "ktav",
        "--no-pack",
        "crates/wasm",
    ].join(" ");
    console.log(`[build:wasm] ${cmd}`);
    execSync(cmd, { cwd: root, stdio: "inherit" });
}

// Sanity check — every target should have emitted a .wasm + .js + .d.ts.
for (const [, subdir] of targets) {
    for (const ext of ["js", "d.ts", "_bg.wasm"]) {
        const file = resolve(outRoot, subdir, `ktav${ext.startsWith("_") ? ext : "." + ext}`);
        if (!existsSync(file)) {
            console.error(`[build:wasm] missing expected artifact: ${file}`);
            process.exit(1);
        }
    }
}

console.log("[build:wasm] web + bundler targets ready under dist/wasm/");
