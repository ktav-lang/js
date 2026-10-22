// Escape sequences (§3.7 / §3.7.1) and key-context scanning
// (§4 / §5.3 / §5.3.3), ported byte-for-byte from
// `rust/src/document/parser/inline/escapes.rs` and `inline/keys.rs`
// and `build/validate.rs`. All indices are byte offsets.

import { throwKtav, type ErrCtx } from "./errors.js";
import { decodeRange, wsLenAt } from "./bytes.js";

// ---------------------------------------------------------------------------
// §3.7 escape scanning / decoding
// ---------------------------------------------------------------------------

export interface RecognisedEscape {
    ok: true;
    /** Decoded text (1 code point). */
    ch: string;
    /** Total byte length of the sequence (2 / 6 / 12). */
    len: number;
}

export interface BadEscape {
    ok: false;
    /** The exact `BadEscapeSequence` payload. */
    seq: string;
}

const SIMPLE_ESCAPES: Record<number, string> = {
    0x5c: "\\",
    0x2c: ",",
    0x7d: "}",
    0x5d: "]",
    0x7b: "{",
    0x5b: "[",
    0x6e: "\n",
    0x72: "\r",
    0x2e: ".",
    0x3a: ":",
    0x22: '"',
    0x27: "'",
    0x60: "`",
};

function isHex(b: number): boolean {
    return (
        (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66)
    );
}

function hexVal(b: number): number {
    if (b <= 0x39) return b - 0x30;
    if (b <= 0x46) return b - 0x41 + 10;
    return b - 0x61 + 10;
}

/** `\u` followed by up to four raw bytes; ASCII as chars, others as
 *  `<0xXX>` — escapes.rs `render_malformed_unicode_escape`. */
function renderMalformedUnicodeEscape(
    bytes: Uint8Array,
    i: number,
    hi: number,
): string {
    const end = Math.min(i + 6, hi);
    let seq = "\\u";
    for (let j = i + 2; j < end; j++) {
        const b = bytes[j];
        if (b < 0x80) {
            seq += String.fromCharCode(b);
        } else {
            seq += "<0x" + b.toString(16).toUpperCase().padStart(2, "0") + ">";
        }
    }
    return seq;
}

/**
 * Scan one §3.7 escape at `bytes[i]` (must be `\`). The error payload
 * table is identical to `process_escapes`' decode — the single source
 * of both (escapes.rs `scan_escape`).
 */
export function scanEscape(bytes: Uint8Array, i: number, hi: number): RecognisedEscape | BadEscape {
    if (i + 1 >= hi) {
        return { ok: false, seq: "\\<end-of-line>" };
    }
    const next = bytes[i + 1];
    const simple = SIMPLE_ESCAPES[next];
    if (simple !== undefined) {
        return { ok: true, ch: simple, len: 2 };
    }
    if (next === 0x75) {
        // `\uXXXX`: exactly four ASCII hex digits (§3.7.1).
        if (i + 6 > hi || !isHex(bytes[i + 2]!) || !isHex(bytes[i + 3]!) || !isHex(bytes[i + 4]!) || !isHex(bytes[i + 5]!)) {
            return { ok: false, seq: renderMalformedUnicodeEscape(bytes, i, hi) };
        }
        const value =
            (hexVal(bytes[i + 2]) << 12) |
            (hexVal(bytes[i + 3]) << 8) |
            (hexVal(bytes[i + 4]) << 4) |
            hexVal(bytes[i + 5]);
        if (value >= 0xd800 && value <= 0xdbff) {
            // High surrogate: must pair with an immediately following
            // low-surrogate `\uXXXX` (12 bytes total).
            if (
                i + 12 <= hi &&
                bytes[i + 6] === 0x5c &&
                bytes[i + 7] === 0x75 &&
                isHex(bytes[i + 8]!) &&
                isHex(bytes[i + 9]!) &&
                isHex(bytes[i + 10]!) &&
                isHex(bytes[i + 11]!)
            ) {
                const low =
                    (hexVal(bytes[i + 8]) << 12) |
                    (hexVal(bytes[i + 9]) << 8) |
                    (hexVal(bytes[i + 10]) << 4) |
                    hexVal(bytes[i + 11]);
                if (low >= 0xdc00 && low <= 0xdfff) {
                    const combined = 0x10000 + (value - 0xd800) * 0x400 + (low - 0xdc00);
                    return { ok: true, ch: String.fromCodePoint(combined), len: 12 };
                }
            }
            return { ok: false, seq: renderMalformedUnicodeEscape(bytes, i, hi) };
        }
        if (value >= 0xdc00 && value <= 0xdfff) {
            // Lone low surrogate.
            return { ok: false, seq: renderMalformedUnicodeEscape(bytes, i, hi) };
        }
        return { ok: true, ch: String.fromCodePoint(value), len: 6 };
    }
    // Invalid escape.
    if (next < 0x80) {
        return { ok: false, seq: "\\" + String.fromCharCode(next) };
    }
    return {
        ok: false,
        seq: "\\<0x" + next.toString(16).padStart(2, "0").toUpperCase() + ">",
    };
}

