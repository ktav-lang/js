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
    await check(`${label}: exact-precision integer above 2^53 stays exact (inside i64)`, async () => {
        // 9007199254740993 fits the i64 source domain but exceeds the
        // JS safe-integer range: the wire keeps the exact decimal —
        // never clamped to a float, never normalised.
        const out = await editValue("a: 1\n", "a", 9007199254740993n);
        if (out !== "a: 9007199254740993\n") throw new Error(`got ${JSON.stringify(out)}`);
    });
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
        // The parser's own class (UnclosedCompound for "a: [") — never
        // rewritten to EditUnsupported.
        if (err.error !== "UnclosedCompound") {
            throw new Error(`error=${err.error}, expected the parser's UnclosedCompound`);
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

    console.log(`[${label}] edit suite complete`);
}
