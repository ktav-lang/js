// Spec 0.9 conformance against the N-API native backend — the same
// five-category guards and expected_location validation as the pure
// driver; native and pure must agree envelope-for-envelope.

import { readFileSync } from "node:fs";

import { loads, loadsStrict, loadsBytes, dumps, canonicalFromSource } from "../../dist/ts/node.js";
import { runFfiCorpus09 } from "../ffi/corpus09.mjs";

let passed = 0, failed = 0, total = 0;
await runFfiCorpus09(
    {
        loads,
        loadsStrict,
        loadsBytes,
        dumps,
        canonicalFromSource,
        label: "spec09-napi",
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
    },
);

console.log(`\n[spec09-napi] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