/**
 * Process escape sequences in an inline scalar value / key segment.
 * Returns whether at least one recognised escape was decoded
 * (`owned`) plus the decoded text. Any unrecognised `\X` throws the
 * core's `BadEscapeSequence` (escapes.rs `process_escapes`).
 */
export function processEscapes(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
): { owned: boolean; text: string } {
    // Fast path: no backslash at all.
    let hasBackslash = false;
    for (let i = lo; i < hi; i++) {
        if (bytes[i] === 0x5c) {
            hasBackslash = true;
            break;
        }
    }
    if (!hasBackslash) return { owned: false, text: decodeRange(bytes, lo, hi) };

    let out = "";
    let i = lo;
    while (i < hi) {
        if (bytes[i] === 0x5c) {
            const esc = scanEscape(bytes, i, hi);
            if (!esc.ok) {
                throwKtav(
                    { k: "BadEscapeSequence", line: ctx.line, span: ctx.span, sequence: esc.seq },
                    ctx.bytes,
                    null,
                );
            }
            out += esc.ch;
            i += esc.len;
        } else {
            // Copy one whole code point.
            let j = i + 1;
            while (j < hi && (bytes[j] & 0xc0) === 0x80) j++;
            out += decodeRange(bytes, i, j);
            i = j;
        }
    }
    return { owned: true, text: out };
}

// ---------------------------------------------------------------------------
// Key-context scanning (§4, §5.3, §5.3.3)
// ---------------------------------------------------------------------------

export function isQuoteByte(b: number): boolean {
    return b === 0x22 || b === 0x27 || b === 0x60;
}

/** Skip line-bounded §3.3 whitespace; LF/CR cannot occur (§3.2
 *  pre-split lines). */
export function skipSegmentWs(bytes: Uint8Array, i: number, hi: number): number {
    for (;;) {
        const len = wsLenAt(bytes, i, hi);
        if (len === 0) return i;
        i += len;
    }
}

/**
 * Matching unescaped closer of a quoted key segment opened at
 * `openIdx`, or -1 (keys.rs `quoted_span_end`).
 */
export function quotedSpanEnd(bytes: Uint8Array, openIdx: number, hi: number): number {
    const quote = bytes[openIdx];
    let j = openIdx + 1;
    while (j < hi) {
        if (bytes[j] === 0x5c) {
            j += 2;
            continue;
        }
        if (bytes[j] === quote) return j;
        j += 1;
    }
    return -1;
}

export type ColonScan =
    | { t: "found"; i: number }
    | { t: "absent" }
    | { t: "unterminated" };

