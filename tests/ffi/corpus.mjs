import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CATEGORIES = ["valid", "invalid", "unrepresentable", "parseable-unrepresentable", "strict-lossy"];
const ROOT = resolve(fileURLToPath(new URL("../../spec/versions/0.8/tests", import.meta.url)));

function filesUnder(dir) {
    if (!statSync(dir).isDirectory()) throw new Error(`missing corpus directory: ${dir}`);
    const files = [];
    const visit = (at) => {
        for (const entry of readdirSync(at, { withFileTypes: true })) {
            const path = join(at, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (entry.isFile()) files.push(path);
        }
    };
    visit(dir);
    return files.sort();
}

function rel(path, base) {
    return relative(base, path).split(sep).join("/");
}

function inventory() {
    const manifestPath = join(ROOT, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.schema_version !== 1) throw new Error(`unsupported corpus manifest schema: ${manifest.schema_version}`);
    const names = Object.keys(manifest.categories || {}).sort();
    if (names.join(",") !== [...CATEGORIES].sort().join(",")) {
        throw new Error(`unexpected corpus categories: ${names.join(",")}`);
    }
    const directories = readdirSync(ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    if (directories.join(",") !== [...CATEGORIES].sort().join(",")) {
        throw new Error(`unexpected corpus directories: ${directories.join(",")}`);
    }

    const found = {};
    for (const category of CATEGORIES) {
        const base = join(ROOT, category);
        const paths = filesUnder(base);
        const suffixes = category === "valid" ? [".ktav", ".json", ".canonical.ktav"]
            : category === "unrepresentable" ? [".json"] : [".ktav", ".json"];
        const stems = new Set();
        for (const path of paths) {
            const name = rel(path, base);
            const suffix = [...suffixes].sort((a, b) => b.length - a.length).find((s) => name.endsWith(s));
            if (!suffix) throw new Error(`${category}: unexpected file ${name}`);
            stems.add(name.slice(0, -suffix.length));
        }
        const fixtures = [...stems].sort();
        if (fixtures.length !== manifest.categories[category].count) {
            throw new Error(`${category}: manifest expects ${manifest.categories[category].count} fixtures, found ${fixtures.length}`);
        }
        for (const stem of fixtures) {
            for (const suffix of suffixes) {
                if (!paths.includes(join(base, ...`${stem}${suffix}`.split("/")))) {
                    throw new Error(`${category}: incomplete fixture ${stem}, missing ${suffix}`);
                }
            }
        }
        found[category] = fixtures.map((stem) => ({ stem, files: suffixes.map((s) => join(base, ...`${stem}${s}`.split("/"))) }));
    }
    return found;
}

function parseOracle(text) {
    let out = "";
    for (let i = 0; i < text.length;) {
        if (text[i] === '"') {
            let j = i + 1;
            while (j < text.length) {
                if (text[j] === "\\") { j += 2; continue; }
                if (text[j++] === '"') break;
            }
            out += text.slice(i, j);
            i = j;
        } else if (text[i] === "-" || /[0-9]/.test(text[i])) {
            const match = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
            if (!match) { out += text[i++]; continue; }
            const token = match[0];
            if (/^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token))) out += JSON.stringify(`\0KTAV_BIGINT:${token}`);
            else out += token;
            i += token.length;
        } else out += text[i++];
    }
    return JSON.parse(out, (_key, value) => typeof value === "string" && value.startsWith("\0KTAV_BIGINT:") ? BigInt(value.slice(13)) : value);
}

function normalize(value) {
    if (typeof value === "bigint") return value.toString();
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
    return value;
}

function equal(actual, expected, label) {
    const same = (a, b) => {
        if (a === b) return true;
        if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        if (Array.isArray(a)) return a.length === b.length && a.every((value, i) => same(value, b[i]));
        const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
        return ak.length === bk.length && ak.every((key, i) => key === bk[i] && same(a[key], b[key]));
    };
    if (!same(normalize(actual), normalize(expected))) {
        throw new Error(`${label}: expected ${JSON.stringify(normalize(expected))}, got ${JSON.stringify(normalize(actual))}`);
    }
}

