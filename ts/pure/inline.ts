// The inline-compound subsystem (spec §5.8): the shared byte-at-a-time
// scanner, top-level comma splitting, closer scanning, and inline
// object/array parsing — ported from
// `rust/src/document/parser/inline/scan/scanner.rs`, `scan/split.rs`,
// `inline/compound.rs` and `inline/scan/scan_config.rs`.
//
// Fidelity notes:
// - The Rust engine monomorphizes six configs of one machine. Here a
//   single quote-aware machine serves scan/find (they are byte-
//   identical on quote-free input by R8-F2), and split uses the same
//   machine with split-mode policy. The `InlineBounds` gate-scan memo
//   is a pure optimization with a proven purity invariant and is
//   deliberately not ported — every decision below runs the live scan.
// - MAX_INLINE_DEPTH = 128 bounds INLINE recursion only (compound.rs);
//   the block (line-oriented) frame stack has NO depth limit in the
//   Rust core.

import { decodeRange, trimWs, wsLenAt, eqLit } from "./bytes.js";
import { throwKtav, type ErrCtx } from "./errors.js";
import {
    findUnescapedColon,
    isQuoteByte,
    processEscapes,
    quotedSpanEnd,
    scanEscape,
    skipSegmentWs,
} from "./lexer.js";
import { classifyInlineScalar } from "./classify.js";
import { insertValue } from "./insert.js";
import { emptyStringV, newObjectV, type V } from "./values.js";

export const MAX_INLINE_DEPTH = 128;

type Stop =
    | { t: "closer"; idx: number; byte: number }
    | { t: "eofAfterWsSkip" }
    | { t: "unterminatedQuote" }
    | { t: "exhausted" }
    | { t: "badEscape"; kind: ErrKindBadEscape };

interface ErrKindBadEscape {
    k: "BadEscapeSequence";
    line: number;
    span: ErrCtx["span"];
    sequence: string;
}

interface Frame {
    kind: number; // 0x7b or 0x5b
    inKey: boolean;
    segStart: boolean;
    raw: boolean;
}

interface MachineState {
    i: number;
    depth: number;
    inKey: boolean;
    segStart: boolean;
    valueStart: boolean;
    raw: boolean;
    prev: number;
    segAt: number;
    stack: Frame[];
    segments: Array<[number, number]>;
    stop: Stop | null;
}

/** Mode knobs shared by the three machine shapes. */
interface Mode {
    /** find/scan: `}`/`]` decrement shared depth; split: literal. */
    closersLiteral: boolean;
    /** scan only: validate `\X` with BadEscapeSequence precedence. */
    validateEscapes: boolean;
    /** find/scan: `::` raw marker + prev tracking. */
    trackRaw: boolean;
    /** split: record a segment at every loop-seen comma. */
    commaSplits: boolean;
    /** find/scan: comma key context from the stack top. */
    commaCtxScope: boolean;
    /** find/scan: an unescaped comma ends raw mode. */
    commaClearsRaw: boolean;
    /** split: a non-key `:` clears the value position. */
    colonElseClearVs: boolean;
    /** split: sub-scan and jump over candidate nested compounds. */
    openerJump: boolean;
    /** find/scan: restore in_key from a kind-matched popped scope. */
    restoreInKeyOnMatch: boolean;
}

const SCAN_MODE: Mode = {
    closersLiteral: false,
    validateEscapes: true,
    trackRaw: true,
    commaSplits: false,
    commaCtxScope: true,
    commaClearsRaw: true,
    colonElseClearVs: false,
    openerJump: false,
    restoreInKeyOnMatch: true,
};

const FIND_MODE: Mode = { ...SCAN_MODE, validateEscapes: false };

const SPLIT_MODE: Mode = {
    closersLiteral: true,
    validateEscapes: false,
    trackRaw: false,
    commaSplits: true,
    commaCtxScope: false,
    commaClearsRaw: false,
    colonElseClearVs: true,
    openerJump: true,
    restoreInKeyOnMatch: false,
};

