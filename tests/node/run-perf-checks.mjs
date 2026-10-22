// Deterministic genuine-operation guard (NOT a benchmark). Builds four
// pathological documents in memory, runs the PURE backend's five
// operations on each, asserts structural completeness of the results and
// a generous wall-clock runaway ceiling. Exit non-zero if any operation
// is incomplete or the ceiling is exceeded.

import {
    loads,
    loadsStrict,
    dumps,
    canonicalFromSource,
    format,
} from "../../dist/ts/pure.js";

const CEILING_MS = 60_000;
const started = Date.now();
let failed = 0;
const fail = (msg) => { failed++; console.error(`✖ ${msg}`); };
const ok = (msg) => console.log(`✔ ${msg}`);

// --- 1. 50k-key wide object -----------------------------------------
function wideDoc() {
    const lines = [];
    for (let i = 0; i < 50_000; i++) lines.push(`key_${i}: ${i}`);
    return lines.join("\n") + "\n";
}

// --- 2. dotted-path-heavy document (thousands of distinct prefixes) --
function dottedDoc() {
    const lines = [];
    for (let i = 0; i < 5_000; i++) {
        lines.push(`a${i}.b${i}.c${i}.leaf: ${i}`);
    }
    return lines.join("\n") + "\n";
}

// --- 3. ~1MB single-String document ----------------------------------
function bigStringDoc() {
    const chunk = "abcdefghij"; // 10 bytes
    const body = chunk.repeat(Math.ceil(1_000_000 / chunk.length));
    return `big:: ${body}\n`;
}

// --- 4. 60-deep nested compound --------------------------------------
function deepDoc() {
    // TRUE nested EXPLICIT compounds (spec § 5.8 `key: {` opener and
    // `}` closer, each on its own line). Indentation is insignificant
    // per spec § 3.3, so the old `level_i:` + re-indent scheme produced
    // 60 SIBLING keys, not nesting — and in reverse walk order. Build
    // from the innermost outward so level_0 is the outermost object and
    // level_59 the innermost, with the leaf at its center:
    //   level_0: {
    //       level_1: {
    //           ...
    //                       leaf: 1
    //           ...
    //       }
    //   }
    // Each wrap indents every existing line by one level and appends the
    // closer, which the NEXT wrap indents — so level_i's key sits at
    // indent 4*i, its body at 4*(i+1), and braces balance (one opener +
    // one closer per wrap).
    let s = "leaf: 1";
    for (let i = 59; i >= 0; i--) {
        s = `level_${i}: {\n` + s.split("\n").map(l => "    " + l).join("\n") + "\n}";
    }
    return s + "\n";
}

function timings(label, fn) {
    const t0 = Date.now();
    const result = fn();
    const ms = Date.now() - t0;
    console.log(`  [perf] ${label}: ${ms} ms`);
    return result;
}

// === wide ============================================================
{
    const src = wideDoc();
    const parsed = timings("wide loads (50k keys)", () => loads(src));
    if (!parsed || Object.keys(parsed).length !== 50_000) {
        fail(`wide loads: expected 50000 keys, got ${parsed ? Object.keys(parsed).length : "null"}`);
    } else if (parsed.key_49999 !== 49999) {
        fail("wide loads: last key value wrong");
    } else ok("wide loads complete (50000 keys)");
    const text = timings("wide dumps", () => dumps(parsed));
    if (typeof text !== "string" || text.split("\n").filter(l => l.length > 0).length !== 50_000) {
        fail("wide dumps: line count wrong");
    } else ok("wide dumps complete");
    const reparsed = timings("wide loadsStrict", () => loadsStrict(src));
    if (Object.keys(reparsed).length !== 50_000) fail("wide loadsStrict incomplete");
    else ok("wide loadsStrict complete");
    const canon = timings("wide canonicalFromSource", () => canonicalFromSource(src));
    if (canon !== text) fail("wide canonicalFromSource != dumps");
    else ok("wide canonicalFromSource == dumps");
    const fmt = timings("wide format", () => format(src));
    if (fmt !== canon) fail("wide format != canonical (comment-free doc)");
    else ok("wide format == canonicalFromSource");
}

