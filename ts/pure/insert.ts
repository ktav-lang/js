// Dotted-key insertion with reopen-merge and the §6.2/§6.3 duplicate /
// conflict outcome tables — ported from
// `rust/src/document/parser/build/insert.rs` and `build/validate.rs`.
//
// Reopen-merge (spec §5.3.2): a dotted key may descend through an
// EXISTING object (`a.b: 1` then `a.c: 2`); descending through a
// non-object value is `KeyPathConflict::BlockedByValue`. An occupied
// leaf with a differently-shaped value is `KeyPathConflict::Overwrite`
// (single-segment keys only; dotted leaves report `DuplicateKey`), a
// same-shaped value is `DuplicateKey`.

import { KtavError } from "../internal/api.js";
import { decodeRange, trimWs } from "./bytes.js";
import { throwKtav, type ErrCtx, type Span } from "./errors.js";
import {
    checkKey,
    decodeKeySegment,
    keyIsSingleSegment,
    splitKeyPath,
} from "./lexer.js";
import { isObjectV, kindLabel, type V } from "./values.js";

/** Envelope `path` payload: DuplicateKey / KeyPathConflict carry the
 *  raw path text decoded per segment — a segment whose decode raises
 *  falls back to the RAW spelling (envelope.rs `kind_path` is TOTAL:
 *  it must never overwrite the original category, and a dotted path's
 *  later segment may carry an escape the insertion walk never reached,
 *  because it stopped at an earlier blocked / duplicate segment);
 *  InvalidKey carries the RAW split segments, undecoded
 *  (envelope.rs `kind_path`). Shared with the formatter (formatter.ts
 *  insertP), whose insert walk is otherwise identical. */
export function decodedPathSegments(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
): string[] {
    return splitKeyPath(bytes, lo, hi).map(([slo, shi]) => {
        try {
            return decodeKeySegment(bytes, slo, shi, ctx);
        } catch (e) {
            // envelope.rs kind_path: diagnostic path construction is TOTAL —
            // a segment whose decode raises the EXPECTED KtavError (e.g.
            // BadEscapeSequence for a later `\q`) falls back to the RAW
            // spelling so the original category (KeyPathConflict /
            // DuplicateKey) is constructed and never overwritten. insert.rs
            // still rejects the escape when insertion actually reaches that
            // segment — only this diagnostic derivation falls back.
            if (e instanceof KtavError) return decodeRange(bytes, slo, shi);
            throw e; // unrelated programming errors must not be swallowed
        }
    });
}

function rawPathSegments(bytes: Uint8Array, lo: number, hi: number): string[] {
    return splitKeyPath(bytes, lo, hi).map(([slo, shi]) => decodeRange(bytes, slo, shi));
}

/**
 * Insert `value` at the (possibly dotted) key path
 * `bytes[pathLo..pathHi)` — insert.rs `insert_value`.
 * `keySpan` is the diagnostic span (the key text on its line).
 */
export function insertValue(
    table: Map<string, V>,
    bytes: Uint8Array,
    pathLo: number,
    pathHi: number,
    value: V,
    ctx: ErrCtx,
    keySpan: Span,
): void {
    // Fast path: non-dotted key — the vast majority of inserts.
    if (keyIsSingleSegment(bytes, pathLo, pathHi)) {
        const [klo, khi] = trimWs(bytes, pathLo, pathHi);
        if (klo >= khi) {
            throwKtav(
                { k: "EmptyKey", line: ctx.line, span: keySpan },
                bytes,
                null,
            );
        }
        const validity = checkKey(bytes, klo, khi);
        if (validity === "empty") {
            throwKtav(
                { k: "EmptyKey", line: ctx.line, span: keySpan },
                bytes,
                null,
            );
        }
        if (validity === "invalid") {
            throwKtav(
                { k: "InvalidKey", line: ctx.line, key: decodeRange(bytes, pathLo, pathHi), span: keySpan },
                bytes,
                rawPathSegments(bytes, pathLo, pathHi),
            );
        }
        const decoded = decodeKeySegment(bytes, klo, khi, ctx);
        const existing = table.get(decoded);
        if (existing !== undefined) {
            if (isObjectV(existing) !== isObjectV(value)) {
                throwKtav(
                    {
                        k: "KeyPathConflict",
                        line: ctx.line,
                        path: decodeRange(bytes, pathLo, pathHi),
                        span: keySpan,
                        conflict: {
                            t: "overwrite",
                            existing: kindLabel(existing),
                            newKind: kindLabel(value),
                        },
                    },
                    bytes,
                    decodedPathSegments(bytes, pathLo, pathHi, ctx),
                );
            }
            throwKtav(
                { k: "DuplicateKey", line: ctx.line, key: decodeRange(bytes, pathLo, pathHi), span: keySpan },
                bytes,
                decodedPathSegments(bytes, pathLo, pathHi, ctx),
            );
        }
        table.set(decoded, value);
        return;
    }
    insertDotted(table, bytes, pathLo, pathHi, value, ctx, keySpan);
}

function insertDotted(
    table: Map<string, V>,
    bytes: Uint8Array,
    pathLo: number,
    pathHi: number,
    value: V,
    ctx: ErrCtx,
    keySpan: Span,
): void {
    const segments = splitKeyPath(bytes, pathLo, pathHi);
    const n = segments.length;
    let cur = table;
    for (let idx = 0; idx < n; idx++) {
        const [slo, shi] = segments[idx]!; // idx < n
        const [tlo, thi] = trimWs(bytes, slo, shi);
        if (tlo >= thi) {
            throwKtav(
                { k: "EmptyKey", line: ctx.line, span: keySpan },
                bytes,
                null,
            );
        }
        const validity = checkKey(bytes, tlo, thi);
        if (validity === "empty") {
            throwKtav(
                { k: "EmptyKey", line: ctx.line, span: keySpan },
                bytes,
                null,
            );
        }
        if (validity === "invalid") {
            throwKtav(
                { k: "InvalidKey", line: ctx.line, key: decodeRange(bytes, pathLo, pathHi), span: keySpan },
                bytes,
                rawPathSegments(bytes, pathLo, pathHi),
            );
        }
        const decoded = decodeKeySegment(bytes, tlo, thi, ctx);
        const isLeaf = idx + 1 === n;
        if (!isLeaf) {
            const existing = cur.get(decoded);
            if (existing === undefined) {
                const sub = { t: "object" as const, v: new Map<string, V>() };
                cur.set(decoded, sub);
                cur = sub.v;
            } else if (existing.t === "object") {
                cur = existing.v; // reopen-merge (§5.3.2)
            } else {
                throwKtav(
                    {
                        k: "KeyPathConflict",
                        line: ctx.line,
                        path: decodeRange(bytes, pathLo, pathHi),
                        span: keySpan,
                        conflict: { t: "blocked" },
                    },
                    bytes,
                    decodedPathSegments(bytes, pathLo, pathHi, ctx),
                );
            }
        } else {
            if (cur.has(decoded)) {
                throwKtav(
                    {
                        k: "DuplicateKey",
                        line: ctx.line,
                        key: decodeRange(bytes, pathLo, pathHi),
                        span: keySpan,
                    },
                    bytes,
                    decodedPathSegments(bytes, pathLo, pathHi, ctx),
                );
            }
            cur.set(decoded, value);
            return;
        }
    }
}