/**
 * The shared byte-at-a-time machine (scanner.rs `Scanner::run`),
 * seeded per shape by the callers below.
 */
function runMachine(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    open: number,
    close: number,
    bodyObject: boolean,
    mode: Mode,
    st: MachineState,
    ctx: ErrCtx | null,
): void {
    const { trackRaw, validateEscapes } = mode;
    while (st.i < hi) {
        // (1) quoted key segment start: in a key position, at a fresh
        // segment start.
        if (st.inKey && st.segStart) {
            st.i = skipSegmentWs(bytes, st.i, hi);
            if (st.i >= hi) {
                st.stop = { t: "eofAfterWsSkip" };
                return;
            }
            if (isQuoteByte(bytes[st.i]!)) {
                const end = quotedSpanEnd(bytes, st.i, hi);
                if (end === -1) {
                    st.stop = { t: "unterminatedQuote" };
                    return;
                }
                if (trackRaw) st.prev = bytes[end]!;
                st.i = end + 1;
                st.segStart = false;
                continue;
            }
            st.segStart = false;
        }

        const b = bytes[st.i]!;
        if (b === 0x5c) {
            if (validateEscapes) {
                const esc = scanEscape(bytes, st.i, hi);
                if (!esc.ok) {
                    st.stop = {
                        t: "badEscape",
                        kind: {
                            k: "BadEscapeSequence",
                            line: ctx!.line,
                            span: ctx!.span,
                            sequence: esc.seq,
                        },
                    };
                    return;
                }
                st.valueStart = false;
                if (trackRaw) st.prev = 0x5c;
                st.i += esc.len;
                continue;
            }
            st.valueStart = false;
            st.i += 2;
            continue;
        }
        if (b === 0x3a) {
            if (st.inKey) {
                st.inKey = false;
                st.valueStart = true;
            } else if (trackRaw && st.prev === 0x3a && st.valueStart) {
                // `::` raw marker (§5.4) — the rest of the value is a
                // String; braces/brackets in it are content.
                st.raw = true;
            } else if (trackRaw) {
                // A lone `:` opening the value's scalar consumes the
                // value position unless a `::` marker may still form.
                if (st.valueStart && bytes[st.i + 1] !== 0x3a) st.valueStart = false;
            } else if (mode.colonElseClearVs) {
                st.valueStart = false;
            }
        } else if (b === 0x2c) {
            if (mode.commaSplits) {
                st.segments.push([st.segAt, st.i]);
                st.segAt = st.i + 1;
            }
            const scopeObject = mode.commaCtxScope
                ? st.stack.length > 0
                    ? st.stack[st.stack.length - 1]!.kind === 0x7b
                    : bodyObject
                : bodyObject;
            st.inKey = scopeObject;
            st.segStart = scopeObject;
            if (mode.commaClearsRaw) st.raw = false;
            st.valueStart = !scopeObject;
        } else if (b === 0x2e && st.inKey) {
            st.segStart = true;
        } else if (b === 0x7b || b === 0x5b) {
            const gatedOpen = st.valueStart && !st.raw;
            if (!gatedOpen) {
                // Mid-scalar (or raw-mode) opener: a literal byte (§5.8.5).
                st.valueStart = false;
            } else if (mode.openerJump) {
                // split: sub-scan the candidate nested compound with
                // its own pair and jump over it — a naive byte count
                // would treat mid-scalar openers inside the span as
                // nesting. A BadEscape sub-scan result is deliberately
                // not propagated (validation happens later in
                // processEscapes); no closer inside → literal byte.
                const close2 = b === 0x7b ? 0x7d : 0x5d;
                const sub = scanInlineCloser(bytes, st.i, hi, b, close2, ctx!);
                if (sub.t === "found") {
                    st.i = sub.idx + 1;
                    st.valueStart = false;
                    st.segStart = false;
                    continue;
                }
                st.valueStart = false;
                st.i += 1;
                continue;
            } else {
                // Count in place (find/scan use the scope stack).
                st.depth += 1;
                st.stack.push({
                    kind: b,
                    inKey: st.inKey,
                    segStart: st.segStart,
                    raw: st.raw,
                });
                // After an array's `[` the next position is still a
                // value position (its first item); after a nested `{`
                // comes key context.
                st.valueStart = b === 0x5b;
                st.inKey = b === 0x7b;
                st.segStart = b === 0x7b;
            }
        } else if ((b === 0x7d || b === 0x5d) && !mode.closersLiteral) {
            // Both closer kinds decrement the shared depth; a closer
            // returning depth to zero must be the body's own kind; an
            // unescaped closer ALWAYS ends raw mode (§5.8.5).
            st.raw = false;
            st.depth -= 1;
            if (st.depth === 0) {
                st.stop = { t: "closer", idx: st.i, byte: b };
                return;
            }
            const want = b === 0x5d ? 0x5b : 0x7b;
            const top = st.stack.length > 0 ? st.stack[st.stack.length - 1]! : null;
            if (top !== null && top.kind === want) {
                const f = st.stack.pop()!;
                if (mode.restoreInKeyOnMatch) st.inKey = f.inKey;
                // Quote-aware machine: a kind-matched closer restores
                // the saved segment-start state (RESTORE_SEG_ON_MATCH).
                st.segStart = f.segStart;
                st.raw = f.raw;
            } else {
                st.segStart = false;
            }
            // The closed compound consumed the value position.
            st.valueStart = false;
        } else {
            // §3.3 whitespace: skip the whole code point without
            // consuming the value-start position.
            const wsLen = wsLenAt(bytes, st.i, hi);
            if (wsLen > 0) {
                if (trackRaw) st.prev = bytes[st.i + wsLen - 1]!;
                st.i += wsLen;
                continue;
            }
            st.valueStart = false;
        }
        st.prev = b;
        st.i += 1;
    }
    st.stop = { t: "exhausted" };
}

