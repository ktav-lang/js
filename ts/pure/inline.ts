// The inline-compound subsystem (spec §5.8): the shared byte-at-a-time
// scanner (closer find + top-level comma splitting + escape validation
// in ONE pass), and inline object/array parsing — ported from
// `rust/src/document/parser/inline/scan/scanner.rs`, `scan/split.rs`,
// `inline/compound.rs` and `inline/scan/scan_config.rs`.
//
// Fidelity notes:
// - The Rust engine monomorphizes six configs of one machine. Here a
//   single quote-aware machine serves every purpose: it validates
//   escapes, tracks the scope stack to find the body's own closer,
//   and in the same pass records EVERY gated compound's matching
//   closer byte and its own top-level comma segments (`spans`), so
//   the top-level body range is scanned exactly ONCE per parseValue
//   entry (`scanInlineBody`) and nested compounds are resolved by
//   O(1) span lookups. Nesting is counted in place (§5.8.5 value-
//   start gating + per-scope raw markers), reproducing split-mode's
//   opener-jump verdicts without the sub-scans.
// - COMPLEXITY (honest bound): parsing an inline body of length n
//   costs ONE pass over the top-level body per parseValue entry
//   (O(n)); that pass records, for EVERY gated compound opener, the
//   byte index of its matching closer AND that compound's own
//   top-level comma segments (`spans`, O(compounds) map memory).
//   Every gated opener the single pass encounters ends with a
//   RECORDED outcome — a span for a kind-matched pop, `false`
//   otherwise (kind-mismatched pop, or drained at a stop: when the
//   machine halts at its depth-zero closer or at `exhausted` /
//   `eofAfterWsSkip`, every frame still on the stack is cached as
//   `false`, since its standalone scan provably finds no same-kind
//   matching closer and no bad escape — see `drainAsDead`). The two
//   remaining stops deliberately record NOTHING: `badEscape` must
//   keep its byte-ordered §6.13 priority (a cached Unterminated must
//   not pre-empt it), and at `unterminatedQuote` bytes beyond the
//   stop were never escape-validated, so a later BadEscapeSequence in
//   the child's subrange must stay surfaceable. Nested compounds are
//   therefore resolved by O(1) span lookup; the `parseInlineValueRaw`
//   fallback `scanInlineBody` call is genuinely DEFENSIVE: it serves
//   openers absent from the map entirely (openers encountered outside
//   any recorded pass — e.g. a subrange parsed under a defensive
//   fallback's own fresh scan — or the two non-recording stops
//   above), and each such child is scanned at most ONCE. Block-
//   context frames are line-oriented and never re-scanned. There are
//   NO duplicate same-level passes: closer-find, escape validation,
//   comma splitting and span recording share one cursor. (The
//   previous O(n · MAX_INLINE_DEPTH) bound is gone — nested bodies no
//   longer recurse into `scanInlineBody` in the normal path.) On
//   MALFORMED input the bound is still linear: recorded outcomes are
//   O(opens), and fallback scans never overlap the parent pass.
// - MAX_INLINE_DEPTH = 128 bounds INLINE recursion only (compound.rs);
//   the block (line-oriented) frame stack has NO depth limit in the
//   Rust core.
//
// Error precedence (unchanged from the previous three-pass flow, whose
// first pass was this same machine): scanning is byte-ordered, so
// `BadEscapeSequence` (§6.13) is raised before the closer decision
// (`UnterminatedInlineCompound` §6.11 / closer-not-at-end
// `MalformedInlineCompound` §6.12), which in turn precedes all
// per-segment errors raised while consuming the segments.

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

export interface ErrKindBadEscape {
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
    /** Byte index of this compound's gated opener (span key). */
    openIdx: number;
    /** This compound's own next segment start (per-level segAt). */
    segAt: number;
    /** This compound's own top-level (depth-1 of itself) segments. */
    segments: Array<[number, number]>;
    /** Global depth right after this opener incremented it — the
     *  Rust `open_at` entry depth; a span records only when the pop
     *  returns the shared counter to `entryDepth - 1`. */
    entryDepth: number;
    /** Bounds-purity flag (Rust `open_at.1`): cleared by a crossed
     *  closer at this frame's stop byte, so a dead frame never
     *  records a span. */
    valid: boolean;
}

