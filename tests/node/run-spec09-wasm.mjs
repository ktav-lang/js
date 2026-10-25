// Spec 0.9 conformance against the WASM backend (Node driving the web
// entrypoint): the full corpus — all 412 fixtures, the five category
// guards, and the 72 new expected_location checks — through the same
// adapter surface as the pure/napi drivers. `loadsBytes` is the
// public raw-byte entry (spec § 3.1/§ 6.15): the malformed-UTF8 and
// utf8_priority fixtures reach the parser as the EXACT original bytes.

import { readFileSync } from "node:fs";

import { ready, loads, loadsStrict, loadsBytes, dumps, canonicalFromSource } from "../../dist/ts/web.js";
import { runFfiCorpus09 } from "../ffi/corpus09.mjs";

await ready();

let passed = 0, failed = 0, total = 0;
await runFfiCorpus09({
    loads,
    loadsStrict,
    loadsBytes,
    dumps,
    canonicalFromSource,
    label: "spec09-wasm",
    check: async (name, fn) => {
        total++;
        try {
            await fn();
            console.log("✔ " + name);
            passed++;
        } catch (e) {
            console.log("✖ " + name + " — " + (e?.message || e));
            failed++;
        }
    },
});

console.log(`\n[spec09-wasm] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