// ---------------------------------------------------------------------------
// §5.2 rules 6–9 closer scan (split.rs `scan_inline_closer`)
// ---------------------------------------------------------------------------

export type InlineCloserScan =
    | { t: "found"; idx: number }
    | { t: "notFound" }
    | { t: "badEscape"; kind: ErrKindBadEscape };

/** Scan a body that MUST start with `open` and report the matching
 *  `close`, quote-aware and escape-validating. */
export function scanInlineCloser(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    open: number,
    close: number,
    ctx: ErrCtx,
): InlineCloserScan {
    if (lo >= hi || bytes[lo] !== open) return { t: "notFound" };
    const st: MachineState = {
        i: lo + 1,
        depth: 1,
        inKey: open === 0x7b,
        segStart: open === 0x7b,
        valueStart: open !== 0x7b,
        raw: false,
        prev: open,
        segAt: lo,
        stack: [],
        segments: [],
        stop: null,
    };
    runMachine(bytes, lo, hi, open, close, open === 0x7b, SCAN_MODE, st, ctx);
    if (st.stop!.t === "badEscape") return { t: "badEscape", kind: st.stop!.kind };
    if (st.stop!.t === "closer" && st.stop!.byte === close) {
        return { t: "found", idx: st.stop!.idx };
    }
    return { t: "notFound" };
}

// ---------------------------------------------------------------------------
// Delimiter matching (split.rs `find_matching_close`)
// ---------------------------------------------------------------------------

/** Matching closer index or -1; identical machine minus escape
 *  validation. */
export function findMatchingClose(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    open: number,
    close: number,
): number {
    if (lo >= hi || bytes[lo] !== open) return -1;
    const st: MachineState = {
        i: lo + 1,
        depth: 1,
        inKey: open === 0x7b,
        segStart: open === 0x7b,
        valueStart: open !== 0x7b,
        raw: false,
        prev: open,
        segAt: lo,
        stack: [],
        segments: [],
        stop: null,
    };
    runMachine(bytes, lo, hi, open, close, open === 0x7b, FIND_MODE, st, null);
    const stop = st.stop!;
    return stop.t === "closer" && stop.byte === close ? stop.idx : -1;
}

