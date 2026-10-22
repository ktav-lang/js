// Cross-backend agreement: pure (dist/ts/pure.js) vs N-API (dist/ts/node.js)
// vs wasm-in-Node (dist/wasm/web). FAILS if any backend import fails —
// no silent fallback.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runCrossBackend } from "../shared/cross-backend.mjs";
import * as testPaths from "../shared/test-paths.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// tests/node → ../.. = repo root (same convention as
// tests/shared/test-paths.mjs). One level up would be tests/, and
// every dist path below would resolve inside the test tree.
const repo = resolve(here, "..", "..");

// --- pure -----------------------------------------------------------
const pure = await import(pathToFileURL(resolve(repo, "dist/ts/pure.js")).href);

// --- napi -----------------------------------------------------------
const napiPath = resolve(repo, "dist/ts/node.js");
if (!existsSync(napiPath)) {
    console.error("dist/ts/node.js missing — run `npm run build` (napi + ts) first.");
    process.exit(1);
}
const napi = await import(pathToFileURL(napiPath).href);

// --- wasm -----------------------------------------------------------
const wasmJsPath = resolve(repo, "dist/wasm/web/ktav.js");
const wasmBinPath = resolve(repo, "dist/wasm/web/ktav_bg.wasm");
if (!existsSync(wasmJsPath) || !existsSync(wasmBinPath)) {
    console.error("dist/wasm/web missing — run `npm run build:wasm` first.");
    process.exit(1);
}
const wasmMod = await import(pathToFileURL(wasmJsPath).href);
await wasmMod.default({ module_or_path: readFileSync(wasmBinPath) });
import { toKtavError } from "../../dist/ts/internal/api.js";
const withKtavErrors = (fn) => (...args) => {
    try { return fn(...args); }
    catch (e) { throw toKtavError(e); }
};
const wasm = {
    loads: withKtavErrors(wasmMod.loads),
    loadsStrict: withKtavErrors(wasmMod.loadsStrict),
    dumps: withKtavErrors(wasmMod.dumps),
    canonicalFromSource: withKtavErrors(wasmMod.canonicalFromSource),
    format: withKtavErrors(wasmMod.format),
};

function walkKtavFiles(dir) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...walkKtavFiles(full));
        else if (full.endsWith(".ktav")) out.push(full.replace(/\\/g, "/"));
    }
    return out;
}

const { passed, failed, total } = runCrossBackend({
    backends: {
        "pure": {
            loads: pure.loads,
            loadsStrict: pure.loadsStrict,
            dumps: pure.dumps,
            canonicalFromSource: pure.canonicalFromSource,
            format: pure.format,
        },
        "napi": {
            loads: napi.loads,
            loadsStrict: napi.loadsStrict,
            dumps: napi.dumps,
            canonicalFromSource: napi.canonicalFromSource,
            format: napi.format,
        },
        "wasm": {
            loads: wasm.loads,
            loadsStrict: wasm.loadsStrict,
            dumps: wasm.dumps,
            canonicalFromSource: wasm.canonicalFromSource,
            format: wasm.format,
        },
    },
    readTextFile: (p) => readFileSync(p, "utf8"),
    readBytes: (p) => new Uint8Array(readFileSync(p)),
    walkKtavFiles,
    specDir: testPaths.specPresent() ? testPaths.spec.replace(/\\/g, "/") : null,
    log: (m) => console.log(m),
});

console.log(`\n[cross-backend] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
