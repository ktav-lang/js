// §5.2 value classification, §5.0.1 root detection and §5.3/§5.4
// separator rules — ported from
// `rust/src/document/parser/syntax/classify.rs`, `parser/root.rs` and
// `parser/sep.rs`.

import { decodeRange, eqLit, trimWs, wsLenAt } from "./bytes.js";
import { throwKtav, type ErrCtx, type Span } from "./errors.js";
import {
    canonicalFloat,
    hasRedundantLeadingZero,
    isFloatLiteral,
    parseFloatValue,
    ryuFormat,
    tryParseInteger,
} from "./numbers.js";
import { parseInlineArray, parseInlineObject, scanInlineCloser } from "./inline.js";
import { findUnescapedColon } from "./lexer.js";
import type { V } from "./values.js";

export type ValueStart =
    | { t: "scalar"; lo: number; hi: number }
    | { t: "null" }
    | { t: "bool"; v: boolean }
    | { t: "int"; dec: string }
    | { t: "float"; dec: string }
    | { t: "emptyObject" }
    | { t: "emptyArray" }
    | { t: "openObject" }
    | { t: "openArray" }
    | { t: "openMultilineStripped" }
    | { t: "openMultilineVerbatim" }
    | { t: "inline"; v: V };

/** Strict-mode lossy-scalar error (classify.rs `lossy_scalar`). */
function lossyScalar(
    body: string,
    canonical: string,
    ctx: ErrCtx,
): never {
    throwKtav(
        {
            k: "LossyScalar",
            line: ctx.line,
            body,
            canonical,
            span: ctx.span,
        },
        ctx.bytes,
        null,
    );
}

function fastPlainDecimalI64(bytes: Uint8Array, lo: number, hi: number): boolean {
    if (lo >= hi) return false;
    const first = bytes[lo]!;
    if (first === 0x30) return hi - lo === 1; // "0" only
    if (!(first >= 0x31 && first <= 0x39)) return false;
    for (let i = lo + 1; i < hi; i++) {
        const b = bytes[i]!;
        if (b < 0x30 || b > 0x39) return false;
    }
    if (hi - lo > 19) return false; // > i64::MAX digits
    return BigInt(decodeRange(bytes, lo, hi)) <= 9223372036854775807n;
}

/**
 * Classify the text after a `:` (or a bare array line) — classify.rs
 * `classify_value_start`. `text` must already have trailing
 * whitespace removed (guaranteed by the line trim); only leading
 * whitespace is stripped here.
 */
export function classifyValueStart(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    strict: boolean,
): ValueStart {
    let tLo = lo;
    for (;;) {
        const len = wsLenAt(bytes, tLo, hi);
        if (len === 0) break;
        tLo += len;
    }
    const tHi = hi; // trailing ws already gone (pre-trimmed line)

    if (eqLit(bytes, tLo, tHi, "{")) return { t: "openObject" };
    if (eqLit(bytes, tLo, tHi, "[")) return { t: "openArray" };

    // §5.2 rules 6–9: inline compounds.
    if (bytes[tLo] === 0x7b) {
        // Empty object: `{}` or `{ }`.
        if (bytes[tHi - 1] === 0x7d) {
            const [ilo, ihi] = trimWs(bytes, tLo + 1, tHi - 1);
            if (ilo >= ihi) return { t: "emptyObject" };
        }
        return dispatchInlineCompound(bytes, tLo, tHi, ctx, strict, 0x7b, 0x7d);
    }
    if (bytes[tLo] === 0x5b) {
        if (bytes[tHi - 1] === 0x5d) {
            const [ilo, ihi] = trimWs(bytes, tLo + 1, tHi - 1);
            if (ilo >= ihi) return { t: "emptyArray" };
        }
        return dispatchInlineCompound(bytes, tLo, tHi, ctx, strict, 0x5b, 0x5d);
    }

    // Multi-line string openers — exact tokens only.
    if (eqLit(bytes, tLo, tHi, "(")) return { t: "openMultilineStripped" };
    if (eqLit(bytes, tLo, tHi, "((")) return { t: "openMultilineVerbatim" };
    if (eqLit(bytes, tLo, tHi, "()") || eqLit(bytes, tLo, tHi, "(())")) {
        return { t: "scalar", lo: tLo, hi: tLo }; // empty String
    }
    // Anything else starting with `(` is an ordinary inline scalar.

    // §5.2 rules 10–12: JSON keywords (case-sensitive).
    if (eqLit(bytes, tLo, tHi, "null")) return { t: "null" };
    if (eqLit(bytes, tLo, tHi, "true")) return { t: "bool", v: true };
    if (eqLit(bytes, tLo, tHi, "false")) return { t: "bool", v: false };

    // §5.2 rules 13–14 exception: redundant leading zero is a String
    // in both entry points — nothing is lost, so strict never fires.
    if (hasRedundantLeadingZero(bytes, tLo, tHi)) {
        return { t: "scalar", lo: tLo, hi: tHi };
    }

    // §5.2 rule 13: integer literal.
    if (fastPlainDecimalI64(bytes, tLo, tHi)) {
        // Already canonical decimal — keep the source spelling.
        return { t: "int", dec: decodeRange(bytes, tLo, tHi) };
    }
    const intVal = tryParseInteger(bytes, tLo, tHi);
    if (intVal !== null) {
        const canonical = intVal.toString();
        if (strict && canonical !== decodeRange(bytes, tLo, tHi)) {
            lossyScalar(decodeRange(bytes, tLo, tHi), canonical, ctx);
        }
        return { t: "int", dec: canonical };
    }

    // §5.2 rule 14: float literal (finite; binary64 roundTiesToEven —
    // JS `Number` parsing is the same correctly-rounded conversion).
    if (isFloatLiteral(bytes, tLo, tHi)) {
        const val = parseFloatValue(bytes, tLo, tHi);
        if (val !== null) {
            const canonical = ryuFormat(val);
            if (strict) {
                const rendered = canonicalFloat(canonical);
                const body = decodeRange(bytes, tLo, tHi);
                if (rendered !== body) lossyScalar(body, rendered, ctx);
                return { t: "float", dec: canonical };
            }
            return { t: "float", dec: canonical };
        }
    }

    // §5.2 rule 15: String as written.
    return { t: "scalar", lo: tLo, hi: tHi };
}

