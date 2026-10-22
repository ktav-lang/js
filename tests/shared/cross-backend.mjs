// Runtime-agnostic cross-backend agreement suite. Every VALID spec
// fixture is parsed by ALL supplied backends; each result must match the
// .json oracle AND every other backend, dumps/loads cross round-trips
// must agree, canonicalFromSource must reproduce the .canonical.ktav
// BYTES, and strict-lossy fixtures must throw the expected envelope on
// every backend's loadsStrict.
//
// Zero runtime-specific imports: filesystem/HTTP access is injected via
// the adapter object, exactly like tests/shared/assertions.mjs.

import { parseOracle, normalise, deepEqual } from "./assertions.mjs";

function deepEqualNorm(a, b) {
    return deepEqual(normalise(a), normalise(b));
}

function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/**
 * @param {object} io
 * @param {Record<string, {loads, dumps, loadsStrict, canonicalFromSource, format?}>} io.backends
 *     label -> operation set. At least two backends expected.
 * @param {(path: string) => string} io.readTextFile
 * @param {(path: string) => Uint8Array} io.readBytes
 * @param {(dir: string) => string[]} io.walkKtavFiles
 * @param {string} io.specDir — path to spec/versions/0.8/tests
 * @param {(m: string) => void} io.log
 */
export function runCrossBackend({ backends, readTextFile, readBytes, walkKtavFiles, specDir, log }) {
    let passed = 0, failed = 0;
    const labels = Object.keys(backends);
    if (labels.length < 2) throw new Error("runCrossBackend needs at least 2 backends");
    const recordPass = (name) => { passed++; log(`✔ [cross] ${name}`); };
    const recordFail = (name, err) => { failed++; log(`✖ [cross] ${name}: ${err.message || err}`); };
    const test = (name, fn) => {
        try { fn(); recordPass(name); } catch (e) { recordFail(name, e); }
    };

    const base = specDir;
    const fixtures = walkKtavFiles(`${base}/valid`).filter(f => !f.endsWith(".canonical.ktav"));
    test("cross: valid fixtures present", () => {
        if (fixtures.length === 0) throw new Error("no valid fixtures found under " + base + "/valid");
    });

    const strictLossy = walkKtavFiles(`${base}/strict-lossy`);

    const callAll = (op, arg) => {
        const results = {};
        for (const label of labels) {
            const fn = backends[label][op];
            if (typeof fn !== "function") throw new Error(`backend ${label} lacks ${op}`);
            results[label] = fn(arg);
        }
        return results;
    };

    for (const ktavFile of fixtures) {
        const name = ktavFile.slice(`${base}/valid/`.length).replace(/\\/g, "/");
        const source = readTextFile(ktavFile);
        const oracle = parseOracle(readTextFile(ktavFile.replace(/\.ktav$/, ".json")));

        test(`cross oracle: ${name}`, () => {
            for (const label of labels) {
                let parsed;
                try { parsed = backends[label].loads(source); }
                catch (e) { throw new Error(`[${label}] loads threw: ${e.message || e}`); }
                if (!deepEqualNorm(parsed, oracle)) {
                    throw new Error(`[${label}] parse differs from .json oracle`);
                }
            }
        });

        test(`cross agreement: ${name}`, () => {
            const parsed = callAll("loads", source);
            const first = normalise(parsed[labels[0]]);
            for (const label of labels.slice(1)) {
                if (!deepEqual(first, normalise(parsed[label]))) {
                    throw new Error(`[${label}] disagrees with [${labels[0]}]`);
                }
            }
        });

        test(`cross round-trip: ${name}`, () => {
            const parsed = callAll("loads", source);
            if (parsed[labels[0]] === null || typeof parsed[labels[0]] !== "object") return;
            // pure dumps -> native loads, native dumps -> pure loads.
            // Any two distinct labels form both directions.
            for (const a of labels) {
                for (const b of labels) {
                    if (a === b) continue;
                    let back;
                    try { back = backends[b].loads(backends[a].dumps(parsed[a])); }
                    catch (e) { throw new Error(`[${a} dumps -> ${b} loads] threw: ${e.message || e}`); }
                    if (!deepEqualNorm(back, parsed[a])) {
                        throw new Error(`[${a} dumps -> ${b} loads] value differs`);
                    }
                }
            }
        });

        test(`cross canonical bytes: ${name}`, () => {
            const expectedBytes = readBytes(ktavFile.replace(/\.ktav$/, ".canonical.ktav"));
            const canonicals = callAll("canonicalFromSource", source);
            for (const label of labels) {
                const actual = new TextEncoder().encode(canonicals[label]);
                if (!bytesEqual(actual, expectedBytes)) {
                    throw new Error(`[${label}] canonicalFromSource bytes differ from .canonical.ktav (${actual.length} vs ${expectedBytes.length} bytes)`);
                }
            }
        });
    }

    for (const ktavFile of strictLossy) {
        const name = ktavFile.slice(`${base}/strict-lossy/`.length).replace(/\\/g, "/");
        const source = readTextFile(ktavFile);
        const oracle = JSON.parse(readTextFile(ktavFile.replace(/\.ktav$/, ".json")));
        test(`cross strict-lossy: ${name}`, () => {
            for (const label of labels) {
                let err = null;
                try { backends[label].loadsStrict(source); } catch (e) { err = e; }
                if (err === null) throw new Error(`[${label}] loadsStrict accepted a lossy scalar`);
                for (const [field, want] of [["error", oracle.expected_error], ["body", oracle.body], ["canonical", oracle.canonical]]) {
                    if (err[field] !== want) {
                        throw new Error(`[${label}] error.${field} = ${JSON.stringify(err[field])}, want ${JSON.stringify(want)}`);
                    }
                }
            }
        });
    }

    // Focused kind-erasure contract pins (see run-perf-checks.mjs negative-float
    // block for the derivation). Per backend:
    //  - loads preserves the parsed negative-zero KIND; dumps of that generic
    //    Number is "k: 0" (jsToV/js_to_value Number→Integer erasure);
    //  - -1e16 round-trips dumps→loads to the EXACT BigInt value (out-of-2^53
    //    integer read path) — numeric value must not round;
    //  - canonicalFromSource preserves Float spelling/kind byte-exactly.
    // No typed-Float wrapper exists on the public surface (ts/internal/api.ts
    // KtavInput = Record<string, unknown> | unknown[]); the `$float` object is
    // a JSON-oracle encoding in tests/shared/assertions.mjs / tests/ffi, not an
    // input API — so these pins go through the generic-Number mapping only.
    // All backends share the same verified mapping (crates/napi/src/lib.rs
    // js_to_value Number branch lines 249–262 + integer_to_js lines 203–212;
    // crates/wasm/src/lib.rs js_to_value Number branch lines 208–221 +
    // value_to_js Integer branch lines 133–147; ts/pure/values.ts integerToJs
    // lines 72–84 + ts/pure/ktavvalue.ts numberToV lines 145–147), so every
    // expectation is asserted for every label.
    for (const label of labels) {
        const b = backends[label];
        test(`cross kind-erasure: [${label}] -0 parsed kind preserved`, () => {
            const parsed = b.loads("k: -0.0\n");
            if (!Object.is(parsed.k, -0)) {
                throw new Error(`[${label}] loads("k: -0.0\\n") did not preserve -0, got ${String(parsed.k)}`);
            }
        });
        test(`cross kind-erasure: [${label}] dumps of parsed -0 is "k: 0"`, () => {
            const parsed = b.loads("k: -0.0\n");
            if (b.dumps(parsed) !== "k: 0\n") {
                throw new Error(`[${label}] dumps of parsed -0 = ${JSON.stringify(b.dumps(parsed))}, want "k: 0\\n"`);
            }
        });
        test(`cross kind-erasure: [${label}] -1e16 round-trips to exact BigInt`, () => {
            const rt = b.loads(b.dumps(b.loads("k: -1e16\n")));
            if (!(typeof rt.k === "bigint" && rt.k === -10000000000000000n)) {
                throw new Error(`[${label}] -1e16 round trip: got ${typeof rt.k} ${String(rt.k)}, want exact bigint -10000000000000000n`);
            }
        });
        test(`cross kind-erasure: [${label}] canonicalFromSource preserves Float bytes`, () => {
            if (b.canonicalFromSource("k: -0.0\n") !== "k: -0.0\n") {
                throw new Error(`[${label}] canonicalFromSource("k: -0.0\\n") != "k: -0.0\\n"`);
            }
            if (b.canonicalFromSource("k: -1e16\n") !== "k: -1e16\n") {
                throw new Error(`[${label}] canonicalFromSource("k: -1e16\\n") != "k: -1e16\\n"`);
            }
        });
    }

    // Independent-oracle dotted-key diagnostic-path pins (see the
    // dotted-key block in run-perf-checks.mjs for the full insert.rs /
    // envelope.rs derivation). The expectation is the Rust-derived
    // CONSTANT, not cross-backend agreement — all backends could share
    // the same defect, so agreement alone proves nothing. insert_dotted
    // blocks at segment 0 (`a` → leaf Integer) before segment 1's
    // invalid `\q` escape is ever decoded; envelope.rs kind_path falls
    // back to the RAW segment spelling. loadsStrict blocks identically:
    // for the native backends it is the same Rust insert_dotted walk,
    // and the pure backend stops at the same earlier segment. The wire
    // envelope has NO `conflict` field (KtavErrorEnvelope,
    // ts/internal/api.ts), so only error + path are pinned here.
    for (const label of labels) {
        const b = backends[label];
        const expectConflictPath = (opName, op) => {
            let err = null;
            try { op('a: 1\na."\\q": 2\n'); } catch (e) { err = e; }
            if (!err) throw new Error(`[${label}] ${opName} accepted a conflicting dotted key`);
            if (err.error === "BadEscapeSequence") {
                throw new Error(`[${label}] ${opName}: BadEscapeSequence overwrote the original category`);
            }
            if (err.error !== "KeyPathConflict") {
                throw new Error(`[${label}] ${opName}: error = ${JSON.stringify(err.error)}, want "KeyPathConflict"`);
            }
            if (JSON.stringify(err.path) !== JSON.stringify(["a", "\"\\q\""])) {
                throw new Error(`[${label}] ${opName}: path = ${JSON.stringify(err.path)}, want ${JSON.stringify(["a", "\"\\q\""])}`);
            }
        };
        test(`cross diagnostic-path: [${label}] loads keeps KeyPathConflict over later bad escape`, () => {
            expectConflictPath("loads", b.loads);
        });
        test(`cross diagnostic-path: [${label}] loadsStrict keeps KeyPathConflict over later bad escape`, () => {
            expectConflictPath("loadsStrict", b.loadsStrict);
        });
        test(`cross diagnostic-path: [${label}] canonicalFromSource keeps KeyPathConflict over later bad escape`, () => {
            expectConflictPath("canonicalFromSource", b.canonicalFromSource);
        });
        test(`cross diagnostic-path: [${label}] format keeps KeyPathConflict over later bad escape`, () => {
            expectConflictPath("format", b.format);
        });
    }

    return { passed, failed, total: passed + failed };
}
