// Edit regression suite against the PURE TypeScript backend — proves
// the pure source-edit implementation matches the reference semantics
// with dist/native absent.

import { readFileSync } from "node:fs";

import { loads, editValue, editValueSegments } from "../../dist/ts/pure.js";
import { runEditSuite } from "../shared/edit-suite.mjs";

let passed = 0, failed = 0, total = 0;
await runEditSuite(
    {
        editValue,
        editValueSegments,
        loads,
        label: "edit-pure",
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

void readFileSync;
console.log(`\n[edit-pure] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
