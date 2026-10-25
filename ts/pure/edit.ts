// Lossless source edit: `editValue` / `editValueSegments` — the pure
// TypeScript port of `rust/src/edit.rs` +
// `src/document/parser/edit/{tree.rs, splice.rs, splice/layout.rs}`.
//
// The engine is split into internal modules with an acyclic graph:
//
//   edit/shared.ts  — EditError + envelope mapping, value equality,
//                     byte-level helpers shared by every stage
//   edit/path.ts    — textual path parsing (`\.` / `\\`, byte offsets)
//   edit/tree.ts    — the positional tree (byte ranges of values)
//   edit/splice.ts  — replacement planning + candidate assembly,
//                     comment-loss detection, verification helpers
//   edit/layout.ts  — minimal inline-wrapper expansion
//
// This file keeps the PUBLIC surface and orchestrates the pipeline:
// parse source → splice candidate → layout adjust → mandatory
// semantic verification.
//
// Invariants (mirrored from the Rust reference, see its module docs):
// - Source splice, NOT parse→mutate→serialize: only the bytes of the
//   target (and, when required, of inline wrappers being expanded)
//   change; comments, whitespace, key spelling/order, BOM, CR/LF/CRLF
//   and the presence/absence of the final newline are preserved.
// - Only replacement of an existing value; missing keys, scalar
//   descent, out-of-bounds/non-numeric indexes and an empty segments
//   list are EditNotFound; a malformed textual path is EditInvalidPath
//   with the UTF-8 BYTE offset inside the path argument; a
//   noncontiguous (dotted/reopened) target, structural replacement
//   that would erase interior comments, and strings with a line `))`
//   are EditUnsupported.
// - Byte-identical replacement is a no-op even for noncanonical
//   spelling. Every successful patch is re-parsed and semantically
//   verified: exactly the target replaced, the rest of the tree equal
//   (fail closed — a silent corruption is never returned).
// - All offsets are UTF-8 BYTE offsets into the source; the engine
//   operates on the raw byte buffer, never on UTF-16 indices.

import { parseValue } from "./parse.js";
import { jsToV } from "./ktavvalue.js";
import type { KtavValue } from "../internal/api.js";

import {
    editErrorToKtav,
    eqV,
    utf8,
    type EditError,
} from "./edit/shared.js";
import { parsePath } from "./edit/path.js";
import { spliceCandidate, takeTarget } from "./edit/splice.js";
import { layoutAdjust } from "./edit/layout.js";

export type { EditError } from "./edit/shared.js";

const RESULT_DECODER = new TextDecoder("utf-8", { ignoreBOM: true });

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function runEdit(bytes: Uint8Array, segments: readonly string[], repl: ReturnType<typeof jsToV>): string {
    // Source validation/parsing already happened in the public entry
    // points — SOURCE errors must win over path/segments errors (the
    // native/CABI precedence).
    const spliced = spliceCandidate(bytes, segments, repl);
    if ("err" in spliced) throw editErrorToKtav(spliced.err);

    // Byte-identical no-op: skip layout and verification entirely.
    if (spliced.patch.candidate === bytes) {
        return RESULT_DECODER.decode(spliced.patch.candidate);
    }

    const adjusted = layoutAdjust(
        bytes,
        spliced.patch.candidate,
        spliced.patch.root,
        segments,
        repl,
        spliced.patch.splice,
    );
    if ("err" in adjusted) throw editErrorToKtav(adjusted.err);
    const result = adjusted.result;

    // Mandatory semantic verification: exactly the target replaced.
    let newDoc: ReturnType<typeof parseValue>;
    try {
        newDoc = parseValue(result);
    } catch (e) {
        throw editErrorToKtav(
            unsupportedWith(
                e instanceof Error && e.message
                    ? `patch produced an invalid document: ${e.message}`
                    : "patch produced an invalid document",
            ),
        );
    }
    let targetMatches: boolean;
    try {
        targetMatches = eqV(takeTarget(newDoc, segments), repl);
    } catch {
        targetMatches = false;
    }
    let expected: ReturnType<typeof parseValue>;
    try {
        expected = parseValue(bytes);
        takeTarget(expected, segments);
    } catch {
        throw editErrorToKtav({ k: "NotFound" });
    }
    if (!targetMatches || !eqV(newDoc, expected)) {
        throw editErrorToKtav(
            unsupportedWith("semantic mismatch after splice; no lossless patch produced"),
        );
    }
    return RESULT_DECODER.decode(result);
}

function unsupportedWith(reason: string): EditError {
    return { k: "Unsupported", reason };
}

/** `edit_value(source, textual_path, replacement)`: replace the value
 *  at `textual_path` (`key1.key2.0.key4`; `\.` = literal dot, `\\` =
 *  literal backslash) with `replacement`, splicing the source text —
 *  comments, whitespace and EOL style outside the edit survive. The
 *  input string is never mutated. Error precedence matches the native
 *  C ABI: the SOURCE is validated and parsed FIRST (a bad source
 *  throws the parser's own envelope, never an Edit* error), THEN the
 *  path is decoded (`EditInvalidPath` with the UTF-8 byte offset).
 *  Never mutates the input. */
export function editValueSource(source: string, path: string, replacement: KtavValue): string {
    const bytes = utf8(source);
    parseValue(bytes); // source-first precedence (native/CABI parity)
    const parsed = parsePath(path);
    if (!parsed.ok) throw editErrorToKtav(parsed.err);
    return runEdit(bytes, parsed.segments, jsToV(replacement));
}

/** `edit_value_segments(source, decoded_segments, replacement)`: the
 *  segments variant — segments are ALREADY-DECODED literal names with
 *  no extra unescaping. A numeric segment addresses a string key
 *  inside an Object and a zero-based index inside an Array. Source
 *  errors win first (native/CABI parity); an empty segments list is
 *  EditNotFound. */
export function editValueSegmentsSource(
    source: string,
    segments: readonly string[],
    replacement: KtavValue,
): string {
    const bytes = utf8(source);
    parseValue(bytes); // source-first precedence (native/CABI parity)
    if (segments.length === 0) throw editErrorToKtav({ k: "NotFound" });
    return runEdit(bytes, segments, jsToV(replacement));
}