/** Everything a nested parse needs about one gated compound: the
 *  matching closer's byte index and the compound's own top-level
 *  comma segments — both recorded by the parent body's single pass.
 *  `false` = dead (Rust pairs only carry pure pairs; here the parent
 *  ALSO records the negative outcome): the machine's byte-ordered
 *  pass over this child's subrange found NO same-kind matching
 *  closer (a crossed closer killed the frame), and raised no bad
 *  escape before stopping — exactly Rust's find→None→scan→NotFound
 *  composition, minus the redundant re-walk. */
export interface InlineSpan {
    closerIdx: number;
    segments: Array<[number, number]>;
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
    /** opener byte index → its closer + own segments, or `false`
     *  for a dead (crossed-closer-killed) compound. */
    spans: Map<number, InlineSpan | false>;
    stop: Stop | null;
}

/** Mode knobs of the single body machine (scan_config.rs policy). */
interface Mode {
    /** Validate `\X` with BadEscapeSequence precedence. */
    validateEscapes: boolean;
    /** `::` raw marker + prev tracking (§5.4). */
    trackRaw: boolean;
    /** Record comma segments (per current nesting level: the body's
     *  own top level on the state, inner compounds on their frames). */
    commaSplits: boolean;
    /** Restore in_key from a kind-matched popped scope. */
    restoreInKeyOnMatch: boolean;
}

const BODY_MODE: Mode = {
    validateEscapes: true,
    trackRaw: true,
    commaSplits: true,
    restoreInKeyOnMatch: true,
};

/**
 * Cache the stop outcome for every frame still on the stack: the scan
 * ended WITHOUT any of them reaching a kind-matched pop and without a
 * bad escape in the bytes covered so far, so each outstanding frame's
 * true standalone outcome is exactly the cached `false` (its own scan
 * would stop on a kind-mismatched closer → NotFound → §6.11
 * UnterminatedInlineCompound, no earlier bad escape possible because
 * the shared pass validates escapes byte-ordered). Callers must NOT
 * invoke this at the `badEscape` or `unterminatedQuote` stops (byte-
 * ordered §6.13 priority / unvalidated bytes beyond the stop).
 */