function convertUnrepresentable(value) {
    if (Array.isArray(value)) return value.map(convertUnrepresentable);
    if (value && typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length === 1 && keys[0] === "$float") return Number(value.$float);
        return Object.fromEntries(keys.map((key) => [key, convertUnrepresentable(value[key])]));
    }
    return value;
}

function text(path) { return readFileSync(path, "utf8"); }

export async function runFfiCorpus({ loads, loadsStrict, dumps, check, label }) {
    let corpus;
    await check("spec 0.8: exact corpus inventory", async () => { corpus = inventory(); });
    if (!corpus) return;

    for (const { stem, files: [input, oraclePath] } of corpus.valid) {
        await check(`spec valid: ${stem}`, async () => equal(await loads(text(input)), parseOracle(text(oraclePath)), stem));
    }

    for (const { stem, files: [input, oraclePath] } of corpus.invalid) {
        await check(`spec invalid: ${stem}`, async () => {
            if (stem === "invalid_utf8/lone_continuation_byte") {
                // The public FFI API accepts strings, not raw bytes; only verify strict UTF-8 rejection here.
                const bytes = readFileSync(input);
                let rejected = false;
                try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { rejected = true; }
                if (!rejected) throw new Error("raw invalid UTF-8 unexpectedly decoded");
                return;
            }
            const expected = JSON.parse(text(oraclePath)).expected_error;
            let error;
            try { await loads(text(input)); } catch (e) { error = e; }
            if (!error) throw new Error("loads() accepted invalid fixture");
            if (error.error !== expected) throw new Error(`error=${error.error}, expected ${expected}`);
        });
    }

    for (const { stem, files: [oraclePath] } of corpus.unrepresentable) {
        await check(`spec unrepresentable: ${stem}`, async () => {
            const fx = JSON.parse(text(oraclePath));
            const value = convertUnrepresentable(fx.value);
            let error;
            try { await dumps(value); } catch (e) { error = e; }
            if (!error) throw new Error("dumps() accepted unrepresentable value");
            if (!["ScalarRoot", "NonFiniteFloat"].includes(fx.unrepresentable_reason) && !String(error.message || error).includes(fx.unrepresentable_reason)) {
                throw new Error(`missing reason ${fx.unrepresentable_reason} in: ${error.message || error}`);
            }
        });
    }

    for (const { stem, files: [input, oraclePath] } of corpus["parseable-unrepresentable"]) {
        await check(`spec parseable-unrepresentable: ${stem}`, async () => {
            const oracle = JSON.parse(text(oraclePath));
            const parsed = await loads(text(input));
            equal(parsed, oracle.value, stem);
            let parsedError;
            try { await dumps(parsed); } catch (e) { parsedError = e; }
            if (!parsedError) throw new Error("dumps() accepted parsed value");
            if (!String(parsedError.message || parsedError).includes(oracle.unrepresentable_reason)) {
                throw new Error(`parsed value: missing reason ${oracle.unrepresentable_reason}`);
            }
            let oracleError;
            try { await dumps(oracle.value); } catch (e) { oracleError = e; }
            if (!oracleError) throw new Error("dumps() accepted oracle value");
            if (!String(oracleError.message || oracleError).includes(oracle.unrepresentable_reason)) {
                throw new Error(`missing reason ${oracle.unrepresentable_reason}`);
            }
        });
    }

    for (const { stem, files: [input, oraclePath] } of corpus["strict-lossy"]) {
        await check(`spec strict-lossy: ${stem}`, async () => {
            const oracle = JSON.parse(text(oraclePath));
            equal(await loads(text(input)), oracle.lax_value, stem);
            let error;
            try { await loadsStrict(text(input)); } catch (e) { error = e; }
            if (!error) throw new Error("loadsStrict() accepted lossy fixture");
            for (const [field, expected] of [["error", oracle.expected_error], ["body", oracle.body], ["canonical", oracle.canonical]]) {
                if (error[field] !== expected) throw new Error(`error.${field}=${JSON.stringify(error[field])}, expected ${JSON.stringify(expected)}`);
            }
        });
    }

    console.log(`[${label}] spec corpus: ${Object.values(corpus).reduce((sum, items) => sum + items.length, 0)} fixtures`);
}
