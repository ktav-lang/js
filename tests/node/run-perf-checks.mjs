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

    // jsToV malformed-mapping errors — substring (deliberate subset)
    // contract check, NOT exact-message equality. The asserted substrings
    // ("not representable" / "Array element missing" / the "Unsupported
    // JavaScript value type for Ktav" prefix) are a deliberate
    // public-contract subset check: the envelope `message` is rendered
    // text whose full wording is display-facing, so exact equality is
    // intentionally not asserted. (Both implementations —
    // ts/pure/ktavvalue.ts:142/109/94 and crates/napi/src/lib.rs:347/378/401
    // — currently emit those substrings.) "NonFiniteFloat" is the
    // WRITER's reason code, a different path — never asserted here; the
    // binding rejects at jsToV conversion.
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

    // § 5.2 rule 8 vs § 6.11 derivation: the body starts `{` and its
    // first depth-to-zero `}` IS its last byte, so the OUTER object is
    // fine. The defect is in the CHILD `[1`: a quote-aware structural
    // scan of `[1}` finds no same-line matching `]` — the only closer
    // present is `}`, which (per § 5.8.5: an unescaped closer ALWAYS
    // ends raw mode and is structural, and both closer kinds decrement
    // the shared delimiter depth) crosses rather than matches — and it
    // meets no invalid escape before the scan ends. § 6.11 therefore
    // classifies the child as UnterminatedInlineCompound: "A `{` or `[`
    // appearing in a value-position is an UnterminatedInlineCompound
    // error when its quote-aware structural scan finds no matching
    // `}`/`]` on the same line and encounters no invalid escape."
    // § 6.12 does NOT convert a genuinely-unclosed child into
    // Malformed: it governs defects inside an already-CLOSED compound
    // (e.g. content after the matching closer), which is not the case
    // here. This matches the corpus sibling fixture
    // invalid/inline/raw_mode_does_not_absorb_mismatched_closer
    // (`{a:: x]}` → UnterminatedInlineCompound: the nested raw scalar
    // terminates at `]`, leaving the object unclosed). The earlier
    // expectation `MalformedInlineCompound` was wrong; the parser was
    // already right.
    expectError("malformed nested delimiter", "v: {a: [1}}\n", "UnterminatedInlineCompound");

    // § 6.13 byte-ordered precedence (spec: "If an invalid escape is
    // encountered while scanning for that closer, the result is
    // BadEscapeSequence … which takes precedence over a missing
    // closer"): `\q` is not a valid § 3.7 escape and occurs BEFORE the
    // missing closer, so BadEscapeSequence wins over
    // UnterminatedInlineCompound.
    expectError("bad escape before closer", "k: {a: \\q\n", "BadEscapeSequence");

    // No-revival regression (cached-false path, killed-then-popped
    // frame): in `v: {a: [{b: 1]}, c: 2}` the `]` crosses the inner
    // `{` frame at its stop depth — both closer kinds decrement the
    // shared depth (§5.8.5, mirrored from scanner.rs), kind mismatch
    // kills the frame but does NOT pop it. The later `}` kind-matches
    // that killed frame and pops it, recording `false` (the
    // valid=false gate: the frame's own standalone scan said NotFound
    // at the crossed `]`). The outer object still closes normally at
    // its own final `}`, so the defect surfaces when parsing the
    // array item `{b: 1]}`: its standalone structural scan finds no
    // same-line `}` (the `]` crosses at its depth zero) and meets no
    // invalid escape first — §6.11 UnterminatedInlineCompound (§5.8.5
    // + §6.11; the same verdict as the Rust
    // find_matching_close → scan_inline_closer → NotFound composition
    // in compound.rs, not Malformed: §6.12 only governs defects inside
    // an already-closed compound). A stale cache could wrongly let a
    // later `}` "revive" the killed frame; the recorded `false` and
    // the drained stack both prevent that.
    expectError("no revival after crossed closer", "v: {a: [{b: 1]}, c: 2}\n", "UnterminatedInlineCompound");

    // Bounded-work regression in the spirit of the PERF_TOKEN_MS
    // ceilings: a 400-level deep prefix of compound openers, every
    // level closed by the WRONG closer (`]` against a `{` frame) and
    // NO final valid closers — every level's frame is killed and every
    // level's outcome is cached as dead (kind-mismatched kills inline,
    // the rest drained at the depth-0 stop), so the parse resolves by
    // map lookups. This exercises cached-invalid outcomes at many
    // nesting levels, NOT wall-clock performance; the timing ceiling
    // only guards against a runaway rescan. Machine trace of the
    // exact fixture: the value `{a: {a: … 1]]]…}` seeds at depth 1;
    // 400 `{` frames push depth to 401; each of the 400 `]` closers
    // decrements once and kind-mismatches the top `{` frame (killing
    // it, never popping); the final `}` returns depth to 0 and IS the
    // body's own closer, so the outer object parses normally and the
    // error surfaces at the first nested value — a cached `false` →
    // §6.11 UnterminatedInlineCompound, deterministically.
    {
        const levels = 400;
        let src = "v: ";
        for (let i = 0; i < levels; i++) src += "{a: ";
        src += "1";
        for (let i = 0; i < levels; i++) src += "]";
        src += "}\n";
        let deepErr = null;
        const t0 = Date.now();
        try { loads(src); } catch (e) { deepErr = e; }
        const ms = Date.now() - t0;
        if (!deepErr || deepErr.error !== "UnterminatedInlineCompound") {
            fail(`deep crossed closers: expected error=UnterminatedInlineCompound, got ${deepErr ? deepErr.error + ": " + deepErr.message : "no throw"}`);
        } else ok(`deep crossed closers (${levels} levels, all cached dead): error=UnterminatedInlineCompound`);
        if (ms > PERF_TOKEN_MS) fail(`deep crossed closers: ${ms} ms exceeds ${PERF_TOKEN_MS} ms ceiling`);
        else ok(`deep crossed closers completed within ceiling (${ms} ms)`);
    }
}

