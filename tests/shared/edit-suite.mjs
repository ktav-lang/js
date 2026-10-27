// Source-edit regression suite: the meaning of ALL 22 layout
// regressions from rust tests/suite/api/text/edit_value/layout.rs plus
// the path/error contract from edit_value.rs, exercised through an
// adapter so the SAME assertions run against pure / napi / wasm /
// bun-ffi / deno-ffi.
//
// AWAIT-COMPATIBLE: the FFI adapters (Bun `bun:ffi`, Deno
// `Deno.dlopen`) expose ASYNC functions while pure/napi/wasm are
// synchronous — every edit/loads call in this file is therefore
// awaited, so an unresolved Promise is never compared against a
// string and a rejected Promise is never mistaken for success. No FFI
// case is skipped and the comparator keeps the STRICT type semantics
// (BigInt !== number !== string — type differences are not masked).
//
// Every `check()` case runs BOTH entry points (textual path and
// decoded segments) and additionally asserts the result re-parses to
// the expected tree — the Rust suite's `check` helper verbatim.

function textualPath(segments) {
    return segments
        .map((s) => s.replace(/\\/g, "\\\\").replace(/\./g, "\\."))
        .join(".");
}

/**
 * @param {object} ops
 * @param {(source: string, path: string, replacement: unknown) => string | Promise<string>} ops.editValue
 * @param {(source: string, segments: string[], replacement: unknown) => string | Promise<string>} ops.editValueSegments
 * @param {(s: string) => unknown | Promise<unknown>} ops.loads
 * @param {string} [ops.label] — summary prefix (e.g. "edit-pure")
 * @param {(name: string, fn: () => void | Promise<void>) => Promise<void>} ops.check
 * @param {string} [labelArg] — legacy second-argument spelling of
 *   ops.label; either form works.
 */
