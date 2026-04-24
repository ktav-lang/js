// Spec conformance tests — per AGENTS.md §9, every implementation runs
// the fixtures from the `spec/` submodule directly. Resolver order:
//   1. $KTAV_SPEC_DIR           (CI escape hatch)
//   2. <repo>/spec               (initialized git submodule)
//   3. <repo>/../spec            (sibling checkout for local dev)
// If none resolve, the whole suite is skipped — a fresh `git clone`
// without `--recurse-submodules` must not turn this test red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import JSONBig from "json-bigint";

import { loads, dumps } from "../dist/ts/node.js";

// Oracle files use native JSON numbers — `Integer`/`Float` are
// distinguished only by the presence of a decimal point. Native
// `JSON.parse` rounds integers beyond `Number.MAX_SAFE_INTEGER`,
// so the `99999999999999999999` oracle from `integer_large.ktav`
// would silently become `100000000000000000000`. `json-bigint` with
// `useNativeBigInt` preserves precision as real `bigint`, which
// matches what `loads()` returns for out-of-range `:i`.
const jsonBig = JSONBig({ useNativeBigInt: true });

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

function resolveSpecDir() {
    const env = process.env.KTAV_SPEC_DIR;
    if (env && existsSync(join(env, "versions"))) return env;
    const submodule = join(repo, "spec");
    if (existsSync(join(submodule, "versions"))) return submodule;
    const sibling = resolve(repo, "..", "spec");
    if (existsSync(join(sibling, "versions"))) return sibling;
    return null;
}

const specDir = resolveSpecDir();
const base = specDir && join(specDir, "versions", "0.1", "tests");

if (!specDir) {
    test("spec conformance (skipped — no spec/ available)", { skip: true }, () => {});
}

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else out.push(full);
    }
    return out;
}

// `:i` → native JSON integer; `:f` → native JSON float (has `.`).
// The JSON oracle files already reflect this — loads() produces
// `number`/`bigint` on the Ktav side, so we normalise both sides for
// structural compare: bigints → decimal strings (oracle JSON.parse
// cannot produce bigint).
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

if (specDir) {
    const validDir = join(base, "valid");
    const invalidDir = join(base, "invalid");

    for (const ktavFile of walk(validDir).filter(p => p.endsWith(".ktav"))) {
        const name = relative(validDir, ktavFile).replace(/\\/g, "/");
        const jsonFile = ktavFile.replace(/\.ktav$/, ".json");
        test(`valid: ${name}`, () => {
            const ktavSrc = readFileSync(ktavFile, "utf8");
            const oracle = jsonBig.parse(readFileSync(jsonFile, "utf8"));
            const parsed = loads(ktavSrc);
            // normalise() on both sides: strips bigints → decimal strings
            // and (crucially) reparents every object to Object.prototype.
            // json-bigint emits null-proto objects; wasm-bindgen emits
            // Object.prototype objects — deepStrictEqual checks prototypes.
            assert.deepEqual(normalise(parsed), normalise(oracle));
        });
        test(`roundtrip: ${name}`, () => {
            const ktavSrc = readFileSync(ktavFile, "utf8");
            const once = loads(ktavSrc);
            // Top-level must be an object for dumps() — skip non-object fixtures.
            if (!once || typeof once !== "object" || Array.isArray(once)) return;
            const rendered = dumps(once);
            const twice = loads(rendered);
            assert.deepEqual(normalise(twice), normalise(once));
        });
    }

    for (const ktavFile of walk(invalidDir).filter(p => p.endsWith(".ktav"))) {
        const name = relative(invalidDir, ktavFile).replace(/\\/g, "/");
        test(`invalid: ${name}`, () => {
            // Matches the minimum enforced in rust/python: the fixture
            // must be rejected. Category-level assertion would require
            // `ktav::ParseError` to expose its `kind` as structured data
            // across the FFI — currently only the `Display` form reaches
            // JS, so we settle for "throws" same as the sibling bindings.
            const ktavSrc = readFileSync(ktavFile, "utf8");
            assert.throws(() => loads(ktavSrc));
        });
    }
}