// --- independent negative-float canonical threshold regressions ---------
// Every expected canonical spelling below is derived INDEPENDENTLY from
// spec §5.9.8 (scientific when |v| >= 1e7 or 0 < |v| < 1e-2, else the
// ryu pretty decimal; always at least a `.0` mantissa; `-` exactly
// once; negative zero preserved) by hand-tracing the shortest-digits
// decomposition (value = 0.digits * 10^e10, shortest round-trip digit
// string from Number#toString/ryu) and the exponent emission e10-1.
// Contract distinction for -0 (three layers, honestly separated):
// source-canonical text PRESERVES -0.0 (numbers.ts ryuFormat zero
// branch returns "-0.0"); a typed Float keeps the negative-zero KIND;
// but a generic JS Number input has its kind ERASED by the established
// native mapping (crates/napi/src/lib.rs js_to_value, Number branch:
// fract()==0 && i64-range → Value::Integer via itoa(n as i64), so -0.0
// as i64 is 0), mirrored exactly in ts/pure/ktavvalue.ts numberToV —
// so dumps of a parsed -0 emits "k: 0".
// Corpus cross-check: spec/versions/0.8/tests/valid/numbers/float/
// notation_boundaries.canonical.ktav and negative_zero.canonical.ktav
// agree with every trace (kept as confirmation only — these tests carry
// their own inline expectations).
{
    // Each vector: parse a one-pair document, canonicalize the SAME
    // source, and check BOTH the parsed number and the exact canonical
    // bytes. `trace` documents the derivation for the vector.
    const vec = (name, lit, trace, numCheck, canon) => {
        const src = `k: ${lit}\n`;
        let parsed, err = null;
        try { parsed = loads(src); } catch (e) { err = e; }
        if (err || !numCheck(parsed ? parsed.k : undefined)) {
            fail(`${name}: parsed-number expectation failed, got ${err ? err.error + ": " + err.message : JSON.stringify(parsed && parsed.k)}`);
        } else ok(`${name}: parsed number OK`);
        let canonActual, cerr = null;
        try { canonActual = canonicalFromSource(src); } catch (e) { cerr = e; }
        const wantCanon = `k: ${canon}\n`;
        if (cerr || canonActual !== wantCanon) {
            fail(`${name}: canonical mismatch — expected ${JSON.stringify(wantCanon)}, got ${cerr ? cerr.error + ": " + cerr.message : JSON.stringify(canonActual)}`);
        } else ok(`${name}: canonical ${JSON.stringify(canon)}`);
        // dumps round trip: reparse the canonical dump and compare the
        // value (Object.is so -0 stays -0 through the round trip).
        // SKIPPED for negative zero — the round trip is EXACTLY the
        // documented kind erasure (see block header: js_to_value maps
        // generic Number -0 to Integer "0"), so `Object.is` would
        // deterministically fail; the -0 vector asserts the actual
        // contract below instead.
        if (!err && !cerr) {
            if (Object.is(parsed.k, -0)) {
                const dump = dumps(parsed);
                if (dump !== "k: 0\n") {
                    fail(`${name}: dumps of parsed -0 expected "k: 0\\n" (jsToV Number→Integer erasure), got ${JSON.stringify(dump)}`);
                } else ok(`${name}: dumps maps generic Number -0 to "k: 0" (shared native/pure jsToV contract)`);
            } else {
                const redumped = loads(dumps(parsed));
                if (!Object.is(redumped.k, parsed.k)) {
                    fail(`${name}: dumps round trip changed the value (${JSON.stringify(parsed.k)} -> ${JSON.stringify(redumped.k)})`);
                } else ok(`${name}: dumps round trip preserves the value (Object.is)`);
            }
        }
        void trace; // derivation lives in the per-vector comment below
    };

    // -0.5: ryu "0.5" (fixed, |v| in [1e-2, 1e7)) → "-0.5".
    vec("neg float -0.5", "-0.5",
        "ryu: digits '5', e10 0 → '0.5'; window fixed",
        (v) => v === -0.5, "-0.5");

    // -1.0: ryu of 1 → digits '1', e10 1, k=0, kk=1 ≤ 16 → "1.0";
    // window fixed → "-1.0" (mantissa `.0` minimum).
    vec("neg float -1.0", "-1.0",
        "ryu: digits '1', e10 1 → '1.0'; window fixed",
        (v) => v === -1, "-1.0");

    // -0.0: parseFloatValue Number("-0.0") === -0; ryu zero branch
    // returns "-0.0"; canonicalFloat keeps ±0.0 as-is (v === 0).
    // All three layers are asserted: canonicalFromSource preserves the
    // -0.0 bytes (vec's canon check), loads preserves the parsed -0
    // (vec's numCheck), and dumps maps the generic JS Number to Integer
    // "0" — the kind erasure of the shared native/pure jsToV contract
    // (crates/napi/src/lib.rs js_to_value Number branch: fract()==0 &&
    // i64-range → Integer via itoa(n as i64); -0.0 as i64 = 0).
    // Byte-exact -0.0 canonical text requires canonicalFromSource.
    vec("neg float -0.0 (negative zero preserved)", "-0.0",
        "ryu zero branch '-0.0'; canonicalFloat keeps ±0.0 as-is",
        (v) => Object.is(v, -0), "-0.0");

    // -1e16: String(1e16) = "10000000000000000" (no 'e'); digits stay
    // the full 17-char string, e10 = 17. |v| >= 1e7 → scientific:
    // mantissa = digits with trailing zeros stripped = "1";
    // exponent = e10 - 1 = 16 → "-1e16". (Note: canonicalFloat emits
    // e10-1, NOT e10; traced, not guessed.)
    vec("neg float -1e16 (scientific, high side)", "-1e16",
        "digits '10000000000000000' → mantissa '1', e10 17 → exp 16",
        (v) => v === -1e16, "-1e16");

    // -1e-6: String(1e-6) = "0.000001"; intPart "0" (len 1),
    // rawDigits "0000001" → digits "1", stripped 6 → e10 = 1-6 = -5.
    // |v| < 1e-2 → scientific: mantissa "1", exponent e10-1 = -6
    // → "-1e-6". (NOT -1e-7: e10 is already the value's decimal
    // exponent minus one — 0.1 * 10^-5 = 1e-6 — so the emitted
    // exponent is -6.)
    vec("neg float -1e-6 (scientific, low side)", "-1e-6",
        "digits '1', e10 -5 → mantissa '1', exp -6 → '-1e-6'",
        (v) => v === -1e-6, "-1e-6");

    // -0.001: String(0.001) = "0.001"; intPart "0", rawDigits "0001"
    // → digits "1", stripped 3 → e10 = 1-3 = -2; |v| < 1e-2 →
    // scientific: mantissa "1", exponent e10-1 = -3 → "-1e-3".
    // (Traced precisely: the prompt's provisional "-1e-4" was wrong;
    // the corpus notation_boundaries.canonical.ktav confirms "-1e-3".)
    vec("neg float -0.001 (scientific, low side)", "-0.001",
        "digits '1', e10 -2 → mantissa '1', exp -3 → '-1e-3'",
        (v) => v === -0.001, "-1e-3");

    // -123.456: String(123.456) = "123.456"; digits "123456", e10 3;
    // k = 3-6 = -3, kk 3 in (0,16] → ryu "123.456"; window fixed.
    vec("neg float -123.456 (fixed window)", "-123.456",
        "digits '123456', e10 3 → ryu '123.456'; window fixed",
        (v) => v === -123.456, "-123.456");

    // -5e-324 (negative subnormal): String(5e-324) = "5e-324" →
    // digits "5", e10 -323; |v| < 1e-2 → scientific: mantissa "5",
    // exponent e10-1 = -324 → "-5e-324" (sign exactly once).
    vec("neg float -5e-324 (negative subnormal)", "-5e-324",
        "String '5e-324' → digits '5', e10 -323 → exp -324",
        (v) => v === -5e-324, "-5e-324");

    // -9999999.0 (§5.9.8 low edge, fixed side): digits "9999999",
    // e10 7, k = 0 → ryu "9999999.0"; |v| = 9999999 < 1e7 → FIXED.
    // Corpus notation_boundaries.canonical.ktav: "large_below: 9999999.0".
    vec("neg float -9999999.0 (fixed window upper edge)", "-9999999.0",
        "digits '9999999', e10 7 → ryu '9999999.0'; < 1e7 → fixed",
        (v) => v === -9999999, "-9999999.0");

    // -10000000.0 (§5.9.8 scientific edge): |v| = 1e7 fails
    // (abs >= 1e-2 && abs < 1e7) → scientific: String(1e7) =
    // "10000000", digits "10000000", e10 8; mantissa strips trailing
    // zeros → "1"; exponent e10-1 = 7 → "-1e7".
    // Corpus: "large_boundary: 1e7".
    vec("neg float -10000000.0 (scientific edge)", "-10000000.0",
        "digits '10000000' → mantissa '1', e10 8 → exp 7 → '-1e7'",
        (v) => v === -1e7, "-1e7");
}

