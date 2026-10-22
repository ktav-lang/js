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

// --- 3b. independent canonical oracle for the 60-deep compound -------
// Built WITHOUT the SUT: the writer's canonical nested-object layout
// (ts/pure/writer.ts canonical emitter, mirroring the rust canonical
// docs) emits a pair at indent i as `4*i spaces + key: {` + newline,
// children at indent i+1, and the closer as `4*i spaces + }` + newline.
// Wrapping from the innermost leaf outward reproduces the expected
// canonical text exactly, so the deep canonicalFromSource result can be
// compared with FULL string equality instead of an impossible
// `endsWith("leaf: 1\n")`.
function deepCanonicalExpected() {
    let text = "leaf: 1\n";
    for (let i = 59; i >= 0; i--) {
        const body = text.split("\n").slice(0, -1).map(l => "    " + l).join("\n");
        text = `level_${i}: {\n${body}\n}\n`;
    }
    return text;
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
        // Independent round-trip: dumps the pure parse, reparse, compare
        // the value trees level by level. The canonical expectation below
        // stays bound to the oracle builder, never to dumps output.
        const dumpsText = timings("deep dumps", () => dumps(parsed));
        const redumped = loads(dumpsText);
        let same = true;
        let wa = parsed, wb = redumped;
        for (let i = 0; i < 60 && same; i++) {
            const k = "level_" + i;
            if (!wa || !wb || typeof wa !== "object" || typeof wb !== "object" ||
                !(k in wa) || !(k in wb)) same = false;
            else { wa = wa[k]; wb = wb[k]; }
        }
        // After 60 levels wa/wb are the leaf OBJECTS `{leaf: 1}`, not
        // scalars — the level-by-level walk above stays as the
        // independent expected-tree comparison; compare the leaves
        // independently (mirrors the structural walk's `node.leaf`).
        if (!same || wa === null || typeof wa !== "object" || wa.leaf !== 1 || wb.leaf !== 1) fail("deep dumps round-trip tree mismatch");
        else ok("deep dumps round-trip preserves the 60-level value tree");
        const reparsed = timings("deep loadsStrict", () => loadsStrict(src));
        if (JSON.stringify(reparsed) !== JSON.stringify(parsed)) fail("deep loadsStrict mismatch");
        else ok("deep loadsStrict complete");
        const canon = timings("deep canonicalFromSource", () => canonicalFromSource(src));
        const expectedCanon = deepCanonicalExpected();
        if (canon !== expectedCanon) {
            let at = 0;
            const n = Math.min(canon.length, expectedCanon.length);
            while (at < n && canon[at] === expectedCanon[at]) at++;
            fail(`deep canonicalFromSource: mismatch with independent canonical oracle at char ${at} ` +
                 `(expected ${expectedCanon.length} chars, got ${canon.length})`);
        } else ok("deep canonicalFromSource equals independent canonical oracle (60 nested levels)");
        timings("deep format", () => format(src));
        ok("deep format complete");
    }
}

// =====================================================================
// Pure-only regression coverage. These run ONLY against the pure
// backend: the native jsToV path may stack-overflow on cyclic input,
// and the negative controls below assert pure writer/converter
// behaviour verified by reading ts/pure/ktavvalue.ts and writer.ts.
// =====================================================================
const PERF_TOKEN_MS = 5_000;

// --- long digit-token complexity control ------------------------------
{
    // A single 200k-digit token: must be classified as String (spec 0.5.0
    // out-of-i64 integer) in linear time. Fails if a BigInt multiply-add
    // per digit ever returns to the tokenizer.
    const digits = "9".repeat(200_000);
    const src = "k: " + digits + "\n";
    const t0 = Date.now();
    const parsed = loads(src);
    const ms = Date.now() - t0;
    if (typeof parsed.k !== "string") {
        fail(`long digit token: expected String, got ${typeof parsed.k}`);
    } else {
        // Independent expected value: the literal source substring.
        if (parsed.k !== digits) fail("long digit token: value != literal source substring");
        else ok(`long digit token: 200k digits classified as String, verbatim (${ms} ms)`);
    }
    if (ms > PERF_TOKEN_MS) fail(`long digit token: ${ms} ms exceeds ${PERF_TOKEN_MS} ms ceiling`);

    // Valid over-i64 token mixing underscores (digit separators):
    // "1" + "_0" × 24 = 25 DIGITS (49 chars, ~1e24), genuinely beyond
    // the mandatory i64 range (max 9223372036854775807 ≈ 9.2e18) —
    // spec 0.5.0 classifies it as String. Confirmed against the corpus
    // fixture spec/versions/0.8/tests/valid/numbers/integer/
    // i64_overflow_to_string.* (19-digit i64max+1 with a String oracle)
    // and boundary-fixtures.json's integer_range entries.
    let mixed = "1";
    for (let i = 0; i < 24; i++) mixed += "_0";
    const parsed2 = loads("v: " + mixed + "\n");
    if (typeof parsed2.v !== "string") {
        fail(`underscored big token: expected String, got ${typeof parsed2.v}`);
    } else if (parsed2.v !== mixed) {
        fail("underscored big token: value != literal source substring");
    } else ok("underscored big token (25 digits) classified as String, verbatim");
}

