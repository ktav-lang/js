// Edit regression suite against the N-API native backend: proves the
// Rust-core splice and the pure port agree case-by-case (both must
// produce byte-identical outputs — the suite pins exact strings).

import { editValue, editValueSegments, loads } from "../../dist/ts/node.js";
import { runEditSuite } from "../shared/edit-suite.mjs";

let passed = 0, failed = 0, total = 0;
await runEditSuite(
    {
        editValue,
        editValueSegments,
        loads,
        label: "edit-napi",
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

console.log(`\n[edit-napi] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