// ---------------------------------------------------------------------------
// Top-level comma splitting (split.rs `split_top_level`)
// ---------------------------------------------------------------------------

/**
 * Split `bytes[lo..hi)` on unescaped top-level commas. In an object
 * body quoted key segments are comma-opaque (§5.3.3); in an array
 * body every position is a value position. The §5.8.5 value-start
 * rule decides which `{`/`[` nest (and thus shield commas): only the
 * first non-whitespace code point of a value.
 */
export function splitTopLevel(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    bodyObject: boolean,
    ctx: ErrCtx,
): Array<[number, number]> {
    const st: MachineState = {
        i: lo,
        depth: 0,
        inKey: bodyObject,
        segStart: bodyObject,
        valueStart: !bodyObject,
        raw: false,
        prev: bodyObject ? 0x7b : 0x5b,
        segAt: lo,
        stack: [],
        segments: [],
        stop: null,
    };
    runMachine(bytes, lo, hi, bodyObject ? 0x7b : 0x5b, bodyObject ? 0x7d : 0x5d, bodyObject, SPLIT_MODE, st, ctx);
    const stop = st.stop!;
    if (stop.t === "eofAfterWsSkip") {
        // Only whitespace after the last comma → valid trailing comma;
        // otherwise the remainder is the raw LAST segment.
        const [tlo, thi] = trimWs(bytes, st.segAt, hi);
        if (tlo >= thi) return st.segments;
        st.segments.push([st.segAt, hi]);
        return st.segments;
    }
    // Exhausted (closer/quote stops cannot occur in split mode).
    st.segments.push([st.segAt, hi]);
    return st.segments;
}

// ---------------------------------------------------------------------------
// Inline object / array parsing (compound.rs)
// ---------------------------------------------------------------------------

function malformed(ctx: ErrCtx, detail: string): never {
    throwKtav(
        { k: "MalformedInlineCompound", line: ctx.line, span: ctx.span, detail },
        ctx.bytes,
        null,
    );
}

/** MalformedInlineCompound for §5.2 rule 8 (split.rs
 *  `malformed_closer_not_at_end`). */
export function malformedCloserNotAtEnd(ctx: ErrCtx): never {
    malformed(
        ctx,
        "matching closer is not the last byte of the body; non-whitespace content follows the closed inline compound",
    );
}

/** Parse a balanced inline object body `{ ... }` → V object. */
export function parseInlineObject(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    strict: boolean,
    depth: number,
): V {
    if (depth >= MAX_INLINE_DEPTH) {
        malformed(ctx, "nesting depth exceeds limit (128)");
    }
    const map = newObjectV();
    const [tlo, thi] = trimWs(bytes, lo + 1, hi - 1);
    if (tlo >= thi) return map; // `{}` / `{ }`
    const segments = splitTopLevel(bytes, lo + 1, hi - 1, true, ctx);
    const n = segments.length;
    for (let s = 0; s < n; s++) {
        const [slo, shi] = segments[s];
        const [tlo2, thi2] = trimWs(bytes, slo, shi);
        if (tlo2 >= thi2) {
            // Trailing comma (last segment empty) is OK.
            if (s === n - 1) break;
            malformed(
                ctx,
                "empty pair segment (leading comma, double comma, or missing pair)",
            );
        }
        // First unescaped `:` outside quoted segments.
        const colon = findUnescapedColon(bytes, tlo2, thi2);
        if (colon === -1) {
            malformed(
                ctx,
                "inline object pair missing ':' separator in '" +
                    decodeRange(bytes, tlo2, thi2) +
                    "'",
            );
        }
        const key = trimWs(bytes, tlo2, colon);
        if (key[0] >= key[1]) {
            throwKtav(
                { k: "EmptyKey", line: ctx.line, span: ctx.span },
                ctx.bytes,
                null,
            );
        }
        let value: V;
        if (bytes[colon + 1] === 0x3a) {
            // Raw `::` — String after escape processing + trim.
            const [blo, bhi] = trimWs(bytes, colon + 2, thi2);
            value = { t: "string", v: processEscapes(bytes, blo, bhi, ctx).text };
        } else {
            value = parseInlineValue(bytes, colon + 1, thi2, ctx, strict, depth);
        }
        insertValue(map.v, bytes, key[0], key[1], value, ctx, ctx.span);
    }
    return map;
}