// --- cyclic structure rejection ----------------------------------------
{
    const arr = [];
    arr.push(arr);
    let arrErr = null;
    try { dumps(arr); } catch (e) { arrErr = e; }
    if (!arrErr) fail("cycle: dumps() accepted a self-referential array");
    else if (arrErr.name !== "KtavError" || !String(arrErr.message).includes("cyclic")) {
        fail(`cycle: array cycle threw ${arrErr.name}: ${arrErr.message}`);
    } else ok("cycle: self-referential array rejected as KtavError/cyclic (no hang, no overflow)");

    const obj = {};
    obj.self = obj;
    let objErr = null;
    try { dumps(obj); } catch (e) { objErr = e; }
    if (!objErr) fail("cycle: dumps() accepted a self-referential object");
    else if (objErr.name !== "KtavError" || !String(objErr.message).includes("cyclic")) {
        fail(`cycle: object cycle threw ${objErr.name}: ${objErr.message}`);
    } else ok("cycle: self-referential object rejected as KtavError/cyclic");
}

// --- deep dotted-path materialization -----------------------------------
{
    // One key with 2_000 dotted segments: a.a.a...: 1. The value tree
    // must materialize 2000 levels deep; walked ITERATIVELY here so the
    // TEST itself cannot overflow.
    const segments = 2_000;
    let key = "";
    for (let i = 0; i < segments; i++) key += (i > 0 ? "." : "") + "a";
    const t0 = Date.now();
    const parsed = loads(key + ": 1\n");
    let node = parsed;
    for (let i = 0; i < segments; i++) {
        if (!node || typeof node !== "object" || !("a" in node)) { node = null; break; }
        node = node.a;
    }
    const ms = Date.now() - t0;
    if (node !== 1) fail(`deep dotted: expected value 1 after ${segments} levels, got ${JSON.stringify(node)}`);
    else ok(`deep dotted: ${segments}-segment key materialized, leaf === 1 (${ms} ms)`);
    if (ms > PERF_TOKEN_MS) fail(`deep dotted: ${ms} ms exceeds ${PERF_TOKEN_MS} ms ceiling`);
}

// --- iteration machinery negative controls (pure writer/converter) ------
{
    // Expected strings verified by READING ts/pure/writer.ts (and its
    // rust mirror render.rs emit_root): the pretty root switch emits an
    // empty root OBJECT as an empty body ("" — render_object_body over
    // zero pairs emits nothing), the empty root ARRAY explicitly as
    // "[]\n" (§ 5.9.3, mirrored in rootTasks), pairs at indent 0 as
    // "key: value\n", and root-array scalars one per line.
    const exact = (name, actual, want) => {
        if (actual !== want) fail(`${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`);
        else ok(`${name}: exact dumps ${JSON.stringify(want)}`);
    };
    exact("empty root object", dumps({}), "");
    exact("empty root array", dumps([]), "[]\n");
    exact("single-pair root", dumps({ k: 1 }), "k: 1\n");
    exact("root array of scalars", dumps([1, 2.5, true, null]), "1\n2.5\ntrue\nnull\n");

    // Formatter fixed point on a comments+blanks document.
    const commented = "## header\n\n\n\nk: 1\n\n\n## tail\n";
    const once = format(commented);
    const twice = format(once);
    if (twice !== once) fail(`formatter fixed point: ${JSON.stringify(once)} != ${JSON.stringify(twice)}`);
    else ok("formatter fixed point on a comments+blanks document");

    // jsToV malformed-mapping errors — exact shared messages verified by
    // READING BOTH implementations:
    //   NaN:        ts/pure/ktavvalue.ts:142 and crates/napi/src/lib.rs:347
    //               both emit exactly "NaN / Infinity is not representable in Ktav"
    //   array hole: ts/pure/ktavvalue.ts:109 and crates/napi/src/lib.rs:378
    //               both emit exactly "Array element missing"
    //   unsupported: ts/pure/ktavvalue.ts:94 and crates/napi/src/lib.rs:401
    //               both emit "Unsupported JavaScript value type for Ktav: <type>"
    // "NonFiniteFloat" is the WRITER's reason code, a different path —
    // never asserted here; the binding rejects at jsToV conversion.
    let nfErr = null;
    try { dumps({ a: NaN }); } catch (e) { nfErr = e; }
    if (!nfErr || nfErr.name !== "KtavError" || !String(nfErr.message).includes("not representable")) {
        fail(`NaN value: expected KtavError "NaN / Infinity is not representable in Ktav", got ${nfErr && nfErr.name}: ${nfErr && nfErr.message}`);
    } else ok('dumps({a: NaN}) throws KtavError "…not representable in Ktav" (shared pure/native contract)');

    const holed = [1, , 3]; // array hole at index 1
    let holeErr = null;
    try { dumps(holed); } catch (e) { holeErr = e; }
    if (!holeErr || holeErr.name !== "KtavError" || !String(holeErr.message).includes("Array element missing")) {
        fail(`array hole: expected KtavError "Array element missing", got ${holeErr && holeErr.name}: ${holeErr && holeErr.message}`);
    } else ok('array hole throws KtavError "Array element missing" (shared contract)');

    let fnErr = null;
    try { dumps({ f: () => 1 }); } catch (e) { fnErr = e; }
    if (!fnErr || fnErr.name !== "KtavError" || !String(fnErr.message).includes("Unsupported JavaScript value type for Ktav")) {
        fail(`function value: expected KtavError "Unsupported JavaScript value type for Ktav: …", got ${fnErr && fnErr.name}: ${fnErr && fnErr.message}`);
    } else ok('function value throws KtavError "Unsupported JavaScript value type for Ktav: …" (shared contract)');
}

