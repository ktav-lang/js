// Bun smoke tests for the `/ffi` subexport. Calls into ktav_cabi via
// `bun:ffi` and exercises the same parse / dump / bigint / error paths
// covered by the N-API and WASM suites.
//
// Run: bun run tests/run-bun-ffi.mjs
//
// Skip conditions:
//   - Not running under Bun → exit 0 with note.
//   - cabi binary not built at `target/release/...` → exit 0.

import * as testPaths from "./shared/test-paths.mjs";
import { loads, dumps, stringifyForceStrings, setLibraryPath } from "../dist/ts/ffi-bun.js";

if (testPaths.cabiBuilt()) setLibraryPath(testPaths.cabi);

function isBun() {
    return typeof globalThis.Bun !== "undefined";
}

if (!isBun()) {
    console.log("[bun-ffi] not Bun — skipping");
    process.exit(0);
}

let passed = 0, failed = 0;

async function check(name, fn) {
    try {
        await fn();
        console.log("✔ " + name);
        passed++;
    } catch (e) {
        console.log("✖ " + name + " — " + (e?.message || e));
        failed++;
    }
}

const SRC = `
service: web
port: 8080
ratio: 0.75
tls: true
tags: [
    prod
    eu-west-1
]
db.host: primary.internal
db.timeout: 30
`;

await check("loads basic document", async () => {
    const cfg = await loads(SRC);
    if (cfg.service !== "web") throw new Error("service: " + cfg.service);
    if (cfg.port !== 8080) throw new Error("port: " + cfg.port);
    if (cfg.tls !== true) throw new Error("tls: " + cfg.tls);
    if (Math.abs(cfg.ratio - 0.75) > 1e-12) throw new Error("ratio: " + cfg.ratio);
    if (cfg.tags.join(",") !== "prod,eu-west-1") throw new Error("tags: " + cfg.tags);
    if (cfg.db.host !== "primary.internal") throw new Error("db.host: " + cfg.db.host);
    if (cfg.db.timeout !== 30) throw new Error("db.timeout: " + cfg.db.timeout);
});

await check("round-trip simple document", async () => {
    const doc = {
        name: "demo",
        count: 42,
        ratio: 0.5,
        flag: true,
        nothing: null,
        nested: { inner: 1 },
    };
    const text = await dumps(doc);
    if (typeof text !== "string" || text.length === 0) throw new Error("empty dump");
    const back = await loads(text);
    if (back.name !== "demo") throw new Error("name");
    if (back.count !== 42) throw new Error("count");
    if (back.flag !== true) throw new Error("flag");
    if (back.nothing !== null) throw new Error("nothing");
});

await check("arbitrary precision integer round-trip", async () => {
    // Under spec 0.5.0 integers that overflow i64 are kept as strings.
    const huge = "99999999999999999999999999999";
    const cfg = await loads("value: " + huge);
    if (typeof cfg.value !== "string") throw new Error("not string: " + typeof cfg.value);
    if (cfg.value !== huge) throw new Error("value=" + cfg.value);

    const text = await dumps({ v: huge });
    if (!text.includes(huge)) throw new Error("dump missing huge int: " + text);
});

await check("parse error throws", async () => {
    let threw = false;
    try { await loads("a: ["); } catch { threw = true; }
    if (!threw) throw new Error("expected error on unterminated array");
});

await check("dumps rejects scalar root", async () => {
    let threw = false;
    try { await dumps(42); } catch { threw = true; }
    if (!threw) throw new Error("expected rejection of scalar root");
});

// spec 0.5.0: top-level Array now accepted by dumps and parsed by loads.
await check("0.1.1: top-level Array round-trip", async () => {
    const arr = ["alpha", 1, 2.5, true, null];
    const text = await dumps(arr);
    const back = await loads(text);
    if (!Array.isArray(back)) throw new Error("expected Array, got " + typeof back);
    if (back.join(",") !== "alpha,1,2.5,true,") throw new Error("array mismatch: " + JSON.stringify(back));
});

// 0.3.1: stringifyForceStrings — every scalar coerced to a String.
await check("0.3.1: stringifyForceStrings flattens scalars", async () => {
    const text = await stringifyForceStrings({ port: 8080, ratio: 0.5, tls: true });
    if (/:i\s/.test(text) || /:f\s/.test(text)) throw new Error(":i/:f leaked: " + text);
    const back = await loads(text);
    if (back.port !== "8080") throw new Error("port=" + back.port);
    if (back.ratio !== "0.5") throw new Error("ratio=" + back.ratio);
    if (back.tls !== "true") throw new Error("tls=" + back.tls);
});

console.log(`\n[bun-ffi] ${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
