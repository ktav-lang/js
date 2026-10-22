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

    return { passed, failed, total: passed + failed };
}
