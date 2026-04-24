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
import { rmSync, existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
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

    // wasm-pack drops a `.gitignore` with `*` inside the output dir.
    // npm's `files` field respects nested .gitignore files, so this
    // would silently strip every wasm artifact from the published
    // tarball. Remove it — the outer dist/ is already gitignored at
    // the repo level via .gitignore.
    const spurious = resolve(out, ".gitignore");
    if (existsSync(spurious)) rmSync(spurious);
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

// Build a self-contained `ktav.inline.js` for the web target: copy of
// the wasm-pack glue with the sibling `.wasm` fetch replaced by a
// base64-decoded Uint8Array. Result: a single file drops into any
// `<script type=module>` without a sibling file, no fetch, works
// from `file://`. ≈ +35 % ungzipped, ≈ +3 % after gzip on this
// workload — the base64 bloat compresses well against the wasm's
// own near-random bytes.
function buildWebInline() {
    const webDir = resolve(outRoot, "web");
    const jsSrc = readFileSync(resolve(webDir, "ktav.js"), "utf8");
    const wasmBytes = readFileSync(resolve(webDir, "ktav_bg.wasm"));
    const b64 = wasmBytes.toString("base64");

    const helpers = `
// Injected by scripts/build-wasm.mjs — decodes the inlined wasm on
// first call; result is cached so repeated init() calls don't repay
// the base64 cost.
const __KTAV_INLINE_WASM_BASE64 = ${JSON.stringify(b64)};
let __ktavInlineBytes = null;
function __ktavInlineWasm() {
    if (__ktavInlineBytes !== null) return __ktavInlineBytes;
    if (typeof globalThis.Buffer !== "undefined") {
        // Node / Bun path — Buffer is ~10x faster than atob for this size.
        __ktavInlineBytes = Uint8Array.from(globalThis.Buffer.from(__KTAV_INLINE_WASM_BASE64, "base64"));
    } else {
        const bin = atob(__KTAV_INLINE_WASM_BASE64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        __ktavInlineBytes = out;
    }
    return __ktavInlineBytes;
}
`;
    // Replace the single line that grabs the sibling `.wasm` URL with
    // a call into our inline-decoder. Keep everything else identical,
    // including the Response / string / URL branches — callers can
    // still pass a custom `module_or_path` if they want.
    const patched = jsSrc.replace(
        `module_or_path = new URL('ktav_bg.wasm', import.meta.url);`,
        `module_or_path = __ktavInlineWasm();`,
    );
    if (patched === jsSrc) {
        console.error("[build:wasm] inline: expected `new URL('ktav_bg.wasm'...` in ktav.js not found");
        process.exit(1);
    }

    writeFileSync(resolve(webDir, "ktav.inline.js"), helpers + patched);
    // Same TypeScript shape as the fetch-based entry.
    copyFileSync(resolve(webDir, "ktav.d.ts"), resolve(webDir, "ktav.inline.d.ts"));
}

buildWebInline();

console.log("[build:wasm] web + bundler + web/inline targets ready under dist/wasm/");
