// Runtime-agnostic assertion set for ktav. Exported as a single
// `runAll({ loads, dumps, readTextFile, listFiles, specDir, readBytes,
// listJsonFiles, format, canonicalFromSource })`
// function so each runtime (Node / Bun / Deno / browser) can feed in
// its own `loads` / `dumps` implementation and filesystem adapter.
//
// Returns { passed, failed, total } and prints a `✔` / `✖` line per
// test. Keep assertions minimal; don't pull in node:assert or any
// runtime-specific matcher — and no bare-specifier imports, the
// browser runner loads this file via a plain <script type=module>.

// Oracle JSONs carry integers outside `Number.MAX_SAFE_INTEGER`
// (e.g. `integer_large.ktav` → `99999999999999999999`). Native
// `JSON.parse` rounds those. On modern runtimes we lean on the
// stage-3 "source text access" reviver context (Node 21+, Bun 1.1+,
// Deno 1.41+, Chrome 114+); on older ones we preprocess the JSON
// text, wrapping out-of-range integer literals in a sentinel string
// that the reviver then converts to `bigint`. Keeps the shared suite
// zero-dep across the entire runtime matrix.
const __BIGINT_SENTINEL = "\u0000__KTAV_BIGINT__:";
const SUPPORTS_REVIVER_CONTEXT = (() => {
    try {
        let seen = false;
        JSON.parse("1", (_k, _v, ctx) => {
            if (ctx && typeof ctx.source === "string") seen = true;
            return _v;
        });
        return seen;
    } catch {
        return false;
    }
})();

// Also consumed by tests/shared/cross-backend.mjs (shared oracle parsing
// and value normalisation — single source of truth).
export { parseOracle, normalise, deepEqual };

