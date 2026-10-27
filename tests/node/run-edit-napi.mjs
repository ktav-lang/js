// Edit regression suite against the N-API native backend: proves the
// Rust-core splice and the pure port agree case-by-case (both must
// produce byte-identical outputs — the suite pins exact strings).

import { editValue, editValueSegments, insertValue, insertValueSegments, removeValue, removeValueSegments, renameKey, renameKeySegments, loads } from "../../dist/ts/node.js";
import { runEditSuite } from "../shared/edit-suite.mjs";

let passed = 0, failed = 0, total = 0;
const mutationCases = [
    [insertValue, "a: 1\n", "b", 2, "a: 1\nb: 2\n"],
    [insertValueSegments, "a: {}\n", ["a", "b"], 2, "a: {b: 2}\n"],
    [removeValue, "a: 1\nb: 2\n", "a", undefined, "b: 2\n"],
    [removeValueSegments, "a: { b: 1 }\n", ["a", "b"], undefined, "a: {}\n"],
    [renameKey, "a: 1\n", "a", "b", "b: 1\n"],
    [renameKeySegments, "a: 1\n", ["a"], "b", "b: 1\n"],
];
for (const [fn, source, path, arg, expected] of mutationCases) {
    const actual = fn === renameKey || fn === renameKeySegments
        ? fn(source, path, arg)
        : arg === undefined ? fn(source, path) : fn(source, path, arg);
    if (actual !== expected) throw new Error(`mutation regression: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
await runEditSuite(
    {
        editValue,
        editValueSegments,
        insertValue, insertValueSegments, removeValue, removeValueSegments, renameKey, renameKeySegments,
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
