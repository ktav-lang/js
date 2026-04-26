// Deno smoke tests for the `/ffi` subexport. Calls into ktav_cabi via
// `Deno.dlopen` and exercises the same parse / dump / bigint / error
// paths covered by the N-API and WASM suites.
//
// Run: deno run --allow-ffi --allow-env --allow-read tests/run-deno-ffi.ts

// @ts-nocheck — TypeScript here is for human eyes; Deno runs the .ts
// file directly without a checker, and the import path resolves to
// the compiled `dist/ts/ffi-deno.js` since deno honours `.js`
// suffixes via the package exports map only when imported by name.

import * as testPaths from "./shared/test-paths.mjs";
import { loads, dumps, setLibraryPath } from "../dist/ts/ffi-deno.js";

if (testPaths.cabiBuilt()) setLibraryPath(testPaths.cabi);

let passed = 0, failed = 0;

async function check(name: string, fn: () => Promise<void>) {
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
port:i 8080
ratio:f 0.75
tls: true
tags: [
    prod
    eu-west-1
]
db.host: primary.internal
db.timeout:i 30
`;

await check("loads basic document", async () => {
    const cfg: any = await loads(SRC);
    if (cfg.service !== "web") throw new Error("service: " + cfg.service);
    if (cfg.port !== 8080) throw new Error("port: " + cfg.port);
    if (cfg.tls !== true) throw new Error("tls: " + cfg.tls);
    if (Math.abs(cfg.ratio - 0.75) > 1e-12) throw new Error("ratio: " + cfg.ratio);
    if (cfg.tags.join(",") !== "prod,eu-west-1") throw new Error("tags");
    if (cfg.db.host !== "primary.internal") throw new Error("db.host");
    if (cfg.db.timeout !== 30) throw new Error("db.timeout");
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
    const back: any = await loads(text);
    if (back.name !== "demo") throw new Error("name");
    if (back.count !== 42) throw new Error("count");
    if (back.flag !== true) throw new Error("flag");
    if (back.nothing !== null) throw new Error("nothing");
});

await check("arbitrary precision integer round-trip", async () => {
    const huge = "99999999999999999999999999999";
    const cfg: any = await loads("value:i " + huge);
    if (typeof cfg.value !== "bigint") throw new Error("not bigint");
    if (cfg.value.toString() !== huge) throw new Error("bigint=" + cfg.value);

    const text = await dumps({ v: BigInt(huge) });
    if (!text.includes(huge)) throw new Error("dump missing huge int");
});

await check("parse error throws", async () => {
    let threw = false;
    try { await loads("a: ["); } catch { threw = true; }
    if (!threw) throw new Error("expected error on unterminated array");
});

await check("dumps rejects non-object root", async () => {
    let threw = false;
    try { await dumps([1, 2, 3] as any); } catch { threw = true; }
    if (!threw) throw new Error("expected rejection of array root");
});

console.log(`\n[deno-ffi] ${passed}/${passed + failed} passed`);
Deno.exit(failed > 0 ? 1 : 0);
