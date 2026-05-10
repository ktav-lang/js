// Bun driver for the shared assertion set. Bun supports N-API
// natively, so `../dist/ts/node.js` resolves to the same `.node`
// binary Node loads. `bun:test` / Jest compatibility layers are
// avoided — the suite is plain throw-on-fail so it needs no runner.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

import { loads, dumps, stringifyForceStrings } from "../dist/ts/node.js";
import { runAll } from "./shared/assertions.mjs";
import * as testPaths from "./shared/test-paths.mjs";

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

const { passed, failed, total } = runAll({
    loads,
    dumps,
    stringifyForceStrings,
    readTextFile: (p) => readFileSync(p, "utf8"),
    walkKtavFiles,
    specDir: testPaths.specPresent() ? testPaths.spec.replace(/\\/g, "/") : null,
    label: "bun",
    log: (m) => console.log(m),
});

console.log(`\n[bun] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
