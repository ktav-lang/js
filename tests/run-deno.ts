// Deno driver for the shared assertion set. Deno runs the same
// web-target wasm as the browser — pre-read the `.wasm` via
// `Deno.readFile` so `init()` doesn't have to `fetch()`.
// Run: deno run --allow-read --allow-env tests/run-deno.ts

// Go through the compiled TS facade (`dist/ts/web.js`) so we
// exercise the same import path real Deno consumers would see via
// package.json `exports`. That bundle uses the inline wasm build,
// so there's no `.wasm` fetch — just `await ready()` once.
import { loads, dumps, stringifyForceStrings, ready } from "../dist/ts/web.js";
// @ts-expect-error — plain .mjs, no type-decls; run-time is fine.
import { runAll } from "./shared/assertions.mjs";
// @ts-expect-error — plain .mjs, no type-decls; run-time is fine.
import * as testPaths from "./shared/test-paths.mjs";

await ready();

function walkKtavFiles(dir: string): string[] {
    try {
        Deno.statSync(dir);
    } catch {
        return [];
    }
    const out: string[] = [];
    for (const entry of Deno.readDirSync(dir)) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory) out.push(...walkKtavFiles(full));
        else if (entry.name.endsWith(".ktav")) out.push(full);
    }
    return out;
}

const { passed, failed, total } = runAll({
    loads,
    dumps,
    stringifyForceStrings,
    readTextFile: (p: string) => Deno.readTextFileSync(p),
    walkKtavFiles,
    specDir: testPaths.specPresent() ? testPaths.spec.replace(/\\/g, "/") : null,
    label: "deno",
    log: (m: string) => console.log(m),
});

console.log(`\n[deno] ${passed}/${total} passed, ${failed} failed`);
Deno.exit(failed > 0 ? 1 : 0);
