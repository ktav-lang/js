// Edit regression suite against the PURE TypeScript backend — proves
// the pure source-edit implementation matches the reference semantics
// with dist/native absent.

import { readFileSync } from "node:fs";

import { loads, editValue, editValueSegments, insertValue, insertValueSegments, removeValue, removeValueSegments, renameKey, renameKeySegments } from "../../dist/ts/pure.js";
import { runEditSuite } from "../shared/edit-suite.mjs";

let passed = 0, failed = 0, total = 0;
async function check(name, fn) {
    total++;
    try {
        await fn();
        console.log("✔ " + name);
        passed++;
    } catch (e) {
        console.log("✖ " + name + " — " + (e?.message || e));
        failed++;
    }
}
await runEditSuite(
    {
        editValue,
        editValueSegments,
        insertValue, insertValueSegments, removeValue, removeValueSegments, renameKey, renameKeySegments,
        loads,
        label: "edit-pure",
        check,
    },
);

void readFileSync;
const ffiMutationNames = ["insertValue", "insertValueSegments", "removeValue", "removeValueSegments", "renameKey", "renameKeySegments"];
await check("Node FFI unsupported entry exports mutation functions", async () => {
    const ffi = await import("@ktav-lang/ktav/ffi");
    for (const name of ffiMutationNames) {
        if (typeof ffi[name] !== "function") throw new Error(`missing named export ${name}`);
        if (typeof ffi.ktav?.[name] !== "function") throw new Error(`missing facade export ${name}`);
        for (const [label, fn] of [["named", ffi[name]], ["facade", ffi.ktav[name]]]) {
            let error;
            const args = name.endsWith("Segments")
                ? (name.startsWith("insert") ? ["", ["key"], null] : name.startsWith("remove") ? ["", ["key"]] : ["", ["key"], "newKey"])
                : (name.startsWith("insert") ? ["", "key", null] : name.startsWith("remove") ? ["", "key"] : ["", "key", "newKey"]);
            try { fn(...args); } catch (e) { error = e; }
            if (!error?.message?.includes("ffi requires Deno or Bun")) {
                throw new Error(`${label} ${name} threw ${JSON.stringify(error?.message)}`);
            }
        }
    }
});
for (const [name,fn,expected] of [
    ["insert block inherits last sibling indent",()=>insertValue("a: {\n    x: 1\n    y: 2\n}\n","a.z",3),"a: {\n    x: 1\n    y: 2\n    z: 3\n}\n"],
    ["insert block empty adds one indent level",()=>insertValue("a: {\n}\n","a.z",3),"a: {\n    z: 3\n}\n"],
    ["insert root inline before trailing whitespace",()=>insertValue("{a: 1}  ","b",2),"{a: 1, b: 2}  "],
    ["insert root inline with newline",()=>insertValue("{a: 1}\n","b",2),"{a: 1, b: 2}\n"],
    ["remove inline block slot member",()=>removeValue("a: {x: 1, y: 2}\n","a.x"),"a: {y: 2}\n"],

    ["insert literal segment",()=>insertValueSegments('"a.b": {}\n',["a.b","x"],1),'"a.b": {x: 1}\n'],
    ["remove textual",()=>removeValue("a: 1\nb: 2\n","a"),"b: 2\n"],
    ["remove literal segment",()=>removeValueSegments('\"a.b\": 1\n',["a.b"]),""],
    ["remove byte offsets after non-ASCII prefix",()=>removeValue("é: 1\na: 2\n","a"),"é: 1\n"],
    ["remove inline nested comma",()=>removeValue("a: [{x: 1, y: 2}, keep]\n","a.0"),"a: [keep]\n"],
    ["remove inline sole object member",()=>removeValue("a: {x: 1}\n","a.x"),"a: {}\n"],
    ["remove inline final array item",()=>removeValue("a: [keep, drop]\n","a.1"),"a: [keep]\n"],
    ["remove dotted leaf preserves empty parent",()=>removeValue("a.b: 1\n", "a.b"),"a: {}\n"],
    ["remove inline middle member keeps separators",()=>removeValue("a: {x: 1, y: 2, z: 3}\n", "a.y"),"a: {x: 1, z: 3}\n"],
    ["rename inline key leaves value intact",()=>renameKey("a: {x: 1, y: 2}\n", "a.x", "long"),"a: {long: 1, y: 2}\n"],
    ["rename textual",()=>renameKey("a: 1\n","a","b"),"b: 1\n"],
    ["rename escaped literal dotted key",()=>renameKey("a\\.b: 1\nc: 2\n", "a\\.b", "m"),"m: 1\nc: 2\n"],
    ["remove does not treat multiline data as comment",()=>removeValue("a: {\n  s: (\n## data\n)\n  x: 1\n}\n","a.x"),"a: {\n  s: (\n## data\n)\n}\n"],
]) { total++; try { const out=fn(); if(out!==expected) throw new Error(JSON.stringify(out)); passed++; console.log("✔ "+name); } catch(e) { failed++; console.log("✖ "+name+" — "+(e?.message||e)); } }
const mutationFixture = "\uFEFFparent: {\r\n    first: 甲\r\n    ## keep middle\r\n    a\\.b: 東京\r\n    last: 終\r\n}\r\n";
for (const mode of ["textual", "segments"]) for (const operation of ["insert", "remove", "rename"]) {
    const path = mode === "textual" ? "parent.a\\.b" : ["parent", "a.b"];
    const insertPath = mode === "textual" ? "parent.added" : ["parent", "added"];
    const label = `${operation} mixed Unicode BOM CRLF ${mode}`;
    const expected = operation === "insert"
        ? "\uFEFFparent: {\r\n    first: 甲\r\n    ## keep middle\r\n    a\\.b: 東京\r\n    last: 終\r\n    added: é\r\n}\r\n"
        : operation === "remove"
            ? "\uFEFFparent: {\r\n    first: 甲\r\n    ## keep middle\r\n    last: 終\r\n}\r\n"
            : "\uFEFFparent: {\r\n    first: 甲\r\n    ## keep middle\r\n    \"c.d\": 東京\r\n    last: 終\r\n}\r\n";
    await check(label, async () => {
        const fn = operation === "insert" ? (mode === "textual" ? insertValue : insertValueSegments)
            : operation === "remove" ? (mode === "textual" ? removeValue : removeValueSegments)
                : (mode === "textual" ? renameKey : renameKeySegments);
        const output = operation === "insert" ? fn(mutationFixture, insertPath, "é")
            : operation === "remove" ? fn(mutationFixture, path)
                : fn(mutationFixture, path, "c.d");
        if (output !== expected) throw new Error(`exact output: ${JSON.stringify(output)}`);
        const semantic = operation === "insert"
            ? { parent: { first: "甲", "a.b": "東京", last: "終", added: "é" } }
            : operation === "remove" ? { parent: { first: "甲", last: "終" } }
                : { parent: { first: "甲", "c.d": "東京", last: "終" } };
        if (JSON.stringify(loads(output)) !== JSON.stringify(semantic)) throw new Error(`semantic oracle: ${JSON.stringify(loads(output))}`);
    });
}
console.log(`\n[edit-pure] ${passed}/${total} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