// --- leaf U+FEFF range regressions (BOM vs content) ----------------------
// Spec §3.1: exactly ONE U+FEFF at the very start of the document is a
// structural byte-order mark and is skipped; §5.4 (raw) / §5.3.3
// (quoted keys) / §5.6 (multiline) leaf decoding must preserve a
// U+FEFF that is CONTENT verbatim. bytes.ts decoders use
// ignoreBOM:true (BOM passes through decode, not stripped). Verified
// against the corpus sibling valid/bom_boundary/first_item_leading_bom.*
// (confirmation only; expectations are inline below). JSON.stringify
// preserves U+FEFF as \uFEFF, so stringify comparisons are exact.
{
    const FEFF = "\uFEFF";
    const expectJson = (name, actual, want) => {
        if (JSON.stringify(actual) !== JSON.stringify(want)) {
            fail(`${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`);
        } else ok(`${name}: ${JSON.stringify(want)}`);
    };

    // §5.4 raw array item: bytes after `:: ` are literal content — the
    // U+FEFF is CONTENT and survives decodeRange verbatim.
    expectJson("raw array item with content BOM",
        loads(`:: ${FEFF}plain\n`), [`${FEFF}plain`]);

    // §5.3.3 quoted key whose DECODED CONTENT STARTS with U+FEFF —
    // the decoder-boundary case: a default TextDecoder with BOM
    // stripping would eat a LEADING U+FEFF during decode, so the key
    // must come back exactly FEFF + "ab" (bytes.ts decoders use
    // ignoreBOM:true). Distinct from the document-BOM case — a
    // leading document U+FEFF is stripped once before line handling,
    // but inside the quotes it is key data in any position; the
    // interior variant below is kept as a second assertion.
    expectJson("quoted key with LEADING content BOM",
        loads(`"${FEFF}ab": 1\n`), { [`${FEFF}ab`]: 1 });
    expectJson("quoted key with interior content BOM",
        loads(`"a${FEFF}b": 1\n`), { [`a${FEFF}b`]: 1 });

    // Document-BOM control: one leading U+FEFF before the first pair
    // is the structural BOM (§3.1) — stripped exactly once, key "k".
    expectJson("document BOM stripped once (key control)",
        loads(`${FEFF}k: v\n`), { k: "v" });

    // §5.6 multiline stripped, BOM at line start: finishMultiline's
    // dedent run is computed over §3.3 WHITESPACE only; U+FEFF is NOT
    // whitespace, so the single-line fast path trims no leading bytes
    // and the BOM char survives as the first body code point.
    expectJson("multiline stripped preserves line-leading BOM",
        loads(`k: (\n${FEFF}line\n)\n`), { k: `${FEFF}line` });

    // §5.6 multiline verbatim: lines are joined raw — no trimming or
    // dedent at all — so the BOM survives trivially.
    expectJson("multiline verbatim preserves line-leading BOM",
        loads(`k: ((\n${FEFF}line\n))\n`), { k: `${FEFF}line` });

    // Both at once: document BOM stripped once (§3.1), content BOM in
    // the raw item still intact — the two never interact.
    expectJson("document BOM + content BOM together",
        loads(`${FEFF}:: ${FEFF}plain\n`), [`${FEFF}plain`]);
}

const elapsed = Date.now() - started;
console.log(`\n[perf] total wall clock: ${elapsed} ms (ceiling ${CEILING_MS} ms)`);
if (elapsed > CEILING_MS) {
    fail(`perf ceiling exceeded: ${elapsed} ms > ${CEILING_MS} ms`);
}
process.exit(failed > 0 ? 1 : 0);
