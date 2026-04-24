// Runtime-agnostic assertion set for ktav. Exported as a single
// `runAll({ loads, dumps, readTextFile, listFiles, specDir })`
// function so each runtime (Node / Bun / Deno / browser) can feed in
// its own `loads` / `dumps` implementation and filesystem adapter.
//
// Returns { passed, failed, total } and prints a `✔` / `✖` line per
// test. Keep assertions minimal; don't pull in node:assert or any
// runtime-specific matcher — and no bare-specifier imports, the
// browser runner loads this file via a plain <script type=module>.

// Oracle JSONs carry integers outside `Number.MAX_SAFE_INTEGER`
// (e.g. `integer_large.ktav` → `99999999999999999999`). Native
// `JSON.parse` rounds those, so we tap the stage-3 "source text
// access" reviver context — available in Node 21+, Bun 1.1+, Deno
// 1.41+, Chrome 114+ — to rebuild them as real `bigint`. Keeps the
// shared suite dependency-free.
function parseOracle(text) {
    return JSON.parse(text, (_key, value, context) => {
        if (
            typeof value === "number" &&
            context &&
            typeof context.source === "string" &&
            !Number.isSafeInteger(value) &&
            /^-?\d+$/.test(context.source)
        ) {
            return BigInt(context.source);
        }
        return value;
    });
}

function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a === "bigint" || typeof b === "bigint") return a?.toString() === b?.toString();
    if (a === null || b === null) return false;
    if (typeof a !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
        return true;
    }
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
    return true;
}

function normalise(v) {
    if (typeof v === "bigint") return v.toString();
    if (Array.isArray(v)) return v.map(normalise);
    if (v && typeof v === "object") {
        const out = {};
        for (const k of Object.keys(v)) out[k] = normalise(v[k]);
        return out;
    }
    return v;
}

/**
 * @param {object} io — adapter
 * @param {(s: string) => any} io.loads
 * @param {(obj: any) => string} io.dumps
 * @param {(path: string) => string} io.readTextFile  — UTF-8
 * @param {(dir: string) => string[]} io.walkKtavFiles  — returns .ktav paths under dir/**
 * @param {string} io.specDir  — root of spec checkout; null → skip conformance
 * @param {string} io.label  — "node" / "bun" / "deno" / "browser"
 * @param {(m: string) => void} io.log  — logger
 */
export function runAll({ loads, dumps, readTextFile, walkKtavFiles, specDir, label, log }) {
    let passed = 0, failed = 0;
    const recordPass = (name) => { passed++; log(`✔ [${label}] ${name}`); };
    const recordFail = (name, err) => {
        failed++;
        log(`✖ [${label}] ${name}: ${err.message || err}`);
    };

    const test = (name, fn) => {
        try { fn(); recordPass(name); } catch (e) { recordFail(name, e); }
    };
    const assertThrows = (fn, msg) => {
        let threw = false;
        try { fn(); } catch { threw = true; }
        if (!threw) throw new Error(msg || "expected to throw");
    };
    const assertEqual = (a, b, msg) => {
        if (!deepEqual(a, b)) {
            throw new Error(msg || `not equal: ${JSON.stringify(normalise(a))} vs ${JSON.stringify(normalise(b))}`);
        }
    };

    test("smoke: round-trip preserves scalars and nested shape", () => {
        const src = `
port:i 8080
host: localhost
tls: true
tags: [
    alpha
    beta
]
db.name: primary
`;
        const parsed = loads(src);
        if (parsed.port !== 8080) throw new Error(`port=${parsed.port}`);
        if (parsed.host !== "localhost") throw new Error(`host=${parsed.host}`);
        if (parsed.tls !== true) throw new Error(`tls=${parsed.tls}`);
        assertEqual(parsed.tags, ["alpha", "beta"]);
        if (parsed.db.name !== "primary") throw new Error(`db.name=${parsed.db.name}`);
        const reparsed = loads(dumps(parsed));
        assertEqual(reparsed, parsed);
    });

    test("smoke: bigint round-trip for out-of-range integers", () => {
        const big = "123456789012345678901234567890";
        const parsed = loads(`value:i ${big}\n`);
        if (typeof parsed.value !== "bigint") throw new Error(`expected bigint, got ${typeof parsed.value}`);
        if (parsed.value.toString() !== big) throw new Error(`mismatch: ${parsed.value}`);
    });

    test("smoke: dumps rejects non-object at top level", () => {
        assertThrows(() => dumps([1, 2, 3]));
    });

    if (!specDir) {
        log(`ℹ [${label}] spec dir not available — skipping conformance`);
        return { passed, failed, total: passed + failed };
    }

    const base = `${specDir}/versions/0.1/tests`;
    for (const ktavFile of walkKtavFiles(`${base}/valid`)) {
        const jsonFile = ktavFile.replace(/\.ktav$/, ".json");
        const name = ktavFile.slice(`${base}/valid/`.length).replace(/\\/g, "/");
        test(`valid: ${name}`, () => {
            const oracle = parseOracle(readTextFile(jsonFile));
            const parsed = loads(readTextFile(ktavFile));
            assertEqual(normalise(parsed), normalise(oracle));
        });
        test(`roundtrip: ${name}`, () => {
            const once = loads(readTextFile(ktavFile));
            if (!once || typeof once !== "object" || Array.isArray(once)) return;
            const twice = loads(dumps(once));
            assertEqual(normalise(twice), normalise(once));
        });
    }
    for (const ktavFile of walkKtavFiles(`${base}/invalid`)) {
        const name = ktavFile.slice(`${base}/invalid/`.length).replace(/\\/g, "/");
        test(`invalid: ${name}`, () => {
            assertThrows(() => loads(readTextFile(ktavFile)));
        });
    }

    return { passed, failed, total: passed + failed };
}
