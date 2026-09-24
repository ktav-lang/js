// Deno smoke tests for the `/ffi` subexport. Calls into ktav_cabi via
// `Deno.dlopen` and exercises the same parse / dump / bigint / error
// paths covered by the N-API and WASM suites.
//
// Run: deno run --allow-ffi --allow-env --allow-read tests/deno/run-deno-ffi.ts

// @ts-nocheck — TypeScript here is for human eyes; Deno runs the .ts
// file directly without a checker, and the import path resolves to
// the compiled `dist/ts/ffi-deno.js` since deno honours `.js`
// suffixes via the package exports map only when imported by name.

import * as testPaths from "../shared/test-paths.mjs";
import { runFfiCorpus } from "../ffi/corpus.mjs";
import { loads, loadsStrict, dumps, stringifyForceStrings, format, emitCanonical, canonicalFromSource, setLibraryPath } from "../../dist/ts/ffi-deno.js";

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
    const cfg: any = await loads(SRC);
    if (cfg.service !== "web") throw new Error("service: " + cfg.service);
    if (cfg.port !== 8080) throw new Error("port: " + cfg.port);
    if (cfg.tls !== true) throw new Error("tls: " + cfg.tls);
    if (Math.abs(cfg.ratio - 0.75) > 1e-12) throw new Error("ratio: " + cfg.ratio);
    if (cfg.tags.join(",") !== "prod,eu-west-1") throw new Error("tags");
    if (cfg.db.host !== "primary.internal") throw new Error("db.host");
    if (cfg.db.timeout !== 30) throw new Error("db.timeout");
});

await check("loadsStrict rejects lossy and accepts canonical floats", async () => {
    let threw = false;
    try { await loadsStrict("version: 1.10\n"); } catch { threw = true; }
    if (!threw) throw new Error("expected strict rejection");
    const cfg: any = await loadsStrict("small: 1e-3\nlarge: 1e10\n");
    if (cfg.small !== 0.001 || cfg.large !== 10000000000) throw new Error("strict values");
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
    // Under spec 0.5.0 integers that overflow i64 are kept as strings.
    const huge = "99999999999999999999999999999";
    const cfg: any = await loads("value: " + huge);
    if (typeof cfg.value !== "string") throw new Error("not string: " + typeof cfg.value);
    if (cfg.value !== huge) throw new Error("value=" + cfg.value);

    const text = await dumps({ v: huge });
    if (!text.includes(huge)) throw new Error("dump missing huge int");
});

await check("parse error throws", async () => {
    let threw = false;
    try { await loads("a: ["); } catch { threw = true; }
    if (!threw) throw new Error("expected error on unterminated array");
});

await check("dumps rejects scalar root", async () => {
    let threw = false;
    try { await dumps(42 as any); } catch { threw = true; }
    if (!threw) throw new Error("expected rejection of scalar root");
});

// spec 0.1.1: top-level Array support
await check("0.1.1: top-level Array round-trip", async () => {
    const arr = ["alpha", 1, 2.5, true, null];
    const text = await dumps(arr as any);
    const back: any = await loads(text);
    if (!Array.isArray(back)) throw new Error("expected Array");
    if (back.join(",") !== "alpha,1,2.5,true,") throw new Error("array mismatch: " + JSON.stringify(back));
});

// 0.3.1: stringifyForceStrings
await check("0.3.1: stringifyForceStrings flattens scalars", async () => {
    const text = await stringifyForceStrings({ port: 8080, ratio: 0.5, tls: true });
    if (/:i\s/.test(text) || /:f\s/.test(text)) throw new Error(":i/:f leaked: " + text);
    const back: any = await loads(text);
    if (back.port !== "8080") throw new Error("port=" + back.port);
    if (back.ratio !== "0.5") throw new Error("ratio=" + back.ratio);
    if (back.tls !== "true") throw new Error("tls=" + back.tls);
});

// 0.7.1: format / emitCanonical / structured errors over the C ABI.
await check("0.7.1: format preserves comments and is a fixed point", async () => {
    const doc = "## header comment\n\n\n\nservice: web\nport: 8080\n\n\n\n## footer comment\n";
    const once: string = await format(doc);
    if (!once.includes("## header comment")) throw new Error("header comment lost");
    if (!once.includes("## footer comment")) throw new Error("footer comment lost");
    if (/\n\n\n/.test(once)) throw new Error("blank-line run not collapsed: " + JSON.stringify(once));
    const twice: string = await format(once);
    if (twice !== once) throw new Error("not a fixed point");
});

await check("0.7.1: emitCanonical writes canonical text", async () => {
    const text: string = await emitCanonical({ port: 8080 });
    if (typeof text !== "string" || text.length === 0) throw new Error("empty canonical output");
    if (!text.includes("port:")) throw new Error("missing port key: " + text);
});

// 0.7.1: canonicalFromSource — text in, canonical text out; the
// Ktav Integer/Float distinction never crosses a JS value boundary.
await check("0.7.1: canonicalFromSource preserves float spelling from source text", async () => {
    const text: string = await canonicalFromSource("a: 1.0\nb: 1e9\n");
    if (typeof text !== "string" || text.length === 0) throw new Error("empty canonical output");
    if (!text.includes("1.0")) throw new Error("float spelling lost (1.0): " + JSON.stringify(text));
    if (!text.includes("1e9")) throw new Error("float spelling lost (1e9): " + JSON.stringify(text));
});

await check("0.7.1: parse error carries structured envelope", async () => {
    let err: any = null;
    try { await loads("a: ["); } catch (e) { err = e; }
    if (!err) throw new Error("expected error on unterminated array");
    if (err.error === undefined) throw new Error("missing error field");
    if (err.line === undefined) throw new Error("missing line field");
    if (err.spec_section === undefined) throw new Error("missing spec_section field");
});

await runFfiCorpus({ loads, loadsStrict, dumps, canonicalFromSource, check, label: "deno-ffi" });

console.log(`\n[deno-ffi] ${passed}/${passed + failed} passed`);
Deno.exit(failed > 0 ? 1 : 0);
