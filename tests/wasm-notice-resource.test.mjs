import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { addNotice, verifyNotice } from "../scripts/wasm-notice-resource.mjs";

const moduleBytes = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const payload = gzipSync(JSON.stringify({ schema_version: 1, packages: [{ name: "fixture", version: "1" }] }));

test("retains exact payload in a valid non-executed WASM module", () => {
    const result = addNotice(moduleBytes, payload);
    assert.ok(WebAssembly.validate(result));
    assert.ok(result.subarray(0, moduleBytes.length).equals(moduleBytes));
    verifyNotice(result, payload);
    assert.ok(moduleBytes.equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])));
});

test("rejects a duplicate notice section", () => {
    assert.throws(() => addNotice(addNotice(moduleBytes, payload), payload), /already exists/);
});

test("rejects missing notice section", () => {
    assert.throws(() => verifyNotice(moduleBytes, payload), /differs/);
});

test("rejects changed expected compressed bytes", () => {
    const other = gzipSync(JSON.stringify({ schema_version: 1, packages: [{ name: "other" }] }));
    assert.throws(() => verifyNotice(addNotice(moduleBytes, payload), other), /differs/);
});

test("rejects truncated module", () => {
    const result = addNotice(moduleBytes, payload);
    assert.throws(() => verifyNotice(result.subarray(0, result.length - 1), payload), /invalid bounded WASM/);
});

test("rejects non-WASM data", () => {
    assert.throws(() => addNotice(Buffer.from("not wasm"), payload), /invalid bounded WASM/);
});

test("rejects invalid gzip", () => {
    assert.throws(() => addNotice(moduleBytes, Buffer.from("not gzip")), /notice gzip/);
});

test("rejects non-JSON payload", () => {
    assert.throws(() => addNotice(moduleBytes, gzipSync("not JSON")));
});

test("rejects incomplete notice JSON", () => {
    assert.throws(() => addNotice(moduleBytes, gzipSync('{"schema_version":1,"packages":[]}')), /incomplete/);
});

test("preserves unrelated custom sections", () => {
    const withOther = Buffer.concat([moduleBytes, Buffer.from([0, 3, 1, 120, 42])]);
    const result = addNotice(withOther, payload);
    assert.ok(result.subarray(0, withOther.length).equals(withOther));
    verifyNotice(result, payload);
});