function parseOracle(text) {
    if (SUPPORTS_REVIVER_CONTEXT) {
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
    // Fallback path: hand-tokenized pre-pass, then plain JSON.parse
    // with a reviver that unwraps the sentinel string back into a
    // `bigint`. Skips any number inside a string literal, so the
    // wrapping stays source-text correct.
    let out = "";
    let i = 0;
    const len = text.length;
    while (i < len) {
        const c = text[i];
        if (c === '"') {
            let j = i + 1;
            while (j < len) {
                if (text[j] === "\\") { j += 2; continue; }
                if (text[j] === '"') { j++; break; }
                j++;
            }
            out += text.slice(i, j);
            i = j;
            continue;
        }
        if (c === "-" || (c >= "0" && c <= "9")) {
            const m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
            if (m) {
                const num = m[0];
                const isPureInt = !num.includes(".") && !/[eE]/.test(num);
                const abs = num.startsWith("-") ? num.slice(1) : num;
                if (isPureInt && abs.length >= 16) {
                    out += JSON.stringify(__BIGINT_SENTINEL + num);
                } else {
                    out += num;
                }
                i += num.length;
                continue;
            }
        }
        out += c;
        i++;
    }
    return JSON.parse(out, (_key, value) => {
        if (typeof value === "string" && value.startsWith(__BIGINT_SENTINEL)) {
            return BigInt(value.slice(__BIGINT_SENTINEL.length));
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
 * @param {(bytes: Uint8Array) => any} [io.loadsBytes]  — raw-byte entry for
 *     the invalid_utf8/ fixtures (spec 0.8.1); required when specDir is
 *     present and any manifest.fixture_flags raw_bytes fixture exists
 * @param {(obj: any) => string} io.dumps
 * @param {(obj: any) => string} [io.stringifyForceStrings]  — optional 0.3.1 force-strings dumper
 * @param {(path: string) => string} io.readTextFile  — UTF-8
 * @param {(dir: string) => string[]} io.walkKtavFiles  — returns .ktav paths under dir/**
 * @param {(path: string) => Uint8Array} [io.readBytes]  — raw bytes (needed for
 *     the invalid/invalid_utf8/ fixtures, whose .ktav input is deliberately
 *     not valid UTF-8; required only when specDir is present)
 * @param {(dir: string) => string[]} [io.listJsonFiles]  — returns .json paths
 *     under dir/** (needed for the unrepresentable/ fixtures, which ship no
 *     .ktav by design; required only when specDir is present)
 * @param {string} io.specDir  — path to `spec/versions/0.7/tests`; null → skip conformance
 * @param {(s: string) => string} [io.format]  — comment-preserving formatter
 * @param {(s: string) => string} [io.canonicalFromSource]  — canonical writer over
 *     SOURCE TEXT (text in, canonical text out; byte-exact conformance needs
 *     this AND readBytes). Text-to-text so the Ktav Integer/Float distinction
 *     never crosses a JS value boundary.
 * @param {string} io.label  — "node" / "bun" / "deno" / "browser"
 * @param {(m: string) => void} io.log  — logger
 */
export function runAll({ loads, loadsStrict, loadsBytes, dumps, stringifyForceStrings, readTextFile, walkKtavFiles, readBytes, listJsonFiles, listDirectories, format, canonicalFromSource, specDir, label, log }) {
    let passed = 0, failed = 0;
    // Number of invalid_utf8/ fixtures actually driven through the
    // backend's loadsBytes raw-byte entry — backs the count-validation
    // test below so "nine fixtures ran" is a real, asserted claim.
    let loadsBytesFixtures = 0;
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
port: 8080
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

    test("strict: rejects lossy scalars and accepts canonical float forms", () => {
        assertThrows(() => loadsStrict("version: 1.10\n"), "expected strict mode to reject 1.10");
        const parsed = loadsStrict("small: 1e-3\nlarge: 1e10\n");
        if (parsed.small !== 0.001) throw new Error(`small=${parsed.small}`);
        if (parsed.large !== 10000000000) throw new Error(`large=${parsed.large}`);
    });

    test("smoke: out-of-range integer becomes String (spec 0.5.0)", () => {
        // Under spec 0.5.0, integers that overflow i64 are kept as Strings,
        // not converted to BigInt. The spec fixture `i64_overflow_to_string`
        // and `big_overflow_to_string` both confirm this.
        const big = "123456789012345678901234567890";
        const parsed = loads(`value: ${big}\n`);
        if (typeof parsed.value !== "string") throw new Error(`expected string, got ${typeof parsed.value}`);
        if (parsed.value !== big) throw new Error(`mismatch: ${parsed.value}`);
    });

    test("smoke: dumps rejects scalar at top level", () => {
        assertThrows(() => dumps(42));
        assertThrows(() => dumps("hello"));
        assertThrows(() => dumps(null));
    });

    // spec 0.5.0: top-level Array support.
    test("0.5.0: top-level Array round-trip via dumps/loads", () => {
        const arr = ["alpha", 8080, 0.5, true, null, ["nested", "items"], { k: "v" }];
        const text = dumps(arr);
        const back = loads(text);
        if (!Array.isArray(back)) throw new Error("expected Array, got " + typeof back);
        assertEqual(normalise(back), normalise(arr));
    });

    test("0.5.0: top-level Array — bare scalar first line", () => {
        const text = "alpha\nbeta\ngamma\n";
        const parsed = loads(text);
        if (!Array.isArray(parsed)) throw new Error("expected Array");
        assertEqual(parsed, ["alpha", "beta", "gamma"]);
    });

    test("0.5.0: top-level Array — typed-item first line", () => {
        const parsed = loads("1\n2\n3\n");
        if (!Array.isArray(parsed)) throw new Error("expected Array");
        assertEqual(parsed, [1, 2, 3]);
    });

    test("0.5.0: empty input still defaults to Object (Array detection only on content)", () => {
        const parsed = loads("");
        if (Array.isArray(parsed) || typeof parsed !== "object" || parsed === null) {
            throw new Error("expected Object for empty input");
        }
    });

    if (typeof stringifyForceStrings === "function") {
        test("0.5.0: stringifyForceStrings flattens scalars to strings", () => {
            const text = stringifyForceStrings({ port: 8080, ratio: 0.5, tls: true, name: "web", n: null });
            // Every scalar should round-trip as a String now — no `:i`, `:f`,
            // bare `true` / `null` markers in the output.
            if (/:i\s/.test(text)) throw new Error(":i marker leaked: " + text);
            if (/:f\s/.test(text)) throw new Error(":f marker leaked: " + text);
            const back = loads(text);
            if (back.port !== "8080") throw new Error("port not stringified: " + back.port);
            if (back.ratio !== "0.5") throw new Error("ratio not stringified: " + back.ratio);
            if (back.tls !== "true") throw new Error("tls not stringified: " + back.tls);
            if (back.n !== "null") throw new Error("n not stringified: " + back.n);
            if (back.name !== "web") throw new Error("name lost: " + back.name);
        });
        test("0.5.0: stringifyForceStrings round-trips top-level Array", () => {
            const text = stringifyForceStrings([1, 2.5, true, "raw"]);
            const back = loads(text);
            if (!Array.isArray(back)) throw new Error("expected Array");
            assertEqual(back, ["1", "2.5", "true", "raw"]);
        });
    }

    // spec 0.7: quoted keys and \uXXXX escapes at the API level.
    test("0.7: quoted key round-trips (§ 5.3.3)", () => {
        const parsed = loads('"a.b": 1\n\'c d\': true\n');
        if (parsed["a.b"] !== 1) throw new Error(`a.b=${parsed["a.b"]}`);
        if (parsed["c d"] !== true) throw new Error(`c d=${parsed["c d"]}`);
        const reparsed = loads(dumps(parsed));
        assertEqual(reparsed, parsed);
    });

    test("0.7: \\uXXXX escape in inline compound value and key (§ 3.7.1)", () => {
        // § 3.7.1: escapes are recognised in inline scalar values and keys —
        // NOT in plain-body scalars (corpus: valid/scalars/
        // unicode_escape_not_processed_in_plain_body), so exercise the
        // inline-compound form.
        if (loads("s: {a: A\\u0041B}\n").s.a !== "AAB") throw new Error("\\u0041 in value");
        // Escaped colon must not act as a key/value separator.
        if (loads("s: {a: x\\u003Ay}\n").s.a !== "x:y") throw new Error("\\u003A in value");
        // Exactly four digits consumed; a trailing hex digit is content.
        if (loads("s: {a: A\\u00411}\n").s.a !== "AA1") throw new Error("\\u00411 greediness");
        if (loads("\\u0061b: 1\n").ab !== 1) throw new Error("\\u0061 in key");
        if (loads("s: {a: \\uD83D\\uDE00}\n").s.a !== "\u{1F600}") throw new Error("surrogate pair");
    });

    test("0.7: lone surrogate escape rejected (§ 3.7.1)", () => {
        assertThrows(() => loads("s: {a: \\uD800}\n"));
    });

    test("0.7: U+0000 key survives loads/dumps (§ 3.7.1)", () => {
        const parsed = loads("a\\u0000b: v\n");
        if (Object.keys(parsed).length !== 1) throw new Error(`keys=${Object.keys(parsed).length}`);
        if (parsed["a\u0000b"] !== "v") throw new Error("NUL key lost");
        const reparsed = loads(dumps(parsed));
        assertEqual(reparsed, parsed);
    });

    // Structured errors (always): every throw is a KtavError carrying
    // the ten-field `ktav::ErrorEnvelope` with exact wire names.
    test("errors: loads failure carries the ten-field envelope", () => {
        let err = null;
        try { loads("a: [\n"); } catch (e) { err = e; }
        if (!err) throw new Error("expected loads(\"a: [\\n\") to throw");
        if (err.name !== "KtavError") throw new Error(`name=${err.name}`);
        if (err.error !== "UnclosedCompound") throw new Error(`error=${err.error}`);
        const isNull = (v) => v === null || v === undefined;
        if (!(isNull(err.reason) || typeof err.reason === "string")) throw new Error(`reason type: ${typeof err.reason}`);
        if (!(isNull(err.line) || typeof err.line === "number")) throw new Error(`line type: ${typeof err.line}`);
        if (!(isNull(err.line_text) || typeof err.line_text === "string")) throw new Error(`line_text type: ${typeof err.line_text}`);
        if (!(isNull(err.span) || (typeof err.span === "object" && typeof err.span.start === "number" && typeof err.span.end === "number"))) {
            throw new Error(`span shape: ${JSON.stringify(err.span)}`);
        }
        if (!(isNull(err.path) || Array.isArray(err.path))) throw new Error(`path type: ${typeof err.path}`);
        for (const k of ["body", "canonical", "spec_section"]) {
            if (!(isNull(err[k]) || typeof err[k] === "string")) throw new Error(`${k} type: ${typeof err[k]}`);
        }
        if (typeof err.message !== "string" || err.message.length === 0) throw new Error("empty message");
        if (err.message.startsWith("{")) throw new Error("message contains raw JSON");
        // Since ktav 0.8.0 `message` is the core's own verbatim rendering,
        // not a reconstruction — it need not contain the error class name.
    });

    // ktav 0.8.0: `message` is the envelope's own tenth field, taken
    // verbatim — never a locally reassembled sentence. Pin the exact
    // core wording and reject the pre-0.8.0 "Ktav parse error <Class>"
    // shape that a local reconstruction would have produced.
    test("errors: message is the core's own rendering, not a reconstructed sentence", () => {
        let err = null;
        try { loads("a: [\n"); } catch (e) { err = e; }
        if (!err) throw new Error("expected loads(\"a: [\\n\") to throw");
        if (err.message !== "Syntax error: Unclosed array at end of input") {
            throw new Error(`expected verbatim core message, got: ${JSON.stringify(err.message)}`);
        }
        if (err.message.startsWith("Ktav parse error")) {
            throw new Error("message looks locally reconstructed, not the core's verbatim rendering");
        }
    });

    // Formatter (optional adapter).
    if (typeof format === "function") {
        test("format: preserves comments verbatim and is a fixed point", () => {
            const doc = "## header comment\n\n\n\nport: 8080\nhost: example\n\n\n\n## footer comment\n";
            const once = format(doc);
            if (!once.includes("## header comment")) throw new Error("header comment lost");
            if (!once.includes("## footer comment")) throw new Error("footer comment lost");
            // The 3+ blank-line run collapses to exactly one blank line:
            // no three consecutive newlines may survive.
            if (/\n\n\n/.test(once)) throw new Error("blank-line run not collapsed: " + JSON.stringify(once));
            const twice = format(once);
            if (twice !== once) throw new Error(`not a fixed point:\n${JSON.stringify(once)}\nvs\n${JSON.stringify(twice)}`);
        });
    }
    if (typeof format === "function" && typeof canonicalFromSource === "function") {
        test("format: comment-free and blank-free document equals canonicalFromSource of the document", () => {
            const doc = "port: 8080\nhost: localhost\ntags: [\n    alpha\n    beta\n]\n";
            if (format(doc) !== canonicalFromSource(doc)) {
                throw new Error(`format(doc)=${JSON.stringify(format(doc))} vs canonicalFromSource(doc)=${JSON.stringify(canonicalFromSource(doc))}`);
            }
        });
    }

    if (!specDir) {
        log(`ℹ [${label}] spec dir not available — skipping conformance`);
        return { passed, failed, total: passed + failed };
    }

    const base = specDir;
    const inventory = {
        valid: { count: 228, extensions: [".ktav", ".json", ".canonical.ktav"] },
        invalid: { count: 90, extensions: [".ktav", ".json"] },
        unrepresentable: { count: 5, extensions: [".json"] },
        "parseable-unrepresentable": { count: 4, extensions: [".ktav", ".json"] },
        "strict-lossy": { count: 13, extensions: [".ktav", ".json"] },
    };
    test("spec 0.8: manifest and fixture inventory are exact", () => {
        const manifest = JSON.parse(readTextFile(`${base}/manifest.json`));
        if (manifest.schema_version !== 1) throw new Error(`unsupported manifest schema_version: ${manifest.schema_version}`);
        const categories = Object.keys(manifest.categories || {}).sort();
        const expectedCategories = Object.keys(inventory).sort();
        if (JSON.stringify(categories) !== JSON.stringify(expectedCategories)) {
            throw new Error(`manifest categories differ: ${categories.join(", ")}`);
        }
        for (const [category, expected] of Object.entries(inventory)) {
            if (manifest.categories[category]?.count !== expected.count) {
                throw new Error(`manifest ${category}.count=${manifest.categories[category]?.count}, expected ${expected.count}`);
            }
        }
        // spec 0.8.1: fixture_flags — exactly the 9 raw_bytes fixtures, all
        // under invalid/invalid_utf8/. Fail closed: a runner whose adapter
        // set cannot honour raw bytes must FAIL, not silently skip.
        const flags = Array.isArray(manifest.fixture_flags) ? manifest.fixture_flags : null;
        if (!flags || flags.length !== 9) {
            throw new Error(`manifest.fixture_flags: expected exactly 9 entries, got ${flags ? flags.length : "missing"}`);
        }
        for (const entry of flags) {
            if (entry.category !== "invalid" || !entry.fixture.startsWith("invalid_utf8/")) {
                throw new Error(`fixture_flags entry outside invalid/invalid_utf8/: ${entry.category}/${entry.fixture}`);
            }
            if (JSON.stringify(entry.flags) !== JSON.stringify(["raw_bytes"])) {
                throw new Error(`fixture_flags ${entry.fixture}: expected flags ["raw_bytes"], got ${JSON.stringify(entry.flags)}`);
            }
        }
        if (typeof listDirectories !== "function") throw new Error("adapter required: listDirectories(dir)");
        const actualDirectories = listDirectories(base).map(p => p.replace(/\\/g, "/").split("/").pop()).sort();
        if (JSON.stringify(actualDirectories) !== JSON.stringify(expectedCategories)) {
            throw new Error(`on-disk categories differ: ${actualDirectories.join(", ")}`);
        }
        for (const [category, expected] of Object.entries(inventory)) {
            const dir = `${base}/${category}`;
            const ktav = walkKtavFiles(dir).map(p => p.replace(/\\/g, "/").slice(dir.length + 1));
            const json = listJsonFiles(dir).map(p => p.replace(/\\/g, "/").slice(dir.length + 1));
            const extensionCounts = {
                ".ktav": ktav.filter(p => p.endsWith(".ktav") && !p.endsWith(".canonical.ktav")).length,
                ".json": json.filter(p => p.endsWith(".json")).length,
                ".canonical.ktav": ktav.filter(p => p.endsWith(".canonical.ktav")).length,
            };
            for (const [extension, count] of Object.entries(extensionCounts)) {
                const expectedCount = expected.extensions.includes(extension) ? expected.count : 0;
                if (count !== expectedCount) throw new Error(`${category}: expected ${expectedCount} ${extension} files, found ${count}`);
            }
            const inputs = category === "unrepresentable"
                ? json
                : ktav.filter(p => category !== "valid" || !p.endsWith(".canonical.ktav"));
            const stems = inputs.map(p => p.replace(/\.ktav$/, "").replace(/\.json$/, "").replace(/\.canonical$/, ""));
            if (stems.length !== expected.count || new Set(stems).size !== expected.count) {
                throw new Error(`${category}: expected ${expected.count} unique fixtures, found ${stems.length}`);
            }
            for (const stem of stems) {
                for (const ext of expected.extensions) {
                    const path = `${dir}/${stem}${ext}`;
                    const files = ext === ".ktav" || ext === ".canonical.ktav" ? ktav : json;
                    if (!files.includes(`${stem}${ext}`)) throw new Error(`missing fixture companion: ${path}`);
                }
            }
        }
    });
    for (const ktavFile of walkKtavFiles(`${base}/valid`).filter(f => !f.endsWith(".canonical.ktav"))) {
        const jsonFile = ktavFile.replace(/\.ktav$/, ".json");
        const name = ktavFile.slice(`${base}/valid/`.length).replace(/\\/g, "/");
        test(`valid: ${name}`, () => {
            const oracle = parseOracle(readTextFile(jsonFile));
            const parsed = loads(readTextFile(ktavFile));
            assertEqual(normalise(parsed), normalise(oracle));
        });
        test(`roundtrip: ${name}`, () => {
            const once = loads(readTextFile(ktavFile));
            // Skip non-compound roots — `dumps` only accepts Object / Array.
            // Top-level Arrays (spec 0.5.0) are now allowed and exercised.
            if (once === null || typeof once !== "object") return;
            const twice = loads(dumps(once));
            assertEqual(normalise(twice), normalise(once));
        });
    }
    // spec § 8.5: byte-exact canonical conformance. Writer output must
    // match the corpus's `.canonical.ktav` BYTES — a value round-trip
    // proves nothing about canonical spelling (a JS number cannot carry
    // Ktav's Integer/Float distinction: `1.0` reaches the writer as `1`,
    // `1e9` as `1000000000`, `-0.0` as `0`). Needs `canonicalFromSource`
    // (source text in, canonical text out — no JS value round-trip)
    // AND `readBytes`; the canonical file's existence is probed by
    // letting `readBytes` throw. If `canonicalFromSource` throws on a
    // fixture that HAS a canonical file, the test FAILS loudly — no
    // catch-and-skip.
    if (typeof canonicalFromSource !== "function" || typeof readBytes !== "function") {
        const missing = typeof canonicalFromSource !== "function"
            ? "canonicalFromSource(source) -> string"
            : "readBytes(path) -> Uint8Array";
        test("canonical: adapter wiring", () => {
            throw new Error(
                `adapter required: ${missing} (canonical byte-exact conformance needs ` +
                `canonicalFromSource AND readBytes — silent skip would hide truncated-corpus false greens)`,
            );
        });
    } else {
        for (const ktavFile of walkKtavFiles(`${base}/valid`).filter(f => !f.endsWith(".canonical.ktav"))) {
            const canonicalPath = ktavFile.replace(/\.ktav$/, ".canonical.ktav");
            const name = ktavFile.slice(`${base}/valid/`.length).replace(/\\/g, "/");
            test(`canonical: ${name}`, () => {
                // Text in, text out — the Integer/Float distinction never
                // crosses a JS value boundary. A throw here is a loud test
                // failure, not a skip.
                const canonicalText = canonicalFromSource(readTextFile(ktavFile));
                const expectedBytes = readBytes(canonicalPath);
                const actual = new TextEncoder().encode(canonicalText);
                if (actual.length === expectedBytes.length) {
                    let same = true;
                    for (let i = 0; i < actual.length; i++) {
                        if (actual[i] !== expectedBytes[i]) { same = false; break; }
                    }
                    if (same) return;
                }
                // Mismatch — locate first differing byte and build a
                // bounded hex/context excerpt (80 bytes around it).
                const n = Math.min(actual.length, expectedBytes.length);
                let off = n;
                for (let i = 0; i < n; i++) {
                    if (actual[i] !== expectedBytes[i]) { off = i; break; }
                }
                const hex = (buf) => {
                    const start = Math.max(0, off - 8);
                    const slice = buf.slice(start, Math.min(buf.length, start + 80));
                    return Array.from(slice).map(b => b.toString(16).padStart(2, "0")).join(" ");
                };
                throw new Error(
                    `canonical bytes differ at offset ${off} ` +
                    `(expected ${expectedBytes.length} bytes, got ${actual.length}): ` +
                    `expected [${hex(expectedBytes)}] vs actual [${hex(actual)}]`,
                );
            });
        }
    }

    for (const ktavFile of walkKtavFiles(`${base}/invalid`).filter(f => !f.endsWith(".canonical.ktav"))) {
        const name = ktavFile.slice(`${base}/invalid/`.length).replace(/\\/g, "/");
        test(`invalid: ${name}`, () => {
            const oracleText = readTextFile(ktavFile.replace(/\.ktav$/, ".json"));
            const oracle = JSON.parse(oracleText);
            if (ktavFile.includes("/invalid_utf8/")) {
                // § 6.15: the raw bytes ARE the fixture. A text-mode read
                // would replace 0x80 with U+FFFD before the parser ever
                // sees it. loadsBytes is REQUIRED — a backend that only
                // proves TextDecoder rejects the bytes never proves the
                // PARSER rejects them, so a missing adapter FAILS the
                // test (fail closed, never silently pass).
                if (typeof readBytes !== "function") {
                    throw new Error("adapter required: readBytes(path) -> Uint8Array (invalid_utf8 fixtures are raw bytes)");
                }
                if (typeof loadsBytes !== "function") {
                    throw new Error("adapter required: loadsBytes(bytes) -> value (raw-byte conformance, spec 0.8.1 §6.15) — TextDecoder-only coverage is vacuous");
                }
                const bytes = readBytes(ktavFile);
                let decodeRejected = false;
                try {
                    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
                } catch {
                    decodeRejected = true; // strict decoding rejected the bytes — correct.
                }
                if (!decodeRejected) {
                    throw new Error("invalid_utf8: strict UTF-8 decode unexpectedly succeeded — byte→string boundary must reject");
                }
                loadsBytesFixtures++;
                let u8err = null;
                try { loadsBytes(bytes); } catch (e) { u8err = e; }
                if (u8err === null) {
                    throw new Error(`invalid_utf8: loadsBytes() accepted ${bytes.length} invalid bytes`);
                }
                if (u8err.error !== "InvalidUtf8") {
                    throw new Error(`invalid_utf8: expected error=InvalidUtf8, got ${JSON.stringify(u8err.error)} (${String(u8err.message || u8err)})`);
                }
                if (!u8err.span || typeof u8err.span.start !== "number" || typeof u8err.span.end !== "number" || u8err.span.end <= u8err.span.start) {
                    throw new Error(`invalid_utf8: expected nonempty span, got ${JSON.stringify(u8err.span)}`);
                }
                if (oracle.expected_error !== "InvalidUtf8") {
                    throw new Error(`invalid_utf8 oracle drift: expected_error=${JSON.stringify(oracle.expected_error)}`);
                }
                return;
            }
            let error = null;
            try {
                loads(readTextFile(ktavFile));
            } catch (e) {
                error = e;
            }
            if (error === null) throw new Error("expected loads() to throw");
            if (typeof oracle.expected_error === "string" && error.error !== oracle.expected_error) {
                throw new Error(`expected structured error category ${JSON.stringify(oracle.expected_error)}, got ${JSON.stringify(error.error)} (${String(error.message || error)})`);
            }
        });
    }

    // Count validation: "nine invalid_utf8 fixtures ran" must be a real
    // claim. The corpus ships exactly 9 invalid_utf8/*.ktav fixtures;
    // every one must have been driven through the backend's loadsBytes
    // raw-byte entry above.
    if (loadsBytesFixtures > 0) {
        test("invalid_utf8: exactly 9 raw_bytes fixtures ran through loadsBytes", () => {
            if (loadsBytesFixtures !== 9) {
                throw new Error(`expected 9 invalid_utf8 fixtures exercised via loadsBytes, got ${loadsBytesFixtures}`);
            }
        });
    }

    // spec 0.8.1 §6.15: EXACT raw-byte coordinate regression. The oracle
    // below is a small hand-rolled std-semantics UTF-8 diagnostic, fully
    // independent of the SUT: lead-size table (2/3/4, special second-byte
    // ranges for E0/ED/F0/F4), an interrupted sequence's error length is
    // the bytes consumed before the interruptor, truncation at EOF has no
    // length, and an illegal lead is a one-byte error whose envelope span
    // swallows any immediately following continuation bytes (the cabi
    // envelope contract, rust/src/cabi/envelope.rs::not_utf8_envelope).
    // The §3.2 line counter is mirrored too: each LF, lone CR and CRLF
    // terminator counted over the raw bytes, a terminator counting only
    // when it ends at or before the offset.
    if (typeof readBytes === "function" && typeof loadsBytes === "function") {
        const isCont = (b) => b >= 0x80 && b <= 0xbf;
        const lineOfOffsetOracle = (bytes, pos) => {
            let line = 1;
            let i = 0;
            const bound = Math.min(pos, bytes.length);
            while (i < bound) {
                if (bytes[i] === 0x0a) { line++; i++; }
                else if (bytes[i] === 0x0d) {
                    if (bytes[i + 1] === 0x0a) {
                        if (i + 2 <= pos) line++;
                        i += 2;
                    } else { line++; i++; }
                } else i++;
            }
            return line;
        };
        const utf8Oracle = (bytes) => {
            const len = bytes.length;
            let i = 0;
            while (i < len) {
                const b = bytes[i];
                if (b < 0x80) {
                    i++;
                } else {
                    let size = 0, lo = 0x80, hi = 0xbf;
                    if (b >= 0xc2 && b <= 0xdf) size = 2;
                    else if (b >= 0xe0 && b <= 0xef) {
                        size = 3;
                        if (b === 0xe0) lo = 0xa0;
                        else if (b === 0xed) hi = 0x9f;
                    } else if (b >= 0xf0 && b <= 0xf4) {
                        size = 4;
                        if (b === 0xf0) lo = 0x90;
                        else if (b === 0xf4) hi = 0x8f;
                    }
                    if (size === 0) {
                        // Illegal lead (80..BF, C0, C1, F5..FF): one-byte
                        // error; the envelope span swallows continuations.
                        let end = i + 1;
                        while (end < len && isCont(bytes[end])) end++;
                        return { validUpTo: i, end, line: lineOfOffsetOracle(bytes, i) };
                    }
                    let j = i + 1, consumed = 1, rangeBad = false, truncated = false, interrupted = false;
                    while (consumed < size) {
                        if (j >= len) { truncated = true; break; }
                        const c = bytes[j];
                        if (!isCont(c)) { interrupted = true; break; }
                        if (consumed === 1 && (c < lo || c > hi)) { rangeBad = true; break; }
                        consumed++; j++;
                    }
                    if (truncated) {
                        return { validUpTo: i, end: len, line: lineOfOffsetOracle(bytes, i) };
                    }
                    if (interrupted) {
                        // error_len = bytes consumed so far — the span
                        // must NOT include the interrupting byte.
                        return { validUpTo: i, end: i + consumed, line: lineOfOffsetOracle(bytes, i) };
                    }
                    if (rangeBad) {
                        let end = i + 1;
                        while (end < len && isCont(bytes[end])) end++;
                        return { validUpTo: i, end, line: lineOfOffsetOracle(bytes, i) };
                    }
                    i += size;
                }
            }
            return null; // valid input — not reached for the fixtures below
        };
        const assertUtf8Envelope = (label, bytes, err) => {
            if (err === null || err === undefined) throw new Error(`${label}: loadsBytes() accepted invalid bytes`);
            const exp = utf8Oracle(bytes);
            if (!exp) throw new Error(`${label}: oracle bug — input unexpectedly valid`);
            if (err.error !== "InvalidUtf8") {
                throw new Error(`${label}: expected error=InvalidUtf8, got ${JSON.stringify(err.error)} (${String(err.message || err)})`);
            }
            if (!err.span || err.span.start !== exp.validUpTo) {
                throw new Error(`${label}: span.start=${err.span && err.span.start}, expected validUpTo ${exp.validUpTo}`);
            }
            if (err.span.end !== exp.end) {
                throw new Error(`${label}: span.end=${err.span.end}, expected ${exp.end}`);
            }
            if (err.line !== exp.line) {
                throw new Error(`${label}: line=${JSON.stringify(err.line)}, expected raw line ${exp.line}`);
            }
            if (err.line_text !== null) {
                throw new Error(`${label}: line_text must be null (no valid source text), got ${JSON.stringify(err.line_text)}`);
            }
            if (typeof err.body !== "string" || !err.body.startsWith("input is not valid UTF-8:")) {
                throw new Error(`${label}: body=${JSON.stringify(err.body)}`);
            }
            const wantMessage = `InvalidUtf8: input is not valid UTF-8; first invalid byte sequence at byte offset ${exp.validUpTo}`;
            if (err.message !== wantMessage) {
                throw new Error(`${label}: message=${JSON.stringify(err.message)}, expected ${JSON.stringify(wantMessage)}`);
            }
        };
        // Synthetic cases, built inline as raw byte arrays.
        const synthetic = [
            { name: "E1 80 interrupted by ASCII A", bytes: [0x61, 0x3a, 0x20, 0xe1, 0x80, 0x41, 0x0a] },
            { name: "E1 80 truncated at EOF", bytes: [0x61, 0x0a, 0xe1, 0x80] },
            { name: "bad byte on line 3 after two CRLFs", bytes: [0x61, 0x0d, 0x0a, 0x62, 0x0d, 0x0a, 0x80] },
            { name: "bad byte on line 3 after two lone CRs", bytes: [0x61, 0x0d, 0x62, 0x0d, 0x80] },
            { name: "BOM skipped but offsets include it", bytes: [0xef, 0xbb, 0xbf, 0x61, 0x3a, 0x20, 0x31, 0x0d, 0x80] },
            { name: "stray continuation byte", bytes: [0x80, 0x0a] },
        ];
        test("invalid_utf8: synthetic exact-coordinate cases vs independent oracle", () => {
            for (const { name, bytes } of synthetic) {
                const raw = new Uint8Array(bytes);
                let err = null;
                try { loadsBytes(raw); } catch (e) { err = e; }
                assertUtf8Envelope(name, raw, err);
            }
        });
        const u8fixtures = walkKtavFiles(`${base}/invalid`).filter((f) => f.includes("/invalid_utf8/"));
        test("invalid_utf8: all 9 fixtures match the independent coordinate oracle exactly", () => {
            if (u8fixtures.length !== 9) {
                throw new Error(`expected 9 invalid_utf8 fixtures, found ${u8fixtures.length}`);
            }
            for (const f of u8fixtures) {
                const bytes = readBytes(f);
                let err = null;
                try { loadsBytes(bytes); } catch (e) { err = e; }
                assertUtf8Envelope(f, bytes, err);
            }
        });
    }

    // § 6: the EOF-detected UnclosedCompound repair — the envelope must
    // derive the 1-based line from the opener span (rust/src/cabi/
    // envelope.rs::envelope post-step). This FAILS if the line-derivation
    // is reverted (from_error alone ships line=null).
    test("errors: EOF-detected UnclosedCompound carries the derived opener line", () => {
        let err = null;
        try { loads("a: [\n"); } catch (e) { err = e; }
        if (!err) throw new Error("expected loads to throw on an unterminated array opener");
        if (err.error !== "UnclosedCompound") throw new Error(`error=${err.error}`);
        if (err.line !== 1) throw new Error(`expected derived opener line 1, got ${JSON.stringify(err.line)}`);
        if (!err.span || typeof err.span.start !== "number" || typeof err.span.end !== "number" || err.span.end <= err.span.start) {
            throw new Error(`expected nonempty span, got ${JSON.stringify(err.span)}`);
        }
        if (err.line_text !== "a: [") throw new Error(`line_text=${JSON.stringify(err.line_text)}`);
    });

    // spec 0.7: unrepresentable/ — JSON-only fixtures whose values must be
    // REFUSED by the writer. Non-finite floats are encoded as a sentinel
    // `{ "$float": "NaN" | "Infinity" | "-Infinity" }` one-field object.
    const convertUnrepresentable = (v) => {
        if (Array.isArray(v)) return v.map(convertUnrepresentable);
        if (v && typeof v === "object") {
            const keys = Object.keys(v);
            if (keys.length === 1 && keys[0] === "$float") {
                const s = v["$float"];
                if (s === "NaN" || s === "Infinity" || s === "-Infinity") return Number(s);
                throw new Error(`unknown $float sentinel: ${JSON.stringify(v)}`);
            }
            const out = {};
            for (const k of keys) out[k] = convertUnrepresentable(v[k]);
            return out;
        }
        return v;
    };
    // Reasons where the JS binding itself rejects before the crate, so the
    // message does NOT carry the reason-code substring.
    const BINDING_SIDE_REFUSALS = new Set(["ScalarRoot", "NonFiniteFloat"]);
    for (const jsonFile of (listJsonFiles ? listJsonFiles(`${base}/unrepresentable`) : (() => { throw new Error("adapter required: listJsonFiles(dir) -> string[] (unrepresentable fixtures ship no .ktav)"); })())) {
        const name = jsonFile.slice(`${base}/unrepresentable/`.length).replace(/\\/g, "/").replace(/\.json$/, "");
        test(`unrepresentable: ${name}`, () => {
            const fx = JSON.parse(readTextFile(jsonFile));
            // Corpus drift guard: exactly the three documented fields.
            const fields = Object.keys(fx).sort();
            if (fields.length !== 3 || fields.join(",") !== "note,unrepresentable_reason,value") {
                throw new Error(`fixture drift — expected {value, unrepresentable_reason, note}, got {${fields.join(", ")}}`);
            }
            if (typeof fx.note !== "string" || fx.note.length === 0) throw new Error("empty note");
            const jsValue = convertUnrepresentable(fx.value);
            let message = null;
            try { dumps(jsValue); } catch (e) { message = String(e.message || e); }
            if (message === null) throw new Error(`dumps() accepted an unrepresentable value: ${JSON.stringify(normalise(jsValue))}`);
            if (!BINDING_SIDE_REFUSALS.has(fx.unrepresentable_reason)) {
                if (!message.includes(fx.unrepresentable_reason)) {
                    throw new Error(`expected reason "${fx.unrepresentable_reason}" in message: ${message}`);
                }
            }
        });
    }

    // spec 0.7: parseable-unrepresentable/ — parses cleanly, but the value
    // has no writer representation. Both the parsed value and the oracle
    // value must be refused by dumps().
    for (const ktavFile of walkKtavFiles(`${base}/parseable-unrepresentable`)) {
        const name = ktavFile.slice(`${base}/parseable-unrepresentable/`.length).replace(/\\/g, "/");
        const oracle = parseOracle(readTextFile(ktavFile.replace(/\.ktav$/, ".json")));
        test(`parseable-unrepresentable parse: ${name}`, () => {
            const parsed = loads(readTextFile(ktavFile));
            assertEqual(normalise(parsed), normalise(oracle.value));
        });
        test(`parseable-unrepresentable refuse: ${name}`, () => {
            const parsed = loads(readTextFile(ktavFile));
            assertThrows(() => dumps(parsed), "dumps() accepted a parseable-unrepresentable value (parsed)");
            let message = null;
            try { dumps(oracle.value); } catch (e) { message = String(e.message || e); }
            if (message === null) throw new Error("dumps() accepted a parseable-unrepresentable value (oracle)");
            if (!message.includes(oracle.unrepresentable_reason)) {
                throw new Error(`expected reason "${oracle.unrepresentable_reason}" in message: ${message}`);
            }
        });
    }

    // spec 0.8 § 8.1: strict-lossy/ — loads() accepts and yields lax_value;
    // loadsStrict() refuses with LossyScalar naming the exact body/canonical.
    const strictLossy = walkKtavFiles(`${base}/strict-lossy`);
    test("strict-lossy: category is populated", () => {
        if (strictLossy.length === 0) throw new Error("no strict-lossy fixtures found");
    });
    for (const ktavFile of strictLossy) {
        const name = ktavFile.slice(`${base}/strict-lossy/`.length).replace(/\\/g, "/");
        test(`strict-lossy: ${name}`, () => {
            const src = readTextFile(ktavFile);
            const oracle = JSON.parse(readTextFile(ktavFile.replace(/\.ktav$/, ".json")));
            assertEqual(normalise(loads(src)), normalise(oracle.lax_value));
            let err = null;
            try { loadsStrict(src); } catch (e) { err = e; }
            if (err === null) throw new Error("loadsStrict() accepted a lossy scalar");
            for (const [field, want] of [["error", oracle.expected_error], ["body", oracle.body], ["canonical", oracle.canonical]]) {
                if (err[field] !== want) {
                    throw new Error(`loadsStrict error.${field} = ${JSON.stringify(err[field])}, want ${JSON.stringify(want)}`);
                }
            }
        });
    }

    return { passed, failed, total: passed + failed };
}