/**
 * §5.2 rules 6–9 tri-state dispatch for a `{`/`[`-prefixed body —
 * classify.rs `dispatch_inline_compound`. A closed compound whose
 * closer is the last byte parses inline; a closer followed by content
 * is `MalformedInlineCompound` (§6.12); no closer is
 * `UnterminatedInlineCompound` (§6.11); `BadEscapeSequence` (§6.13)
 * takes precedence per the rules-6–9 preamble.
 */
function dispatchInlineCompound(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    strict: boolean,
    open: number,
    close: number,
): ValueStart {
    const r = scanInlineCloser(bytes, lo, hi, open, close, ctx);
    if (r.t === "badEscape") throwKtav(r.kind, ctx.bytes, null);
    if (r.t === "notFound") {
        throwKtav(
            { k: "UnterminatedInlineCompound", line: ctx.line, span: ctx.span },
            ctx.bytes,
            null,
        );
    }
    if (r.idx !== hi - 1) {
        throwKtav(
            {
                k: "MalformedInlineCompound",
                line: ctx.line,
                span: ctx.span,
                detail:
                    "matching closer is not the last byte of the body; non-whitespace content follows the closed inline compound",
            },
            ctx.bytes,
            null,
        );
    }
    const v =
        open === 0x7b
            ? parseInlineObject(bytes, lo, hi, ctx, strict, 0)
            : parseInlineArray(bytes, lo, hi, ctx, strict, 0);
    return { t: "inline", v };
}

/**
 * §5.2 rules 10–15 for an inline scalar body (already trimmed,
 * escapes already processed and proven absent — compound.rs
 * `classify_inline_scalar`).
 */
export function classifyInlineScalar(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    strict: boolean,
): V {
    if (lo >= hi) return { t: "string", v: "" };
    if (eqLit(bytes, lo, hi, "null")) return { t: "null" };
    if (eqLit(bytes, lo, hi, "true")) return { t: "bool", v: true };
    if (eqLit(bytes, lo, hi, "false")) return { t: "bool", v: false };
    if (hasRedundantLeadingZero(bytes, lo, hi)) {
        return { t: "string", v: decodeRange(bytes, lo, hi) };
    }
    if (fastPlainDecimalI64(bytes, lo, hi)) {
        return { t: "int", dec: decodeRange(bytes, lo, hi) };
    }
    const intVal = tryParseInteger(bytes, lo, hi);
    if (intVal !== null) {
        const canonical = intVal.toString();
        if (strict && canonical !== decodeRange(bytes, lo, hi)) {
            lossyScalar(decodeRange(bytes, lo, hi), canonical, ctx);
        }
        return { t: "int", dec: canonical };
    }
    if (isFloatLiteral(bytes, lo, hi)) {
        const val = parseFloatValue(bytes, lo, hi);
        if (val !== null) {
            const canonical = ryuFormat(val);
            if (strict) {
                const rendered = canonicalFloat(canonical);
                const body = decodeRange(bytes, lo, hi);
                if (rendered !== body) lossyScalar(body, rendered, ctx);
                return { t: "float", dec: canonical };
            }
            return { t: "float", dec: canonical };
        }
    }
    return { t: "string", v: decodeRange(bytes, lo, hi) };
}