/** Parse a balanced inline array body `[ ... ]` → V array. */
export function parseInlineArray(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    strict: boolean,
    depth: number,
): V {
    if (depth >= MAX_INLINE_DEPTH) {
        malformed(ctx, "nesting depth exceeds limit (128)");
    }
    const items: V[] = [];
    const [tlo, thi] = trimWs(bytes, lo + 1, hi - 1);
    if (tlo >= thi) return { t: "array", v: items };
    const segments = splitTopLevel(bytes, lo + 1, hi - 1, false, ctx);
    const n = segments.length;
    for (let s = 0; s < n; s++) {
        const [slo, shi] = segments[s];
        const [tlo2, thi2] = trimWs(bytes, slo, shi);
        if (tlo2 >= thi2) {
            if (s === n - 1) break; // trailing comma OK
            malformed(
                ctx,
                "empty inline array item (leading comma, double comma, or empty position)",
            );
        }
        items.push(parseInlineValueRaw(bytes, tlo2, thi2, ctx, strict, depth));
    }
    return { t: "array", v: items };
}

/** Parse a single inline pair value (body not yet trimmed). */
function parseInlineValue(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    strict: boolean,
    depth: number,
): V {
    const [tlo, thi] = trimWs(bytes, lo, hi);
    if (tlo >= thi) return emptyStringV();
    return parseInlineValueRaw(bytes, tlo, thi, ctx, strict, depth);
}

/**
 * Parse a single trimmed inline value — the §5.8.5 mid-value rule:
 * only the FIRST byte decides compound-vs-literal (compound.rs
 * `parse_inline_value_raw`).
 */
function parseInlineValueRaw(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    strict: boolean,
    depth: number,
): V {
    const first = bytes[lo];
    if (first === 0x7b || first === 0x5b) {
        const close = first === 0x7b ? 0x7d : 0x5d;
        const closeIdx = findMatchingClose(bytes, lo, hi, first, close);
        if (closeIdx === -1) {
            // Fallback scan validates escapes so BadEscapeSequence
            // still takes precedence over the unterminated decision.
            const r = scanInlineCloser(bytes, lo, hi, first, close, ctx);
            if (r.t === "badEscape") throwKtav(r.kind, ctx.bytes, null);
            if (r.t === "notFound") {
                throwKtav(
                    { k: "UnterminatedInlineCompound", line: ctx.line, span: ctx.span },
                    ctx.bytes,
                    null,
                );
            }
            if (r.idx !== hi - 1) malformedCloserNotAtEnd(ctx);
        } else if (closeIdx !== hi - 1) {
            malformedCloserNotAtEnd(ctx);
        }
        // Empty compound check happens BEFORE the nested recursion, so
        // `{}` / `[]` at the depth boundary stays legal (compound.rs).
        const [ilo, ihi] = trimWs(bytes, lo + 1, hi - 1);
        if (ilo >= ihi) {
            return first === 0x7b ? newObjectV() : { t: "array", v: [] };
        }
        return first === 0x7b
            ? parseInlineObject(bytes, lo, hi, ctx, strict, depth + 1)
            : parseInlineArray(bytes, lo, hi, ctx, strict, depth + 1);
    }

    // §5.2 rule 5: `()` / `(())` → empty String (raw body — escape
    // provenance).
    if (eqLit(bytes, lo, hi, "()") || eqLit(bytes, lo, hi, "(())")) {
        return emptyStringV();
    }

    // Plain inline scalar — process escapes, then classify. A
    // recognised escape anywhere forces String (§5.2 rule 15
    // provenance); the decoded body is never re-classified.
    const processed = processEscapes(bytes, lo, hi, ctx);
    if (processed.owned) return { t: "string", v: processed.text };
    return classifyInlineScalar(bytes, lo, hi, ctx, strict);
}