// === dotted ==========================================================
{
    const src = dottedDoc();
    const parsed = timings("dotted loads (5000 prefixes)", () => loads(src));
    if (!parsed || Object.keys(parsed).length !== 5_000) {
        fail(`dotted loads: expected 5000 top-level keys, got ${parsed ? Object.keys(parsed).length : "null"}`);
    } else if (parsed.a0.b0.c0.leaf !== 0 || parsed.a4999.b4999.c4999.leaf !== 4999) {
        fail("dotted loads: deep leaf values wrong");
    } else ok("dotted loads complete (5000 distinct dotted prefixes)");
    const text = timings("dotted dumps", () => dumps(parsed));
    const reparsed = timings("dotted loadsStrict", () => loadsStrict(src));
    if (Object.keys(reparsed).length !== 5_000) fail("dotted loadsStrict incomplete");
    else ok("dotted loadsStrict complete");
    const canon = timings("dotted canonicalFromSource", () => canonicalFromSource(src));
    if (canon !== text) fail("dotted canonicalFromSource != dumps");
    else ok("dotted canonicalFromSource == dumps");
    timings("dotted format", () => format(src));
    ok("dotted format complete");
}

// === 1MB string ======================================================
{
    const src = bigStringDoc();
    if (src.length < 1_000_000) fail("big-string fixture smaller than 1MB");
    const parsed = timings("1MB-string loads", () => loads(src));
    const expectLen = Math.ceil(1_000_000 / 10) * 10;
    if (!parsed || typeof parsed.big !== "string" || parsed.big.length !== expectLen) {
        fail(`1MB-string loads: expected body length ${expectLen}, got ${parsed ? (parsed.big || "").length : "null"}`);
    } else ok(`1MB-string loads complete (${expectLen}-char raw string)`);
    const text = timings("1MB-string dumps", () => dumps(parsed));
    const reparsed = timings("1MB-string loadsStrict", () => loadsStrict(src));
    if (reparsed.big !== parsed.big) fail("1MB-string loadsStrict value mismatch");
    else ok("1MB-string loadsStrict complete");
    const canon = timings("1MB-string canonicalFromSource", () => canonicalFromSource(src));
    if (canon !== text) fail("1MB-string canonicalFromSource != dumps");
    else ok("1MB-string canonicalFromSource == dumps");
    timings("1MB-string format", () => format(src));
    ok("1MB-string format complete");
}

// === 60-deep =========================================================
{
    const src = deepDoc();
    const parsed = timings("deep loads (60 levels)", () => loads(src));
    let node = parsed;
    for (let i = 0; i < 60; i++) {
        if (!node || typeof node !== "object" || !("level_" + i in node)) {
            fail(`deep loads: level_${i} missing`);
            node = null;
            break;
        }
        node = node["level_" + i];
    }
    if (node && node.leaf !== 1) fail("deep loads: leaf != 1");
    else if (node) ok("deep loads complete (60 nested levels)");
    if (node) {
        timings("deep dumps", () => dumps(parsed));
        const reparsed = timings("deep loadsStrict", () => loadsStrict(src));
        if (JSON.stringify(reparsed) !== JSON.stringify(parsed)) fail("deep loadsStrict mismatch");
        else ok("deep loadsStrict complete");
        const canon = timings("deep canonicalFromSource", () => canonicalFromSource(src));
        if (!canon.endsWith("leaf: 1\n")) fail("deep canonicalFromSource missing leaf");
        else ok("deep canonicalFromSource complete");
        timings("deep format", () => format(src));
        ok("deep format complete");
    }
}

const elapsed = Date.now() - started;
console.log(`\n[perf] total wall clock: ${elapsed} ms (ceiling ${CEILING_MS} ms)`);
if (elapsed > CEILING_MS) {
    fail(`perf ceiling exceeded: ${elapsed} ms > ${CEILING_MS} ms`);
}
process.exit(failed > 0 ? 1 : 0);
