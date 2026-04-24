// Same suite, driven through the wasm web target initialized in Node.
// Exercises `crates/wasm` without spinning up a headless browser.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runAll } from "./shared/assertions.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

const wasmJsPath = resolve(repo, "dist/wasm/web/ktav.js");
const wasmBinPath = resolve(repo, "dist/wasm/web/ktav_bg.wasm");
if (!existsSync(wasmJsPath) || !existsSync(wasmBinPath)) {
    console.error("dist/wasm/web missing — run `npm run build:wasm` first.");
    process.exit(1);
}

const mod = await import(pathToFileURL(wasmJsPath).href);
await mod.default({ module_or_path: readFileSync(wasmBinPath) });

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

function specDir() {
    const env = process.env.KTAV_SPEC_DIR;
    if (env && existsSync(join(env, "versions"))) return env.replace(/\\/g, "/");
    const submodule = join(repo, "spec");
    if (existsSync(join(submodule, "versions"))) return submodule.replace(/\\/g, "/");
    const sibling = resolve(repo, "..", "spec");
    if (existsSync(join(sibling, "versions"))) return sibling.replace(/\\/g, "/");
    return null;
}

const { passed, failed, total } = runAll({
    loads: mod.loads,
    dumps: mod.dumps,
    readTextFile: (p) => readFileSync(p, "utf8"),
    walkKtavFiles,
    specDir: specDir(),
    label: "node-wasm",
    log: (m) => console.log(m),
});

console.log(`\n[node-wasm] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
