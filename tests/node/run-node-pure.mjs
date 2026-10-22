// Full suite driven by the PURE TypeScript backend (dist/ts/pure.js) —
// zero native/WASM/FFI code. Mirrors run-node-napi.mjs adapter-for-adapter
// and additionally supplies loadsBytes so the spec 0.8.1 invalid_utf8/
// fixtures are exercised as raw bytes. Proves the pure backend can run
// the entire conformance suite with dist/native absent.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
    loads,
    loadsStrict,
    loadsBytes,
    dumps,
    stringifyForceStrings,
    format,
    canonicalFromSource,
} from "../../dist/ts/pure.js";
import { runAll } from "../shared/assertions.mjs";
import * as testPaths from "../shared/test-paths.mjs";

// Native-free proof: the pure entrypoint must load with no native
// artefacts present. There is nothing to prewarm or link here — if this
// import failed, the process would already have exited above via the
// unhandled error. (run-node-napi.mjs requires dist/native implicitly;
// this runner must not.)
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

function listJsonFiles(dir) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...listJsonFiles(full));
        else if (full.endsWith(".json")) out.push(full.replace(/\\/g, "/"));
    }
    return out;
}

function listDirectories(dir) {
    return readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => join(dir, entry.name).replace(/\\/g, "/"));
}

const { passed, failed, total } = runAll({
    loads,
    loadsStrict,
    loadsBytes,
    dumps,
    stringifyForceStrings,
    format,
    canonicalFromSource,
    readTextFile: (p) => readFileSync(p, "utf8"),
    readBytes: (p) => new Uint8Array(readFileSync(p)),
    walkKtavFiles,
    listJsonFiles,
    listDirectories,
    specDir: testPaths.specPresent() ? testPaths.spec.replace(/\\/g, "/") : null,
    label: "node-pure",
    log: (m) => console.log(m),
});

console.log(`\n[node-pure] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