// ---------------------------------------------------------------------------
// §5.0.1 root detection (parser/root.rs)
// ---------------------------------------------------------------------------

export type RootResult =
    | { t: "inlineObject"; v: V }
    | { t: "inlineArray"; v: V }
    | { t: "explicitObject" }
    | { t: "explicitArray" }
    | { t: "object" }
    | { t: "array" };

/**
 * Root kind detection (§5.0.1 rules 2–7; rules 1 and 8 handled by the
 * caller — parser.rs).
 */
export function classifyRootKind(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    strict: boolean,
): RootResult {
    if (eqLit(bytes, lo, hi, "{")) return { t: "explicitObject" };
    if (eqLit(bytes, lo, hi, "[")) return { t: "explicitArray" };
    // Rules 2/3 + the rules-2–5 addendum: a first content line
    // beginning with `{`/`[` is diagnosed by the same §5.2 scan as a
    // value body and NEVER falls through to the pair candidate
    // (`[bad]: 1`).
    if (bytes[lo] === 0x7b) return diagnoseRootInline(bytes, lo, hi, ctx, strict, 0x7b, 0x7d);
    if (bytes[lo] === 0x5b) return diagnoseRootInline(bytes, lo, hi, ctx, strict, 0x5b, 0x5d);
    return isPairShape(bytes, lo, hi) ? { t: "object" } : { t: "array" };
}

function diagnoseRootInline(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    strict: boolean,
    open: number,
    close: number,
): RootResult {
    const r = scanInlineCloser(bytes, lo, hi, open, close, ctx);
    if (r.t === "badEscape") throwKtav(r.kind, ctx.bytes, null);
    if (r.t === "notFound") {
        throwKtav(
            { k: "UnterminatedInlineCompound", line: ctx.line, span: ctx.span },
            ctx.bytes,
            null,
        );
    }
    if (r.idx !== hi - 1) {
        throwKtav(
            {
                k: "MalformedInlineCompound",
                line: ctx.line,
                span: ctx.span,
                detail:
                    "matching closer is not the last byte of the body; non-whitespace content follows the closed inline compound",
            },
            ctx.bytes,
            null,
        );
    }
    const v =
        open === 0x7b
            ? parseInlineObject(bytes, lo, hi, ctx, strict, 0)
            : parseInlineArray(bytes, lo, hi, ctx, strict, 0);
    return open === 0x7b ? { t: "inlineObject", v } : { t: "inlineArray", v };
}

// ---------------------------------------------------------------------------
// §5.3 pair-shape heuristic and separator rules
// ---------------------------------------------------------------------------

/** classify.rs `is_pair_shape` — the phase-1 pair-candidate test. */
export function isPairShape(bytes: Uint8Array, lo: number, hi: number): boolean {
    const colon = findUnescapedColon(bytes, lo, hi);
    if (colon === -1) return false;
    // Non-empty prefix before `:` (trailing ws trimmed).
    let keyHi = colon;
    for (;;) {
        let s = keyHi - 1;
        while (s > lo && (bytes[s] & 0xc0) === 0x80) s--;
        const len = wsLenAt(bytes, s, keyHi);
        if (len > 0 && s + len === keyHi) {
            keyHi = s;
        } else {
            break;
        }
    }
    if (keyHi <= lo) return false;
    const after = colon + 1;
    if (after < hi && bytes[after] === 0x3a) return true; // `key::`
    return after >= hi || wsLenAt(bytes, after, hi) > 0;
}

// ---------------------------------------------------------------------------
// §5.3 / §5.4 separator classification (parser/sep.rs)
// ---------------------------------------------------------------------------

export type Separator =
    | { t: "raw"; lo: number; hi: number }
    | { t: "plain"; lo: number; hi: number };

/** After the first `:` of `key: value`: `::` → raw marker, else plain. */
export function classifySeparator(bytes: Uint8Array, lo: number, hi: number): Separator {
    if (lo < hi && bytes[lo] === 0x3a) return { t: "raw", lo: lo + 1, hi };
    return { t: "plain", lo, hi };
}

/**
 * Enforce `<sep-end>`: the marker must be followed by whitespace
 * (§3.3) or end of line — sep.rs `require_sep_end`. `bodyOff` is the
 * byte offset where the glued body begins; the error span runs from
 * there to the trimmed-line end.
 */
export function requireSepEnd(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    bodyOff: number,
    trimmedSpan: Span,
): void {
    if (lo >= hi || wsLenAt(bytes, lo, hi) > 0) return;
    throwKtav(
        {
            k: "MissingSeparatorSpace",
            line: ctx.line,
            span: { start: bodyOff, end: trimmedSpan.end },
        },
        ctx.bytes,
        null,
    );
}