// --- focused inline-scanner state regressions (pure parser) --------------
// Every expectation is derived from spec 0.8 (spec/versions/0.8/spec.md):
// § 3.4 (raw pair line), § 5.4, § 5.8 inline grammar, § 5.8.5
// <inline-raw-scalar> + mid-value rule, § 5.2 rules 6–9, § 6.11,
// § 6.12, § 6.13 — not from implementation internals.
{
    const expectValue = (name, src, want) => {
        let parsed, err = null;
        try { parsed = loads(src); } catch (e) { err = e; }
        if (err || JSON.stringify(parsed) !== JSON.stringify(want)) {
            fail(`${name}: expected ${JSON.stringify(want)}, got ${err ? err.error + ": " + err.message : JSON.stringify(parsed)}`);
        } else ok(`${name}: ${JSON.stringify(parsed)}`);
    };
    const expectError = (name, src, errorField) => {
        let err = null;
        try { loads(src); } catch (e) { err = e; }
        if (!err || err.error !== errorField) {
            fail(`${name}: expected error=${errorField}, got ${err ? err.error + ": " + err.message : "no throw"}`);
        } else ok(`${name}: error=${err.error}`);
    };

    // § 3.4 / § 5.4: a line-level raw marker makes the WHOLE rest of
    // the line literal String data — braces are content, no dispatch.
    expectValue("raw marker with braces (line pair)", "a:: {b: 1}\n", { a: "{b: 1}" });

    // § 5.8.5 <inline-raw-scalar>: inside an inline object, bytes after
    // `::` are literal String content, trimmed, until the first
    // unescaped "," / "}" / "]".
    expectValue("inline raw marker scalar", "k: {a:: x}\n", { k: { a: "x" } });

    // Same rule bounds the inline raw scalar at the first unescaped
    // `}`: in `k: {a:: {b: 1}}` the raw content is `{b: 1`, the first
    // `}` closes the OUTER object, and the final `}` is content after
    // the matching closer — § 5.2 rule 8 → MalformedInlineCompound
    // (§ 6.12); the raw `{` never opens a nested scope.
    expectError("inline raw marker brace collision", "k: {a:: {b: 1}}\n", "MalformedInlineCompound");

    // § 5.8.2: quoted key segments are opaque to delimiters and to the
    // top-level comma split — a comma inside the quotes is key data.
    expectValue("quoted key containing comma", '{"a,b": 1}\n', { "a,b": 1 });

    // § 5.8 inline list: a comma directly after a child closer splits
    // the parent list; both sibling pairs must survive.
    expectValue("comma after child closer", "{a: [1, 2], b: 3}\n", { a: [1, 2], b: 3 });

    // § 5.2 rule 8: the body starts `{`; the first unescaped `}` that
    // returns delimiter depth to zero is NOT the last body byte (a
    // second `}` follows), and the inner `[1` never receives a
    // same-line `]` — a structural defect inside an already-closed
    // compound → MalformedInlineCompound (§ 6.12), NOT
    // UnterminatedInlineCompound (§ 6.11, reserved for compounds that
    // never close at all).
    expectError("malformed nested delimiter", "v: {a: [1}}\n", "MalformedInlineCompound");

    // § 6.13 byte-ordered precedence (spec: "If an invalid escape is
    // encountered while scanning for that closer, the result is
    // BadEscapeSequence … which takes precedence over a missing
    // closer"): `\q` is not a valid § 3.7 escape and occurs BEFORE the
    // missing closer, so BadEscapeSequence wins over
    // UnterminatedInlineCompound.
    expectError("bad escape before closer", "k: {a: \\q\n", "BadEscapeSequence");
}

const elapsed = Date.now() - started;
console.log(`\n[perf] total wall clock: ${elapsed} ms (ceiling ${CEILING_MS} ms)`);
if (elapsed > CEILING_MS) {
    fail(`perf ceiling exceeded: ${elapsed} ms > ${CEILING_MS} ms`);
}
process.exit(failed > 0 ? 1 : 0);