/**
 * Scan key text for the pair separator — the first unescaped `:`,
 * quoted-segment content opaque (§4). This is the full quote-aware
 * walk (`keys.rs scan_unescaped_colon_slow`); the Rust fast path is a
 * pure candidate-driven optimization that provably returns the same
 * result, so the single machine suffices.
 */
export function scanUnescapedColon(bytes: Uint8Array, lo: number, hi: number): ColonScan {
    let i = lo;
    let segStart = true; // position lo is a segment start
    while (i < hi) {
        if (segStart) {
            i = skipSegmentWs(bytes, i, hi);
            if (i < hi && isQuoteByte(bytes[i])) {
                const end = quotedSpanEnd(bytes, i, hi);
                if (end === -1) return { t: "unterminated" };
                i = end + 1;
                segStart = false;
                continue;
            }
            segStart = false;
        }
        const b = bytes[i]!;
        if (b === 0x5c) {
            i += 2; // escape consumes the next byte (overshoot guarded)
        } else if (b === 0x2e) {
            segStart = true;
            i += 1;
        } else if (b === 0x3a) {
            return { t: "found", i };
        } else {
            i += 1;
        }
    }
    return { t: "absent" };
}

/** First unescaped `:` or -1 (keys.rs `find_unescaped_colon`). */
export function findUnescapedColon(bytes: Uint8Array, lo: number, hi: number): number {
    const r = scanUnescapedColon(bytes, lo, hi);
    return r.t === "found" ? r.i : -1;
}

/**
 * Split a key path into dotted segments at unescaped `.` bytes
 * (§5.3); quoted segments are opaque (§5.3.3). Same machine as
 * `keys.rs split_key_path` (its quote-free fast path returns the
 * identical segments). An unterminated quoted span keeps the
 * remainder as one segment (defensive — callers pre-validated).
 */
export function splitKeyPath(bytes: Uint8Array, lo: number, hi: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    let start = lo;
    let i = lo;
    let segStart = true;
    while (i < hi) {
        if (segStart) {
            i = skipSegmentWs(bytes, i, hi);
            if (i < hi && isQuoteByte(bytes[i])) {
                const end = quotedSpanEnd(bytes, i, hi);
                if (end === -1) break;
                i = end + 1;
                segStart = false;
                continue;
            }
            segStart = false;
        }
        const b = bytes[i]!;
        if (b === 0x5c) {
            i += 2;
        } else if (b === 0x2e) {
            out.push([start, i]);
            start = i + 1;
            i += 1;
            segStart = true;
        } else {
            i += 1;
        }
    }
    out.push([start, hi]);
    return out;
}

/** True iff the key has no unescaped `.` separator at all. */
export function keyIsSingleSegment(bytes: Uint8Array, lo: number, hi: number): boolean {
    let i = lo;
    let segStart = true;
    while (i < hi) {
        if (segStart) {
            i = skipSegmentWs(bytes, i, hi);
            if (i < hi && isQuoteByte(bytes[i])) {
                const end = quotedSpanEnd(bytes, i, hi);
                if (end === -1) return true;
                i = end + 1;
                segStart = false;
                continue;
            }
            segStart = false;
        }
        const b = bytes[i]!;
        if (b === 0x5c) {
            i += 2;
        } else if (b === 0x2e) {
            return false;
        } else {
            i += 1;
        }
    }
    return true;
}

// ---------------------------------------------------------------------------
// Key validation (build/validate.rs)
// ---------------------------------------------------------------------------

/** Raw control byte / DEL forbidden by §4 — any byte < 0x20 except
 *  TAB/VT/FF, plus 0x7F. */
function forbiddenRawControlByte(b: number): boolean {
    return (b < 0x20 && b !== 0x09 && b !== 0x0b && b !== 0x0c) || b === 0x7f;
}

/**
 * Byte length of the escape sequence at `bytes[i]` (`\`) —
 * validate.rs `escaped_len`. Measures only; validity is decoding's
 * job.
 */
