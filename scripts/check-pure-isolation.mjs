// Static isolation check for the pure TypeScript backend: ts/pure.ts and
// everything under ts/pure/ must not import Node builtins, N-API, WASM
// or FFI modules. Exits 1 on any violation. Plain source scan — no build
// or type-check needed.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

const FORBIDDEN = /node:|napi|wasm|ffi/i;

function pureSources() {
    const files = [join(repo, "ts", "pure.ts")];
    const dir = join(repo, "ts", "pure");
    for (const name of readdirSync(dir)) {
        if (name.endsWith(".ts")) files.push(join(dir, name));
    }
    return files;
}

let failed = 0;
for (const file of pureSources()) {
    const text = readFileSync(file, "utf8");
    const importRe = /(?:^|\n)\s*(?:import|export)[^'"]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*\(\s*["']([^"']+)["']\s*\)|(?:^|\n)\s*import\s*["']([^"']+)["']/g;
    let m;
    while ((m = importRe.exec(text)) !== null) {
        const spec = m[1] || m[2] || m[3];
        if (spec && FORBIDDEN.test(spec)) {
            console.error(`✖ ${file}: forbidden import specifier "${spec}"`);
            failed++;
        }
    }
}

if (failed > 0) {
    console.error(`\ncheck-pure-isolation: ${failed} violation(s)`);
    process.exit(1);
}
console.log("✔ check-pure-isolation: ts/pure.ts + ts/pure/*.ts import no node:/napi/wasm/ffi modules");
