// Spec 0.9 conformance against the PURE backend — required in CI:
// all five category guards plus the new expected_location validation
// (line / start / end-or-minimum_end, raw UTF-8 byte offsets, BOM and
// CRLF/CR/LF preserved, line_text null for invalid UTF-8).

import { readFileSync } from "node:fs";

import { loads, loadsStrict, loadsBytes, dumps, canonicalFromSource } from "../../dist/ts/pure.js";
import { runFfiCorpus09 } from "../ffi/corpus09.mjs";

let passed = 0, failed = 0, total = 0;
await runFfiCorpus09(
    {
        loads,
        loadsStrict,
        loadsBytes,
        dumps,
        canonicalFromSource,
        label: "spec09-pure",
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

console.log(`\n[spec09-pure] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
