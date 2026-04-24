// Smoke test — covers the full round-trip on the node entrypoint.
// Run after `npm run build` so the compiled TS + wasm exist under dist/.
//
//     node --test tests/
//
// Broader conformance against the spec-submodule fixtures lives in
// tests/conformance.test.mjs (TODO).

import { test } from "node:test";
import assert from "node:assert/strict";

// Deliberately imports the package name via path so running from a git
// checkout without an npm install works. CI / published consumers go
// through `import { loads, dumps } from "ktav"`.
import { loads, dumps } from "../dist/ts/node.js";

test("round-trip preserves scalars and nested shape", () => {
    const doc = `
port:i 8080
host: localhost
ratio:f 0.5
tls: true
tags: [
    alpha
    beta
    gamma
]
db.name: primary
db.timeout:i 30
`;
    const parsed = loads(doc);
    assert.equal(parsed.port, 8080);
    assert.equal(parsed.host, "localhost");
    assert.equal(parsed.ratio, 0.5);
    assert.equal(parsed.tls, true);
    assert.deepEqual(parsed.tags, ["alpha", "beta", "gamma"]);
    assert.equal(parsed.db.name, "primary");
    assert.equal(parsed.db.timeout, 30);

    const rendered = dumps(parsed);
    const reparsed = loads(rendered);
    assert.deepEqual(reparsed, parsed);
});

test("generic type parameter is an unchecked cast", () => {
    /** @typedef {{ port: number; host: string }} Config */
    /** @type {Config} */
    const cfg = loads(`port:i 8080\nhost: localhost\n`);
    assert.equal(typeof cfg.port, "number");
    assert.equal(typeof cfg.host, "string");
});

test("bigint round-trip for out-of-range integers", () => {
    const big = "123456789012345678901234567890";
    const parsed = loads(`value:i ${big}\n`);
    assert.equal(typeof parsed.value, "bigint");
    assert.equal(parsed.value.toString(), big);
});

test("dumps rejects non-object at top level", () => {
    assert.throws(() => dumps([1, 2, 3]), /object/i);
});