function escapedLen(bytes: Uint8Array, i: number, hi: number): number {
    if (i + 1 >= hi) return 1; // dangling backslash
    if (bytes[i + 1] !== 0x75 || i + 6 > hi) return 2;
    for (let j = i + 2; j < i + 6; j++) {
        if (!isHex(bytes[j]!)) return 2;
    }
    const value =
        (hexVal(bytes[i + 2]) << 12) |
        (hexVal(bytes[i + 3]) << 8) |
        (hexVal(bytes[i + 4]) << 4) |
        hexVal(bytes[i + 5]);
    if (!(value >= 0xd800 && value <= 0xdbff)) return 6;
    if (i + 12 > hi || bytes[i + 6] !== 0x5c || bytes[i + 7] !== 0x75) return 6;
    for (let j = i + 8; j < i + 12; j++) {
        if (!isHex(bytes[j]!)) return 6;
    }
    const low =
        (hexVal(bytes[i + 8]) << 12) |
        (hexVal(bytes[i + 9]) << 8) |
        (hexVal(bytes[i + 10]) << 4) |
        hexVal(bytes[i + 11]);
    return low >= 0xdc00 && low <= 0xdfff ? 12 : 6;
}

/** Forbidden RAW (unescaped) bytes in a bare segment: `, { } [ ] ( )`
 *  plus forbidden controls. `:` / `.` are unlisted — callers slice and
 *  split before validating. */
function forbiddenRawKeyByte(b: number): boolean {
    return (
        b === 0x2c ||
        b === 0x7b ||
        b === 0x7d ||
        b === 0x5b ||
        b === 0x5d ||
        b === 0x28 ||
        b === 0x29 ||
        forbiddenRawControlByte(b)
    );
}

function isValidKey(bytes: Uint8Array, lo: number, hi: number): boolean {
    if (lo >= hi) return false;
    let i = lo;
    while (i < hi) {
        if (bytes[i] === 0x5c) {
            i += escapedLen(bytes, i, hi);
            continue;
        }
        if (forbiddenRawKeyByte(bytes[i]!)) return false;
        i += 1;
    }
    return true;
}

export type KeyValidity = "valid" | "empty" | "invalid";

/**
 * Validate one raw, already-outer-trimmed key segment (§5.3.1) —
 * validate.rs `check_key`. Positional quoted-segment rule: first byte
 * `"`, `'`, or `` ` `` makes it a quoted segment.
 */
export function checkKey(bytes: Uint8Array, lo: number, hi: number): KeyValidity {
    if (lo >= hi) return "empty";
    const first = bytes[lo];
    if (first === 0x22 || first === 0x27 || first === 0x60) {
        // Quoted segment: properly closed, nothing after the closer,
        // no forbidden raw controls inside, non-empty content.
        const closer = quotedSpanEnd(bytes, lo, hi);
        if (closer === -1) return "invalid";
        if (closer !== hi - 1) return "invalid";
        let i = lo + 1;
        while (i < closer) {
            if (bytes[i] === 0x5c) {
                i += escapedLen(bytes, i, hi);
                continue;
            }
            if (forbiddenRawControlByte(bytes[i]!)) return "invalid";
            i += 1;
        }
        if (closer === lo + 1) return "empty"; // `""` / `''` / `` ``
        return "valid";
    }
    return isValidKey(bytes, lo, hi) ? "valid" : "invalid";
}

/**
 * Decode a single key segment (§3.7 / §5.3.3) — keys.rs
 * `decode_key_segment`: quoted → strip the outer delimiter pair and
 * escape-process the interior (never trimmed); bare → escape-process
 * iff it contains a backslash.
 */
export function decodeKeySegment(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    ctx: ErrCtx,
): string {
    if (lo < hi) {
        const first = bytes[lo];
        if (first === 0x22 || first === 0x27 || first === 0x60) {
            return processEscapes(bytes, lo + 1, hi - 1, ctx).text;
        }
    }
    return processEscapes(bytes, lo, hi, ctx).text;
}