export async function runEditSuite(ops, labelArg) {
    const { editValue, editValueSegments, loads, check } = ops;
    const mutationApis = ["insertValue", "insertValueSegments", "removeValue", "removeValueSegments", "renameKey", "renameKeySegments"];
    for (const name of mutationApis) {
        if (typeof ops[name] !== "function") throw new Error(`${labelArg ?? ops.label ?? "edit"}: mandatory mutation API ${name} is unavailable`);
    }
    const { insertValue, insertValueSegments, removeValue, removeValueSegments, renameKey, renameKeySegments } = ops;
    const label = labelArg ?? ops.label ?? "edit";

    const s = (v) => v;
    const value = (v) => v; // replacements are plain JS values (host scalars keep their type)

    async function checkBoth(name, source, segments, replacement, expected) {
        await check(`${label}: ${name} [textual]`, async () => {
            const out = await editValue(source, textualPath(segments), replacement);
            if (out !== expected) throw new Error(`got ${JSON.stringify(out)}, expected ${JSON.stringify(expected)}`);
            assertSemanticallyEqual(
                await loads(out),
                await structuredSourceReplace(source, segments, replacement),
                name,
            );
        });
        await check(`${label}: ${name} [segments]`, async () => {
            const out = await editValueSegments(source, segments, replacement);
            if (out !== expected) throw new Error(`got ${JSON.stringify(out)}, expected ${JSON.stringify(expected)}`);
            assertSemanticallyEqual(
                await loads(out),
                await structuredSourceReplace(source, segments, replacement),
                name,
            );
        });
    }

    async function structuredSourceReplace(source, segments, replacement) {
        // Build the expected tree WITHOUT going through the edit: parse
        // the source, then deep-assign the replacement at the path.
        const tree = await loads(source);
        let cur = tree;
        for (let i = 0; i < segments.length - 1; i++) {
            const seg = segments[i];
            cur = Array.isArray(cur) ? cur[Number(seg)] : cur[seg];
        }
        const last = segments[segments.length - 1];
        if (Array.isArray(cur)) cur[Number(last)] = replacement;
        else cur[last] = replacement;
        return tree;
    }

    function assertSemanticallyEqual(actual, expected, name) {
        // STRICT comparator: no BigInt→String coercion — type
        // differences are real failures, not normalisation noise.
        const same = (a, b) => {
            if (a === b) return true;
            if (typeof a !== typeof b || a === null || typeof a !== "object") return false;
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
            const ak = Object.keys(a), bk = Object.keys(b);
            return ak.length === bk.length && ak.every((k) => same(a[k], b[k]));
        };
        if (!same(actual, expected)) {
            throw new Error(`${name}: semantic mismatch ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
        }
    }

    async function expectError(name, kind, source, segments, replacement, bodyPredicate, modes = ["textual", "segments"]) {
        for (const mode of modes) {
            await check(`${label}: ${name} [${mode}]`, async () => {
                let err = null;
                try {
                    if (mode === "textual") await editValue(source, textualPath(segments), replacement);
                    else await editValueSegments(source, segments, replacement);
                } catch (e) {
                    err = e;
                }
                if (!err) throw new Error(`expected ${kind}, operation succeeded`);
                if (err.error !== kind) {
                    throw new Error(`error=${err.error}, expected ${kind} (${String(err.message || err)})`);
                }
                if (bodyPredicate) bodyPredicate(err);
            });
        }
    }

    // ── 1. deep_leaf_preserves_each_source_form ─────────────────────
    for (const [i, source] of [
        "targets.storagehost.address: old\ntargets.storagehost.user: mcp-agent\n",
        "targets: {storagehost: {address: old, user: mcp-agent}}\n",
        "targets: {\n  storagehost: {\n    address: old\n    user: mcp-agent\n  }\n}\n",
    ].entries()) {
        await checkBoth(
            `deep leaf preserves source form #${i}`,
            source,
            ["targets", "storagehost", "address"],
            s("192.168.0.88:22"),
            source.replace("old", "192.168.0.88:22"),
        );
    }

    // ── 2. deep_array_leaf_preserves_mixed_forms ────────────────────
    for (const [i, source] of [
        "targets: [{storagehost: [old, keep]}, other]\n",
        "targets: [\n  {storagehost: [old, keep]}\n  other\n]\n",
        "targets: [\n  {\n    storagehost: [\n      old\n      keep\n    ]\n  }\n  other\n]\n",
    ].entries()) {
        await checkBoth(
            `deep array leaf preserves mixed forms #${i}`,
            source,
            ["targets", "0", "storagehost", "0"],
            s("new"),
            source.replace("old", "new"),
        );
    }

    // ── 3. whole_inline_containers_remain_inline ────────────────────
    for (const [i, [source, repl, expected]] of [
        ["a: {x: 1}\n", { y: 2 }, "a: {y: 2}\n"],
        ["a: [1, 2]\n", [3, 4], "a: [3, 4]\n"],
        ["a: {}\n", { y: 2 }, "a: {y: 2}\n"],
        ["a: []\n", [3, 4], "a: [3, 4]\n"],
        ["a: {}\n", [3, 4], "a: [3, 4]\n"],
    ].entries()) {
        await checkBoth(`whole inline container stays inline #${i}`, source, ["a"], value(repl), expected);
    }

    // ── 4. emptying_block_containers_does_not_collapse_them ─────────
    await checkBoth("emptying block object keeps block form", "a: {\n  x: 1\n}\n", ["a"], value({}), "a: {\n}\n");
    await checkBoth("emptying block array keeps block form", "a: [\n  1\n]\n", ["a"], value([]), "a: [\n]\n");

    // ── 5. newline_unfolds_only_inline_ancestor_chain ───────────────
    await checkBoth(
        "newline unfolds only the inline ancestor chain",
        "## top\na: [{x: old, untouched: [1, 2]}, {keep: yes}]\nz: keep\n",
        ["a", "0", "x"],
        s("one\ntwo"),
        "## top\na: [\n    {\n        x: ((\none\ntwo\n        ))\n        untouched: [1, 2]\n    }\n    {keep: yes}\n]\nz: keep\n",
    );

    // ── 6. newline_under_dotted_key_does_not_expand_dotted_ancestors ─
    await checkBoth(
        "newline under dotted key keeps dotted ancestors",
        "a.b: [old, keep]\na.c: other\n",
        ["a", "b", "0"],
        s("one\ntwo"),
        "a.b: [\n    ((\none\ntwo\n    ))\n    keep\n]\na.c: other\n",
    );

    // ── 7. dense_escapes_unfold_but_sparse_escapes_do_not ───────────
    await checkBoth("dense escapes unfold", "a: [old, keep]\n", ["a", "0"], s("a,b,c,d,e"), "a: [\n    a,b,c,d,e\n    keep\n]\n");
    await checkBoth("sparse escapes stay inline", "a: [old]\n", ["a", "0"], s("a,b,c,d"), "a: [a\\,b\\,c\\,d]\n");
    {
        const sparse = "x".repeat(30) + "a,b,c,d,e";
        await checkBoth(
            "long sparse-escape line stays inline",
            "a: [old]\n",
            ["a", "0"],
            s(sparse),
            `a: [${sparse.replace(/,/g, "\\,")}]\n`,
        );
    }

    // ── 8. width_boundary_is_in_characters_not_bytes ────────────────
    for (const [size, expanded] of [[95, false], [96, true]]) {
        const value95 = "я".repeat(size);
        await checkBoth(
            `width boundary ${size} chars`,
            "a: [old]\n",
            ["a", "0"],
            s(value95),
            expanded ? `a: [\n    ${value95}\n]\n` : `a: [${value95}]\n`,
        );
    }

    // ── 9. already_long_line_only_unfolds_when_it_grows ─────────────
    {
        const source = `a: [${"x".repeat(120)}, keep]\n`;
        await checkBoth(
            "long line unchanged size stays inline",
            source,
            ["a", "0"],
            s("y".repeat(120)),
            source.replace(/x/g, "y"),
        );
        await checkBoth(
            "long line growth unfolds",
            source,
            ["a", "0"],
            s("y".repeat(121)),
            `a: [\n    ${"y".repeat(121)}\n    keep\n]\n`,
        );
    }

    // ── 10. width_expansion_stops_when_inner_line_fits ──────────────
    {
        const v = "x".repeat(91);
        await checkBoth(
            "expansion stops when the inner line fits",
            "a: [{x: old}]\n",
            ["a", "0", "x"],
            s(v),
            `a: [\n    {x: ${v}}\n]\n`,
        );
    }

    // ── 11. escape_overhead_boundary_is_exact ───────────────────────
    for (const [n, expanded] of [[7, true], [8, false]]) {
        const v = "x".repeat(n) + "a,b,c,d,e";
        await checkBoth(
            `escape overhead boundary (prefix ${n})`,
            "a: [old]\n",
            ["a", "0"],
            s(v),
            expanded ? `a: [\n    ${v}\n]\n` : `a: [${v.replace(/,/g, "\\,")}]\n`,
        );
    }

    // ── 12. long_changed_leaf_does_not_unfold_unrelated_branches ────
    {
        const v = "x".repeat(100);
        await checkBoth(
            "long leaf does not unfold unrelated nested branches",
            "a: [old, {untouched: [1, 2]}]\n",
            ["a", "0"],
            s(v),
            `a: [\n    ${v}\n    {untouched: [1, 2]}\n]\n`,
        );
    }

    // ── 13. promoted_siblings_keep_values_when_escapes_lose_meaning ─
    await checkBoth(
        "promoted siblings keep values when inline escapes lose meaning",
        "a: [old, a\\,b, \\u00342, :: literal]\n",
        ["a", "0"],
        s("x\ny"),
        "a: [\n    ((\nx\ny\n    ))\n    a,b\n    :: 42\n    :: :: literal\n]\n",
    );

    // ── 14. promoted_pairs_keep_key_spelling_and_raw_markers ────────
    await checkBoth(
        "promoted pairs keep key spelling and raw markers",
        "a: {\"x.y\": old, nested.key::  42, n: 0007}\n",
        ["a", "x.y"],
        s("x\ny"),
        "a: {\n    \"x.y\": ((\nx\ny\n    ))\n    nested.key::  42\n    n: 0007\n}\n",
    );

    // ── 15. root_inline_promotion_preserves_bom_and_eof ─────────────
    await checkBoth(
        "root inline promotion preserves BOM and missing final EOL",
        "\uFEFF[old, keep]",
        ["0"],
        s("x\ny"),
        "\uFEFF[\n    ((\nx\ny\n    ))\n    keep\n]",
    );

    // ── 16. promotion_preserves_eol_comments_and_no_final_terminator ─
    for (const eol of ["\n", "\r", "\r\n"]) {
        const source = `## header${eol}a: [old, keep]`;
        await checkBoth(
            `promotion preserves EOL ${JSON.stringify(eol)}, comments, no final terminator`,
            source,
            ["a", "0"],
            s("x\ny"),
            `## header${eol}a: [${eol}    ((${eol}x${eol}y${eol}    ))${eol}    keep${eol}]`,
        );
    }

    // ── 17. comments_outside_promoted_inline_value_remain_byte_exact ─
    await checkBoth(
        "comments outside promoted inline value stay byte-exact",
        "list: [\n  ## before\n  {x: old}\n  ## after\n]\n",
        ["list", "0", "x"],
        s("x\ny"),
        "list: [\n  ## before\n  {\n      x: ((\nx\ny\n      ))\n  }\n  ## after\n]\n",
    );

    // ── 18. noop_ignores_all_readability_thresholds ─────────────────
    {
        const source = `a: [${"x".repeat(140)}, a\\,b\\,c\\,d\\,e]\n`;
        await checkBoth("no-op ignores width threshold", source, ["a", "0"], s("x".repeat(140)), source);
        await checkBoth("no-op ignores escape threshold", source, ["a", "1"], s("a,b,c,d,e"), source);
    }

    // ── 19. type_change_does_not_force_unrelated_layout_changes ─────
    await checkBoth(
        "type change keeps unrelated layout",
        "a: {x: [1], keep: [2]}\n",
        ["a", "x"],
        value(true),
        "a: {x: true, keep: [2]}\n",
    );
    await checkBoth("string under raw-forcing marker", "a: [1]\n", ["a"], s("42"), "a:: 42\n");

    // ── 20. reopened_inline_parent_promotes_only_its_definition ─────
    await checkBoth(
        "reopened inline parent promotes only its physical definition",
        "a: {x: old}\n## gap\na.y: keep\n",
        ["a", "x"],
        s("x\ny"),
        "a: {\n    x: ((\nx\ny\n    ))\n}\n## gap\na.y: keep\n",
    );

    // ── 21. impossible_block_encoding_keeps_valid_inline_form ───────
    for (const v of ["a\rb", "a\n))\nb"]) {
        const encoded = v.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
        await checkBoth(
            `impossible block encoding keeps inline form (${JSON.stringify(v)})`,
            "a: [old]\n",
            ["a", "0"],
            s(v),
            `a: [${encoded}]\n`,
        );
    }
    await checkBoth(
        "sibling CR string stays inline while target expands",
        "a: [old, a\\rb]\n",
        ["a", "0"],
        s("x\ny"),
        "a: [x\\ny, a\\rb]\n",
    );

    // ── 22. unsafe_comment_loss_still_fails_closed ──────────────────
    for (const source of ["a: {\n ## keep\n x: 1\n}\n", "a: [\n ## keep\n 1\n]\n"]) {
        await expectError(
            "comment loss fails closed",
            "EditUnsupported",
            source,
            ["a"],
            null,
        );
    }

    // ── error contract: paths ───────────────────────────────────────
    await check(`${label}: InvalidPath carries the byte offset (bad escape)`, async () => {
        let err = null;
        try { await editValue("a: 1\n", "a\\q", 1); } catch (e) { err = e; }
        if (!err || err.error !== "EditInvalidPath") throw new Error(`error=${err && err.error}`);
        if (err.body !== "1") throw new Error(`body=${JSON.stringify(err.body)}, expected "1" (UTF-8 byte offset)`);
        if (err.line !== null || err.span !== null || err.path !== null) {
            throw new Error("location fields must stay null for edit errors");
        }
    });
    await check(`${label}: InvalidPath for trailing dot / empty path / empty segment`, async () => {
        for (const p of ["", "a.", ".a", "a..b"]) {
            let err = null;
            try { await editValue("a: 1\nb: 2\n", p, 1); } catch (e) { err = e; }
            if (!err || err.error !== "EditInvalidPath") throw new Error(`path ${JSON.stringify(p)}: error=${err && err.error}`);
        }
    });
    await check(`${label}: escaped separator targets the QUOTED key (\\. = literal dot)`, async () => {
        // An UNQUOTED dotted key means a nested object — the literal
        // `a.b` key exists only in its quoted spelling, and the textual
        // path decodes `a\.b` to exactly that decoded literal name.
        const source = '"a.b": 1\n';
        const textualOut = await editValue(source, "a\\.b", 2);
        if (textualOut !== '"a.b": 2\n') throw new Error(`textual: got ${JSON.stringify(textualOut)}`);
        // Segments are ALREADY-DECODED literal names — ["a.b"] matches
        // the same quoted key with no extra unescaping.
        const segmentsOut = await editValueSegments(source, ["a.b"], 2);
        if (segmentsOut !== '"a.b": 2\n') throw new Error(`segments: got ${JSON.stringify(segmentsOut)}`);
    });
    await check(`${label}: escaped-key path addresses escaped source spelling`, async () => {
        const source = "a\\\\.b: 1\nc: 2\n";
        const out = await editValue(source, "a\\\\.b", 2);
        if (out !== "a\\\\.b: 2\nc: 2\n") throw new Error(JSON.stringify(out));
    });
    await check(`${label}: segments stay literal against a nested dotted key`, async () => {
        // a.b: 1 is a NESTED object; segments ["a", "b"] address the
        // inner value — decoded segment names, never a joined dotted key.
        const out = await editValueSegments("a.b: 1\n", ["a", "b"], 2);
        if (out !== "a.b: 2\n") throw new Error(`got ${JSON.stringify(out)}`);
        let err = null;
        try { await editValueSegments("a.b: 1\n", ["a.b"], 2); } catch (e) { err = e; }
        if (!err || err.error !== "EditNotFound") {
            throw new Error(`joined segment must not exist: ${err && err.error}`);
        }
    });

    // ── error contract: NotFound family ─────────────────────────────
    await expectError("missing key", "EditNotFound", "a: 1\n", ["b"], 2);
    await expectError("index overflow", "EditNotFound", "a: [1]\n", ["a", "5"], 2);
    await expectError("non-numeric index", "EditNotFound", "a: [1]\n", ["a", "x"], 2);
    await expectError("signed index", "EditNotFound", "a: [1]\n", ["a", "-1"], 2);
    await expectError("scalar descent", "EditNotFound", "a: 1\n", ["a", "b"], 2);
    await expectError("empty segments list", "EditNotFound", "a: 1\n", [], 2, null, ["segments"]);

    // ── error contract: Unsupported ─────────────────────────────────
    await expectError(
        "noncontiguous dotted/reopen whole target",
        "EditUnsupported",
        "a: {}\na.b: 1\n",
        ["a"],
        value({ x: 1 }),
    );
    await expectError(
        "multiline string with a '))' line has no verbatim form",
        "EditUnsupported",
        "a: 1\n",
        ["a"],
        s("x\n))\ny"),
    );
    await check(`${label}: leaf edit inside comment-bearing container still works`, async () => {
        const out = await editValue("a: {\n ## keep\n x: 1\n}\n", "a.x", 2);
        if (out !== "a: {\n ## keep\n x: 2\n}\n") throw new Error(`got ${JSON.stringify(out)}`);
    });

    // ── preservation invariants ─────────────────────────────────────
    await check(`${label}: no-op is byte-identical even for noncanonical spelling`, async () => {
        // +1 is a REAL Integer literal (canonical value 1) in a
        // noncanonical spelling — equal Integer replacement, so the
        // splice must be a byte-identical no-op. (A redundant-leading-
        // zero form like 0007 is a STRING, not a numeric spelling — it
        // must NOT be used as a numeric no-op oracle.)
        const source = "a  :  +1\n";
        if ((await editValue(source, "a", 1)) !== source) throw new Error("no-op changed the source");
        if ((await editValueSegments(source, ["a"], 1)) !== source) throw new Error("no-op changed the source");
    });
    await check(`${label}: CRLF outside the edit is preserved`, async () => {
        const out = await editValue("a: 1\r\nb: 2\r\n", "a", 3);
        if (out !== "a: 3\r\nb: 2\r\n") throw new Error(`got ${JSON.stringify(out)}`);
    });
    await check(`${label}: source string is not mutated`, async () => {
        const source = "a: 1\n";
        await editValue(source, "a", 2);
        if (source !== "a: 1\n") throw new Error("source mutated");
    });
    await checkBoth(
        "exact-precision integer above 2^53 stays exact (inside i64)",
        "a: 1\n",
        ["a"],
        9007199254740993n,
        "a: 9007199254740993\n",
    );
    await expectError(
        "arbitrary bigint outside the i64 source domain",
        "EditUnsupported",
        "a: 1\n",
        ["a"],
        123456789012345678901234567890n,
        null,
        ["textual", "segments"],
    );

    // ── error contract: source-first precedence (native/CABI parity) ─
    await check(`${label}: broken source + bad path -> parser envelope wins`, async () => {
        let err = null;
        try { await editValue("a: [", "a\\q", 1); } catch (e) { err = e; }
        if (!err) throw new Error("expected an error");
        if (String(err.error).startsWith("Edit")) {
            throw new Error(`Edit* error ${err.error} leaked before source parse`);
        }
        // Verify parser precedence by asserting its exact Rust error code.
        if (err.error !== "UnclosedCompound") {
            throw new Error(`error=${err.error}, expected parser's UnclosedCompound`);
        }
    });
    await check(`${label}: broken source + empty segments -> parser envelope wins`, async () => {
        let err = null;
        try { await editValueSegments("a: [", [], 1); } catch (e) { err = e; }
        if (!err) throw new Error("expected an error");
        if (String(err.error).startsWith("Edit")) {
            throw new Error(`Edit* error ${err.error} leaked before source parse`);
        }
        if (err.error !== "UnclosedCompound") {
            throw new Error(`error=${err.error}, expected the parser's UnclosedCompound`);
        }
    });
    await check(`${label}: broken source + valid edit -> parser envelope wins`, async () => {
        let err = null;
        try { await editValue("a: [", "a", 2); } catch (e) { err = e; }
        if (!err) throw new Error("expected an error");
        if (String(err.error).startsWith("Edit")) {
            throw new Error(`Edit* error ${err.error} leaked before source parse`);
        }
    });

    for (const name of mutationApis) {
        if (typeof ops[name] !== "function") throw new Error(`${label}: mutation API ${name} is unavailable`);
    }
    await check(`${label}: insert object inside array exact and semantic`, async () => {
        const source = "a: [{x: 1}, {z: 3}]\n";
        const expected = "a: [{x: 1, y: 2}, {z: 3}]\n";
        for (const out of [await insertValue(source, "a.0.y", 2), await insertValueSegments(source, ["a", "0", "y"], 2)]) {
            if (out !== expected) throw new Error(`bytes: ${JSON.stringify(out)}`);
            assertSemanticallyEqual(await loads(out), { a: [{ x: 1, y: 2 }, { z: 3 }] }, "array object insertion");
        }
    });
    await check(`${label}: comments survive insert/remove braces`, async () => {
        const source = "## lead {\n{x: 1}\n## tail }\n";
        const inserted = await insertValue(source, "y", 2);
        const expectedInserted = "## lead {\n{x: 1, y: 2}\n## tail }\n";
        if (inserted !== expectedInserted) throw new Error(`insert: ${JSON.stringify(inserted)}`);
        assertSemanticallyEqual(await loads(inserted), { x: 1, y: 2 }, "commented root insert");
        const removed = await removeValue(source, "x");
        const expectedRemoved = "## lead {\n{}\n## tail }\n";
        if (removed !== expectedRemoved) throw new Error(`remove: ${JSON.stringify(removed)}`);
        assertSemanticallyEqual(await loads(removed), {}, "commented root remove");
    });
    await check(`${label}: rename key preserves sibling order`, async () => {
        const source = "a: {first: 1, old: 2, last: 3}\n";
        const out = await renameKey(source, "a.old", "new");
        if (out !== "a: {first: 1, new: 2, last: 3}\n") throw new Error(`bytes: ${JSON.stringify(out)}`);
        const loaded = await loads(out);
        assertSemanticallyEqual(loaded, { a: { first: 1, new: 2, last: 3 } }, "renamed sibling order");
        const keys = Object.keys(loaded.a);
        if (JSON.stringify(keys) !== JSON.stringify(["first", "new", "last"])) throw new Error(`key order: ${JSON.stringify(keys)}`);
    });
    await check(`${label}: no-op rename preserves BOM CRLF and semantic order`, async () => {
        const source = "\uFEFFa: {first: 1, old: 2, last: 3}\r\n";
        const out = await renameKey(source, "a.old", "old");
        if (out !== source) throw new Error(`bytes: ${JSON.stringify(out)}`);
        const loaded = await loads(out);
        assertSemanticallyEqual(loaded, { a: { first: 1, old: 2, last: 3 } }, "no-op rename value");
        const keys = Object.keys(loaded.a);
        if (JSON.stringify(keys) !== JSON.stringify(["first", "old", "last"])) throw new Error(`key order: ${JSON.stringify(keys)}`);
    });

    await check(`${label}: invalid UTF-8 path reports insert error`, async () => {
        let err; try { await insertValue("é: 1\n", "é\\q", 2); } catch (e) { err = e; }
        if (!err || err.error !== "EditInvalidPath" || err.body !== "2") throw new Error(`error=${err?.error}, body=${JSON.stringify(err?.body)}`);
    });
    await check(`${label}: insert bigint uses wire contract and rejects >i64`, async () => {
        const out = await insertValue("a: {}\n", "a.big", 9007199254740993n);
        if (out !== "a: {big: 9007199254740993}\n") throw new Error(`bigint bytes: ${JSON.stringify(out)}`);
        assertSemanticallyEqual(await loads(out), { a: { big: 9007199254740993n } }, "insert bigint semantic value");
        let err; try { await insertValue("a: {}\n", "a.big", 9223372036854775808n); } catch (e) { err = e; }
        if (!err || err.error !== "EditUnsupported") throw new Error(`textual: ${err?.error}`);
        err = undefined;
        try { await insertValueSegments("a: {}\n", ["a", "big"], 9223372036854775808n); } catch (e) { err = e; }
        if (!err || err.error !== "EditUnsupported") throw new Error(`segments: ${err?.error}`);
    });
    await check(`${label}: cyclic replacement loses to invalid source in both paths`, async () => {
        const cyclic = {}; cyclic.self = cyclic;
        for (const mode of ["textual", "segments"]) {
            let err; try { if (mode === "textual") await insertValue("a: [", "a\\q", cyclic); else await insertValueSegments("a: [", [], cyclic); } catch (e) { err = e; }
            if (!err || err.error !== "UnclosedCompound") throw new Error(`${mode}: ${err?.error}`);
        }
    });

    await check(`${label}: mixed EOL block insertion follows Rust and preserves surrounding bytes`, async () => {
        const source = "first: yes\na: {\r\n    x: 1\r\n}\r\ntail: keep\n";
        const expected = "first: yes\na: {\r\n    x: 1\r\n    y: ((\r\np\r\nq\r\n    ))\r\n}\r\ntail: keep\n";
        for (const out of [
            await insertValue(source, "a.y", "p\nq"),
            await insertValueSegments(source, ["a", "y"], "p\nq"),
        ]) {
            if (out !== expected) throw new Error(`bytes: ${JSON.stringify(out)} != ${JSON.stringify(expected)}`);
            assertSemanticallyEqual(await loads(out), { first: "yes", a: { x: 1, y: "p\nq" }, tail: "keep" }, "mixed EOL block insertion");
        }
    });
    await check(`${label}: mixed EOL implicit root EOF insertion follows Rust`, async () => {
        const source = "first: yes\na: 1\r\n";
        const expected = "first: yes\na: 1\r\nb: ((\r\np\r\nq\r\n))\r\n";
        for (const out of [
            await insertValue(source, "b", "p\nq"),
            await insertValueSegments(source, ["b"], "p\nq"),
        ]) {
            if (out !== expected) throw new Error(`bytes: ${JSON.stringify(out)} != ${JSON.stringify(expected)}`);
            assertSemanticallyEqual(await loads(out), { first: "yes", a: 1, b: "p\nq" }, "mixed EOL root EOF insertion");
        }
    });

    await check(`${label}: mutation layout regressions exact and independent semantic values`, async () => {
        const cases = [
            {
                name: "long inline growth unfolds",
                source: `a: {x: ${"x".repeat(120)}, keep: 2}\nb: 3\n`,
                path: "a.y", segments: ["a", "y"], replacement: "z".repeat(20),
                expected: `a: {\n    x: ${"x".repeat(120)}\n    keep: 2\n    y: ${"z".repeat(20)}\n}\nb: 3\n`,
                semantic: { a: { x: "x".repeat(120), keep: 2, y: "z".repeat(20) }, b: 3 },
            },
            {
                name: "escape density boundary unfolds only when dense",
                source: "a: {keep: value}\n",
                path: "a.new", segments: ["a", "new"], replacement: "a,b,c,d,e",
                expected: "a: {\n    keep: value\n    new: a,b,c,d,e\n}\n",
                semantic: { a: { keep: "value", new: "a,b,c,d,e" } },
            },
            {
                name: "sparse escape density stays inline",
                source: "a: {keep: value}\n",
                path: "a.new", segments: ["a", "new"], replacement: "a,b,c,d",
                expected: "a: {keep: value, new: a\\,b\\,c\\,d}\n",
                semantic: { a: { keep: "value", new: "a,b,c,d" } },
            },
            {
                name: "multiline insertion expands minimal inline chain and preserves siblings",
                source: "o: {i: {x: 1, n: {deep: [2, 3]}}, sibling: {nested: [4, 5]}}\n",
                path: "o.i.k", segments: ["o", "i", "k"], replacement: "p\nq",
                expected: "o: {\n    i: {\n        x: 1\n        n: {deep: [2, 3]}\n        k: ((\np\nq\n        ))\n    }\n    sibling: {nested: [4, 5]}\n}\n",
                semantic: { o: { i: { x: 1, n: { deep: [2, 3] }, k: "p\nq" }, sibling: { nested: [4, 5] } } },
            },
            {
                name: "empty inline whitespace is preserved",
                source: "a: {   \u00a0\u2003}\n",
                path: "a.x", segments: ["a", "x"], replacement: 1,
                expected: "a: {x: 1}\n",
                semantic: { a: { x: 1 } },
            },
            {
                name: "Unicode before trailing comma and after it is preserved",
                source: "a: {x: \u00e9\u2003,\u00a0}\n",
                path: "a.y", segments: ["a", "y"], replacement: 2,
                expected: "a: {x: \u00e9\u2003, y: 2,\u00a0}\n",
                semantic: { a: { x: "\u00e9", y: 2 } },
            },
            {
                name: "CR insertion stays inline with raw marker",
                source: "a: {x: 1}\n",
                path: "a.k", segments: ["a", "k"], replacement: "a\rb",
                expected: "a: {x: 1, k: a\\rb}\n",
                semantic: { a: { x: 1, k: "a\rb" } },
            },
            {
                name: "closing marker fallback stays inline",
                source: "a: {x: 1}\n",
                path: "a.k", segments: ["a", "k"], replacement: "a\n))\nb",
                expected: "a: {x: 1, k: a\\n))\\nb}\n",
                semantic: { a: { x: 1, k: "a\n))\nb" } },
            },
            {
                name: "Unicode whitespace and trailing comma preserve offsets",
                source: "\uFEFF\u00A0\n## { untouched }\n{x: p\\,q,}\u2003\r\n",
                path: "y", segments: ["y"], replacement: 2,
                expected: "\uFEFF\u00A0\n## { untouched }\n{x: p\\,q, y: 2,}\u2003\r\n",
                semantic: { x: "p,q", y: 2 },
            },
        ];
        for (const c of cases) {
            for (const out of [
                await insertValue(c.source, c.path, c.replacement),
                await insertValueSegments(c.source, c.segments, c.replacement),
            ]) {
                if (out !== c.expected) throw new Error(`${c.name}: bytes ${JSON.stringify(out)} != ${JSON.stringify(c.expected)}`);
                assertSemanticallyEqual(await loads(out), c.semantic, c.name);
            }
        }
    });

    await check(`${label}: mutation empty-source/BOM/EOF/EOL exact and semantic`, async () => {
        const cases = [
            ["empty source", "", "b: v", { b: "v" }],
            ["BOM-only source", "\uFEFF", "\uFEFF\nb: v", { b: "v" }],
            ["no final EOL", "a: 1", "a: 1\nb: v", { a: 1, b: "v" }],
            ["CRLF", "a: 1\r\n", "a: 1\r\nb: v\r\n", { a: 1, b: "v" }],
        ];
        for (const [name, source, expected, semantic] of cases) {
            const out = await insertValue(source, "b", "v");
            if (out !== expected) throw new Error(`${name}: bytes ${JSON.stringify(out)} != ${JSON.stringify(expected)}`);
            assertSemanticallyEqual(await loads(out), semantic, name);
        }
    });

    await check(`${label}: insert/remove/rename preserve independently expected semantics`, async () => {
        const inserted = await insertValue("a: {x: 1}\n", "a.y", 2);
        if (inserted !== "a: {x: 1, y: 2}\n") throw new Error(`insert bytes: ${JSON.stringify(inserted)}`);
        assertSemanticallyEqual(await loads(inserted), { a: { x: 1, y: 2 } }, "insert semantic value");

        const removed = await removeValue("a: [1, 2, 3]\n", "a.1");
        if (removed !== "a: [1, 3]\n") throw new Error(`remove bytes: ${JSON.stringify(removed)}`);
        assertSemanticallyEqual(await loads(removed), { a: [1, 3] }, "remove semantic value");

        const renamed = await renameKey("a: {old: 9007199254740993}\n", "a.old", "new");
        if (renamed !== "a: {new: 9007199254740993}\n") throw new Error(`rename bytes: ${JSON.stringify(renamed)}`);
        assertSemanticallyEqual(await loads(renamed), { a: { new: 9007199254740993n } }, "rename semantic value");
    });
    await check(`${label}: insert segment API has independent semantic and trailing-comma success`, async () => {
        const out = await insertValueSegments("a: {x: 1,}\n", ["a", "y"], 2);
        if (out !== "a: {x: 1, y: 2,}\n") throw new Error(`trailing comma: ${JSON.stringify(out)}`);
        assertSemanticallyEqual(await loads(out), { a: { x: 1, y: 2 } }, "trailing comma insertion semantic value");
    });
    await check(`${label}: explicit root, dotted EOL, inline encoding and trailing comma match Rust`, async () => {
        const cases = [
            ["explicit empty root", "{\n}\n", "k", "v", "{\n    k: v\n}\n"],
            ["explicit inline root", "{}\n", "k", 1, "{k: 1}\n"],
            ["dotted root with lone CR", "a.b: 1\rb: 2", "c", "v", "a.b: 1\rb: 2\rc: v"],
            ["inline comma encoding", "a: {x: 1}\n", "a.k", "p,q", "a: {x: 1, k: p\\,q}\n"],
        ];
        for (const [name, source, path, replacement, expected] of cases) {
            const out = await insertValue(source, path, replacement);
            if (out !== expected) throw new Error(`${name}: ${JSON.stringify(out)} != ${JSON.stringify(expected)}`);
        }
        const trailingCommaSource = "a: {x: 1,}\n";
        const trailingCommaOut = await insertValue(trailingCommaSource, "a.y", 2);
        if (trailingCommaOut !== "a: {x: 1, y: 2,}\n") throw new Error(`trailing comma insertion: ${JSON.stringify(trailingCommaOut)}`);
        const escapedCommaOut = await removeValue("a: [x\\,y, z]\n", "a.0");
        if (escapedCommaOut !== "a: [z]\n") throw new Error(`escaped comma removal: ${JSON.stringify(escapedCommaOut)}`);
    });
    await check(`${label}: dotted leaf removal materializes empty parent`, async () => {
        const cases = [
            [`x: 0${"\n"}a.b: 1`, `x: 0${"\n"}a: {}`, { x: 0, a: {} }],
            ["a.b: 1", "a: {}", { a: {} }],
            [`a.b: 1${"\r"}`, `a: {}${"\r"}`, { a: {} }],
            [`a.b: 1${"\r\n"}`, `a: {}${"\r\n"}`, { a: {} }],
        ];
        for (const [source, expected, semantic] of cases) {
            const textual = await removeValue(source, "a.b");
            const segments = await removeValueSegments(source, ["a", "b"]);
            for (const out of [textual, segments]) {
                if (out !== expected) throw new Error(`${JSON.stringify(out)} != ${JSON.stringify(expected)}`);
                assertSemanticallyEqual(await loads(out), semantic, "dotted removal semantic value");
            }
        }
    });
    await check(`${label}: standalone insertion preserves string value`, async () => {
        const source = "a: 1";
        const expected = "a: 1\nb:: 123";
        const textual = await insertValue(source, "b", "123");
        const segments = await insertValueSegments(source, ["b"], "123");
        for (const out of [textual, segments]) {
            if (out !== expected) throw new Error(`got ${JSON.stringify(out)}, expected ${JSON.stringify(expected)}`);
            assertSemanticallyEqual(await loads(out), { a: 1, b: "123" }, "string insertion semantic value");
        }
    });
    await check(`${label}: insert textual/segments append without overwriting`, async () => {
            const textual = await insertValue("a: 1\n", "b", 2);
            const segments = await insertValueSegments("a: {}\n", ["a", "b"], 2);
            if (textual !== "a: 1\nb: 2\n" || segments !== "a: {b: 2}\n") throw new Error(JSON.stringify([textual, segments]));
            for (const fn of [() => insertValue("a: 1\n", "a", 9), () => insertValueSegments("a: 1\n", ["a"], 9)]) {
                let err; try { await fn(); } catch (e) { err = e; }
                if (!err || err.error !== "EditAlreadyExists" || err.body !== null || err.span !== null) throw new Error(`bad collision envelope: ${JSON.stringify(err)}`);
            }
        });
        await check(`${label}: trailing-comma removal follows Rust splice range`, async () => {
            const out = await removeValue("a: {x: 1, y: 2,}\n", "a.y");
            if (out !== "a: {x: 1,}\n") throw new Error(`got ${JSON.stringify(out)}`);
            const only = await removeValue("a: {x: 1,}\n", "a.x");
            if (only !== "a: {}\n") throw new Error(`sole member: ${JSON.stringify(only)}`);
        });
        await check(`${label}: dotted root edits preserve each source EOL`, async () => {
            const out = await insertValue("a.b: 1\r\nb.c: 2\r\n", "z", 3);
            if (out !== "a.b: 1\r\nb.c: 2\r\nz: 3\r\n") throw new Error(JSON.stringify(out));
        });
        await check(`${label}: remove and rename segment APIs preserve error contract`, async () => {
            if (await removeValue("a: [1, 2]\n", "a.0") !== "a: [2]\n") throw new Error("array removal mismatch");
            if (await removeValueSegments("a: {b: 1}\n", ["a", "b"]) !== "a: {}\n") throw new Error("segment removal mismatch");
            if (await renameKey("a: 1\n", "a", "ключ") !== "ключ: 1\n") throw new Error("unicode rename mismatch");
            if (await renameKeySegments("a: {x: 1}\n", ["a", "x"], "y") !== "a: {y: 1}\n") throw new Error("segment rename mismatch");
            for (const [fn, expected] of [[() => removeValue("a: 1\n", "missing"), "EditNotFound"], [() => removeValueSegments("a: 1\n", []), "EditNotFound"], [() => renameKey("a: 1\nb: 2\n", "a", "b"), "EditAlreadyExists"]]) {
                let err; try { await fn(); } catch (e) { err = e; }
                if (!err || err.error !== expected || err.line !== null || err.span !== null || err.path !== null) throw new Error(`bad ${expected} envelope: ${JSON.stringify(err)}`);
            }
        });
        await check(`${label}: mutation failures have all-null source locations and source wins`, async () => {
            let err; try { await insertValue("a: [", "a\\q", 1); } catch (e) { err = e; }
            if (!err || err.error !== "UnclosedCompound") throw new Error(`source precedence: ${err?.error}`);
            err = undefined; try { await insertValue("a: 1\n", "a\\q", 1); } catch (e) { err = e; }
            if (!err || err.error !== "EditInvalidPath" || err.body !== "1" || err.line !== null || err.span !== null) throw new Error(`path validation: ${JSON.stringify(err)}`);
            err = undefined; try { await renameKey("a: 1\n", "a", "b"); } catch (e) { err = e; }
            if (err) throw new Error(`rename unexpectedly failed: ${err.error}`);
            err = undefined; try { await insertValueSegments("a: 1\n", [], 1); } catch (e) { err = e; }
            if (!err || err.error !== "EditNotFound" || err.body !== null || err.line !== null || err.span !== null || err.path !== null) throw new Error(`bad EditNotFound envelope: ${JSON.stringify(err)}`);
        });

    console.log(`[${label}] edit suite complete`);
}
