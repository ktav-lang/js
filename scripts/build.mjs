#!/usr/bin/env node
// Build three wasm-bindgen targets so a single npm package serves every
// supported runtime. package.json `exports` picks the right one per
// runtime at import time.
//
//   node    — CommonJS-ish glue, `require('./ktav_bg.wasm')`
//   web     — ES module, expects consumer to await `init()`
//   bundler — ES module, `.wasm` is an import the bundler resolves
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
    ["nodejs", "node"],
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
    ].join(" ");
    console.log(`[build] ${cmd}`);
    execSync(cmd, { cwd: root, stdio: "inherit" });
}

// Sanity check — every target should have emitted a .wasm + .js + .d.ts.
for (const [, subdir] of targets) {
    for (const ext of ["js", "d.ts", "_bg.wasm"]) {
        const file = resolve(outRoot, subdir, `ktav${ext.startsWith("_") ? ext : "." + ext}`);
        if (!existsSync(file)) {
            console.error(`[build] missing expected artifact: ${file}`);
            process.exit(1);
        }
    }
}

console.log("[build] all three wasm targets ready under dist/wasm/");
