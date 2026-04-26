// Full suite against the N-API path (Node runtime + native `.node`).
// This is the most common consumer configuration so it runs every
// time as part of `npm test`.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

import { loads, dumps } from "../dist/ts/node.js";
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
    readTextFile: (p) => readFileSync(p, "utf8"),
    walkKtavFiles,
    specDir: testPaths.specPresent() ? testPaths.spec.replace(/\\/g, "/") : null,
    label: "node-napi",
    log: (m) => console.log(m),
});

console.log(`\n[node-napi] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
