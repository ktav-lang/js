// Edit regression suite against the WASM backend (Node driving the
// web entrypoint): the wasm core must produce byte-identical outputs
// to the pinned reference strings.

import { ready, editValue, editValueSegments, loads } from "../../dist/ts/web.js";
import { runEditSuite } from "../shared/edit-suite.mjs";

await ready();

let passed = 0, failed = 0, total = 0;
await runEditSuite(
    {
        editValue,
        editValueSegments,
        loads,
        label: "edit-wasm",
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

console.log(`\n[edit-wasm] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
