// Bun driver for the shared assertion set. Bun supports N-API
// natively, so `../dist/ts/node.js` resolves to the same `.node`
// binary Node loads. `bun:test` / Jest compatibility layers are
// avoided — the suite is plain throw-on-fail so it needs no runner.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loads, dumps } from "../dist/ts/node.js";
import { runAll } from "./shared/assertions.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

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
    loads,
    dumps,
    readTextFile: (p) => readFileSync(p, "utf8"),
    walkKtavFiles,
    specDir: specDir(),
    label: "bun",
    log: (m) => console.log(m),
});

console.log(`\n[bun] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