function drainAsDead(st: MachineState): void {
    for (const f of st.stack) st.spans.set(f.openIdx, false);
}

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
                // Ws-skip only stops at `hi`, so every byte of the body
                // was visited and escape-validated — caching the
                // outstanding frames as dead cannot mask a later
                // BadEscapeSequence.
                drainAsDead(st);
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
            }
        } else if (b === 0x2c) {
            if (mode.commaSplits) {
                // The comma closes the CURRENT level's segment: the
                // body's own top level keeps its segment on the state,
                // an inner compound's on its frame (split.rs records
                // per-level; here in one cursor pass).
                if (st.stack.length === 0) {
                    st.segments.push([st.segAt, st.i]);
                    st.segAt = st.i + 1;
                } else {
                    const top = st.stack[st.stack.length - 1]!;
                    top.segments.push([top.segAt, st.i]);
                    top.segAt = st.i + 1;
                }
            }
            // Comma key context: the innermost scope's kind, or the
            // body's own shape at depth 1 (split.rs `InlineBody`).
            const scopeObject = st.stack.length > 0
                ? st.stack[st.stack.length - 1]!.kind === 0x7b
                : bodyObject;
            st.inKey = scopeObject;
            st.segStart = scopeObject;
            // An unescaped comma ends raw mode (§5.8.5).
            st.raw = false;
            st.valueStart = !scopeObject;
        } else if (b === 0x2e && st.inKey) {
            st.segStart = true;
        } else if (b === 0x7b || b === 0x5b) {
            const gatedOpen = st.valueStart && !st.raw;
            if (!gatedOpen) {
                // Mid-scalar (or raw-mode) opener: a literal byte (§5.8.5).
                st.valueStart = false;
            } else {
                // Count in place (§5.8.5 value-start nesting); open a
                // span record so the nested parse never re-scans.
                st.depth += 1;
                // Rust captures the entry depth AFTER the increment
                // (`open_at.push((i, true, depth))` runs once `depth
                // += 1` has already executed), so a pop at global
                // depth `entryDepth - 1` is this span's own stop byte.
                st.stack.push({
                    kind: b,
                    inKey: st.inKey,
                    segStart: st.segStart,
                    raw: st.raw,
                    openIdx: st.i,
                    segAt: st.i + 1,
                    segments: [],
                    entryDepth: st.depth,
                    valid: true,
                });
                // After an array's `[` the next position is still a
                // value position (its first item); after a nested `{`
                // comes key context.
                st.valueStart = b === 0x5b;
                st.inKey = b === 0x7b;
                st.segStart = b === 0x7b;
            }
        } else if (b === 0x7d || b === 0x5d) {
            // A closer returning depth to zero must be the body's own
            // kind; an unescaped closer ALWAYS ends raw mode (§5.8.5).
            st.raw = false;
            st.depth -= 1;
            if (st.depth === 0) {
                // The stop byte is a kind-mismatched closer for EVERY
                // outstanding frame (frames have entryDepth ≥ 2, so a
                // kind-matched closer for one could never reach depth
                // 0) — cache each as dead (§6.11) before returning.
                drainAsDead(st);
                st.stop = { t: "closer", idx: st.i, byte: b };
                return;
            }
            const want = b === 0x5d ? 0x5b : 0x7b;
            const top = st.stack.length > 0 ? st.stack[st.stack.length - 1]! : null;
            if (top !== null) {
                // Bounds purity (scanner.rs RECORD_BOUNDS gates): the
                // span's standalone scan stops at the FIRST closer
                // returning its own counter to zero — global depth
                // back to `entryDepth - 1`. Kind match here means the
                // pop below records a pure pair. Crossed: the
                // standalone said `NotFound` HERE, so the frame must
                // never record, no matter how far the walk continues.
                if (st.depth === top.entryDepth - 1) {
                    if (top.kind !== want) top.valid = false;
                } else if (st.depth < top.entryDepth - 1) {
                    // Defense in depth: the walk somehow passed the
                    // stop byte without stopping — treat as dead.
                    top.valid = false;
                }
            }
            if (top !== null && top.kind === want) {
                const f = st.stack.pop()!;
                // The parent pass already knows this compound's closer
                // and its own segments — record for the nested parse,
                // but ONLY when the frame is pure AND the pop landed
                // exactly on the span's stop byte (Rust: `pure &&
                // depth == entry - 1`); otherwise record DEAD so the
                // nested parse raises UnterminatedInlineCompound
                // without re-walking the subrange. (Final-segment push
                // mirrors scanInlineBody's own, so a trailing comma
                // surfaces as an empty last segment.)
                f.segments.push([f.segAt, st.i]);
                st.spans.set(
                    f.openIdx,
                    f.valid && st.depth === f.entryDepth - 1
                        ? { closerIdx: st.i, segments: f.segments }
                        : false,
                );
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
    // The machine reached `hi`: every byte was escape-validated and no
    // outstanding frame ever saw a kind-matched pop — cache them dead.
    drainAsDead(st);
    st.stop = { t: "exhausted" };
}

// ---------------------------------------------------------------------------
// One-pass body scan (split.rs `scan_inline_closer_with_bounds` +
// `split_top_level` merged) — §5.2 rules 6–9
// ---------------------------------------------------------------------------

/**
 * One-pass body scan (split.rs `scan_inline_closer_with_bounds` +
 * `split_top_level` merged): over `bytes[lo..hi)` starting at `open`,
 * the machine validates escapes (§6.13 precedence, byte-ordered),
 * finds the body's own matching `close`, and records the top-level
 * comma segments — each of the three jobs the previous three-pass
 * flow did with separate scans, now in ONE cursor pass.
 */
export interface InlineBodyScan {
    /** Matching closer byte index, or -1 (also for a bad escape —
     *  check `badEscape` FIRST, it takes §6.13 precedence). */
    closerIdx: number;
    /** Top-level comma segments of the body (only meaningful when
     *  `closerIdx !== -1`). */
    segments: Array<[number, number]>;
    /** BadEscapeSequence payload when the scan met an invalid escape
     *  before deciding the closer question. */
    badEscape: ErrKindBadEscape | null;
    /** Gated compound opener byte index → its matching closer and
     *  own top-level segments, all recorded by this single pass, or
     *  `false` for a dead compound. Nested parses consult this
     *  instead of re-scanning. */
    spans: Map<number, InlineSpan | false>;
}

/** Scan a body that MUST start with `open`; quote-aware and
 *  escape-validating. */
export function scanInlineBody(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    open: number,
    close: number,
    ctx: ErrCtx,
): InlineBodyScan {
    if (lo >= hi || bytes[lo] !== open) {
        return { closerIdx: -1, segments: [], badEscape: null, spans: new Map() };
    }
    const st: MachineState = {
        i: lo + 1,
        depth: 1,
        inKey: open === 0x7b,
        segStart: open === 0x7b,
        valueStart: open !== 0x7b,
        raw: false,
        prev: open,
        segAt: lo + 1,
        stack: [],
        segments: [],
        spans: new Map<number, InlineSpan | false>(),
        stop: null,
    };
    runMachine(bytes, lo, hi, open, close, open === 0x7b, BODY_MODE, st, ctx);
    const stop = st.stop!;
    if (stop.t === "badEscape") {
        return { closerIdx: -1, segments: [], badEscape: stop.kind, spans: st.spans };
    }
    if (stop.t === "closer" && stop.byte === close) {
        st.segments.push([st.segAt, stop.idx]);
        return { closerIdx: stop.idx, segments: st.segments, badEscape: null, spans: st.spans };
    }
    // UnterminatedQuote / EofAfterWsSkip / Exhausted — no matching
    // closer (§6.11 keeps UnterminatedInlineCompound for all of them,
    // including the unterminated-quoted-key case).
    return { closerIdx: -1, segments: st.segments, badEscape: null, spans: st.spans };
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

/** Parse a balanced inline object body `{ ... }` → V object. The
 *  caller MUST have run `scanInlineBody` over the same range and
 *  passes its precomputed top-level segments (no re-scan here) plus
 *  the scan's `spans` map for nested compounds. */
export function parseInlineObject(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    strict: boolean,
    depth: number,
    segments: Array<[number, number]>,
    spans: Map<number, InlineSpan | false>,
): V {
    if (depth >= MAX_INLINE_DEPTH) {
        malformed(ctx, "nesting depth exceeds limit (128)");
    }
    const map = newObjectV();
    const [tlo, thi] = trimWs(bytes, lo + 1, hi - 1);
    if (tlo >= thi) return map; // `{}` / `{ }`
    const n = segments.length;
    for (let s = 0; s < n; s++) {
        const [slo, shi] = segments[s]!; // s < n = segments.length (loop bound)
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
            value = parseInlineValue(bytes, colon + 1, thi2, ctx, strict, depth, spans);
        }
        insertValue(map.v, bytes, key[0], key[1], value, ctx, ctx.span);
    }
    return map;
}

/** Parse a balanced inline array body `[ ... ]` → V array. The
 *  caller MUST have run `scanInlineBody` over the same range and
 *  passes its precomputed top-level segments (no re-scan here) plus
 *  the scan's `spans` map for nested compounds. */
export function parseInlineArray(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
    strict: boolean,
    depth: number,
    segments: Array<[number, number]>,
    spans: Map<number, InlineSpan | false>,
): V {
    if (depth >= MAX_INLINE_DEPTH) {
        malformed(ctx, "nesting depth exceeds limit (128)");
    }
    const items: V[] = [];
    const [tlo, thi] = trimWs(bytes, lo + 1, hi - 1);
    if (tlo >= thi) return { t: "array", v: items };
    const n = segments.length;
    for (let s = 0; s < n; s++) {
        const [slo, shi] = segments[s]!; // s < n = segments.length (loop bound)
        const [tlo2, thi2] = trimWs(bytes, slo, shi);
        if (tlo2 >= thi2) {
            if (s === n - 1) break; // trailing comma OK
            malformed(
                ctx,
                "empty inline array item (leading comma, double comma, or empty position)",
            );
        }
        items.push(parseInlineValueRaw(bytes, tlo2, thi2, ctx, strict, depth, spans));
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
    spans: Map<number, InlineSpan | false>,
): V {
    const [tlo, thi] = trimWs(bytes, lo, hi);
    if (tlo >= thi) return emptyStringV();
    return parseInlineValueRaw(bytes, tlo, thi, ctx, strict, depth, spans);
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
    spans: Map<number, InlineSpan | false>,
): V {
    const first = bytes[lo];
    if (first === 0x7b || first === 0x5b) {
        const close = first === 0x7b ? 0x7d : 0x5d;
        // The parent body's ONE pass already recorded this opener's
        // matching closer and this compound's own top-level segments
        // (`spans`), and validated every escape in the whole subrange
        // byte-ordered — so §6.13 precedence is preserved with NO
        // re-scan here (O(1) lookup; nested bodies are never scanned
        // again).
        const span = spans.get(lo);
        if (span) {
            // §6.12: the closer the parent found must end this value's
            // subrange; non-whitespace content after it is malformed.
            if (span.closerIdx !== hi - 1) malformedCloserNotAtEnd(ctx);
            // Empty compound check BEFORE the nested recursion, so
            // `{}` / `[]` at the depth boundary stays legal (compound.rs).
            const [ilo, ihi] = trimWs(bytes, lo + 1, hi - 1);
            if (ilo >= ihi) {
                return first === 0x7b ? newObjectV() : { t: "array", v: [] };
            }
            return first === 0x7b
                ? parseInlineObject(bytes, lo, hi, ctx, strict, depth + 1, span.segments, spans)
                : parseInlineArray(bytes, lo, hi, ctx, strict, depth + 1, span.segments, spans);
        }
        // Dead (Rust find→None→scan→NotFound): the machine's
        // byte-ordered pass already walked this child's subrange,
        // found NO same-kind matching closer (the crossed-closer gate
        // marked the frame dead), and raised no bad escape before
        // stopping — exactly §6.11 UnterminatedInlineCompound,
        // without the redundant re-walk Rust's fallback performs.
        if (span === false) {
            throwKtav(
                { k: "UnterminatedInlineCompound", line: ctx.line, span: ctx.span },
                ctx.bytes,
                null,
            );
        }
        // Defensive fallback: the opener is ABSENT from the map. This
        // is NOT unreachable — it serves openers encountered outside
        // any recorded pass (e.g. a subrange parsed under this same
        // fallback's own fresh scan) or the two non-recording stops
        // (`badEscape`, `unterminatedQuote`); the normal path records
        // an outcome for every gated opener, so e.g. `v: {a: [1}}`
        // (the `[` drained as dead at the depth-0 `}` stop) takes the
        // cached-`false` path above, NOT this one. Each unrecorded
        // child is scanned at most ONCE by its own parent's parse —
        // total work stays O(input + outcomes) on malformed as well
        // as valid input; no overlapping repeated rescan. Behaves as
        // before: a local one-pass scan of this subrange.
        const scan = scanInlineBody(bytes, lo, hi, first, close, ctx);
        if (scan.badEscape !== null) throwKtav(scan.badEscape, ctx.bytes, null);
        if (scan.closerIdx === -1) {
            throwKtav(
                { k: "UnterminatedInlineCompound", line: ctx.line, span: ctx.span },
                ctx.bytes,
                null,
            );
        }
        if (scan.closerIdx !== hi - 1) malformedCloserNotAtEnd(ctx);
        // Empty compound check happens BEFORE the nested recursion, so
        // `{}` / `[]` at the depth boundary stays legal (compound.rs).
        const [ilo, ihi] = trimWs(bytes, lo + 1, hi - 1);
        if (ilo >= ihi) {
            return first === 0x7b ? newObjectV() : { t: "array", v: [] };
        }
        return first === 0x7b
            ? parseInlineObject(bytes, lo, hi, ctx, strict, depth + 1, scan.segments, scan.spans)
            : parseInlineArray(bytes, lo, hi, ctx, strict, depth + 1, scan.segments, scan.spans);
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
