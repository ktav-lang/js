// Edit regression suite against the WASM backend (Node driving the
// web entrypoint): the wasm core must produce byte-identical outputs
// to the pinned reference strings.

import { ready, editValue, editValueSegments, insertValue, insertValueSegments, removeValue, removeValueSegments, renameKey, renameKeySegments, loads } from "../../dist/ts/web.js";
import { runEditSuite } from "../shared/edit-suite.mjs";

await ready();

let passed = 0, failed = 0, total = 0;
for (const [fn, source, path, arg, expected] of [
    [insertValue, "a: 1\n", "b", 2, "a: 1\nb: 2\n"],
    [insertValueSegments, "a: {}\n", ["a", "b"], 2, "a: {b: 2}\n"],
    [removeValue, "a: 1\nb: 2\n", "a", undefined, "b: 2\n"],
    [removeValueSegments, "a: { b: 1 }\n", ["a", "b"], undefined, "a: {}\n"],
    [renameKey, "a: 1\n", "a", "b", "b: 1\n"],
    [renameKeySegments, "a: 1\n", ["a"], "b", "b: 1\n"],
]) {
    const actual = fn === renameKey || fn === renameKeySegments ? fn(source, path, arg) : arg === undefined ? fn(source, path) : fn(source, path, arg);
    if (actual !== expected) throw new Error(`mutation regression: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
await runEditSuite(
    {
        editValue,
        editValueSegments,
        insertValue, insertValueSegments, removeValue, removeValueSegments, renameKey, renameKeySegments,
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
