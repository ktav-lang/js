// Byte-level primitives for the pure TypeScript parser (spec §3.1–§3.3).
//
// Every position in the parser is a UTF-8 byte offset into the original
// input bytes — never a UTF-16 code unit. All scanning helpers here work
// on `(bytes, lo, hi)` half-open ranges so the port mirrors the Rust
// core (`rust/src/document/whitespace.rs`, `parser/parse_str.rs`)
// byte-for-byte.

/** Shared decoder — the whole input is UTF-8-validated before any
 *  decode, and slices always land on char boundaries.
 *
 *  `ignoreBOM: true` does NOT mean "strip the BOM": per the Encoding
 *  Standard it means the decoder will NOT strip a leading U+FEFF —
 *  the BOM is kept as decoded content. The document-level BOM is
 *  handled exactly once (leadingBomLen + the parser/formatter skip),
 *  so a leaf whose range genuinely begins with U+FEFF (e.g.
 *  `:: \uFEFFplain` → value "\uFEFFplain") must survive decoding
 *  verbatim. Interior ranges never start with the document BOM, so
 *  no double-BOM handling is possible. */
const DECODER = new TextDecoder("utf-8", { ignoreBOM: true });

/** Strict decoder used only by `lineTextAt`: throws instead of
 *  substituting U+FFFD, so a raw (not-yet-validated) line can be
 *  reported honestly as null text. `ignoreBOM: true` keeps the BOM —
 *  matching Rust `line_text_at` (rust/src/error/envelope.rs), which
 *  slices the RAW source (document BOM included, only \r stripped). */
const FATAL_DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Decode `bytes[lo..hi)` as UTF-8. Precondition: the range was
 *  validated (`validateUtf8`) and starts/ends on char boundaries. */
export function decodeRange(bytes: Uint8Array, lo: number, hi: number): string {
    return DECODER.decode(bytes.subarray(lo, hi));
}

/** Decode `bytes[lo..hi)` as UTF-8 or return null when the range is
 *  not valid UTF-8 (documented ABI behaviour of `line_text_at` for a
 *  raw line that never passed validation — rust/src/cabi/envelope.rs). */
export function tryDecodeRange(bytes: Uint8Array, lo: number, hi: number): string | null {
    try {
        return FATAL_DECODER.decode(bytes.subarray(lo, hi));
    } catch {
        return null;
    }
}

/** UTF-8 diagnostic for the first invalid sequence — the exact
 *  `std::str::Utf8Error` pair (rust/src/cabi/envelope.rs
 *  `not_utf8_envelope`). */
export interface Utf8Diag {
    /** Byte offset where the valid prefix ends. */
    validUpTo: number;
    /**
     * `std::str::Utf8Error::error_len`: Some(n) for a known-bad
     * sequence (std reports the full expected sequence length for the
     * lead byte — 2/3/4 — clamped down to the bytes actually consumed
     * before an interrupting byte, so `E1 80 'A'` reports 2 and an
     * unexpected continuation byte or stray lead reports 1), or null
     * for a valid prefix truncated at EOF (span then runs to
     * `bytes.length`).
     */
    errorLen: number | null;
}

/**
 * Strict UTF-8 validation (spec §3.1 / §6.15): no surrogates, no
 * overlongs, max U+10FFFF, complete sequences. Produces std-equivalent
 * diagnostics — the lead byte fixes the expected sequence length
 * (0xC2..=DF → 2, 0xE0..=EF → 3, 0xF0..=F4 → 4), an unexpected
 * continuation byte or a stray lead reports errorLen 1, and a
 * truncated valid-prefix sequence at EOF reports null.
 *
 * Returns `null` when the input is valid.
 */
export function validateUtf8(bytes: Uint8Array): Utf8Diag | null {
    const n = bytes.length;
    let i = 0;
    while (i < n) {
        const b = bytes[i]!;
        const seqStart = i;
        let need: number;
        let lo: number;
        let hi: number;
        if (b < 0x80) {
            i++;
            continue;
        } else if (b >= 0xc2 && b <= 0xdf) {
            need = 2; lo = 0x80; hi = 0xbf;
        } else if (b === 0xe0) {
            need = 3; lo = 0xa0; hi = 0xbf;   // reject overlong C0/C1 leads
        } else if (b >= 0xe1 && b <= 0xec) {
            need = 3; lo = 0x80; hi = 0xbf;
        } else if (b === 0xed) {
            need = 3; lo = 0x80; hi = 0x9f;   // reject surrogates ED A0 80
        } else if (b >= 0xee && b <= 0xef) {
            need = 3; lo = 0x80; hi = 0xbf;
        } else if (b === 0xf0) {
            need = 4; lo = 0x90; hi = 0xbf;   // reject overlong F0 80..
        } else if (b >= 0xf1 && b <= 0xf3) {
            need = 4; lo = 0x80; hi = 0xbf;
        } else if (b === 0xf4) {
            need = 4; lo = 0x80; hi = 0x8f;   // reject > U+10FFFF
        } else {
            // Stray continuation 0x80..=0xBF or illegal lead
            // C0/C1/F5..FF — std reports a one-byte sequence.
            return { validUpTo: seqStart, errorLen: 1 };
        }
        i++;
        for (let j = 1; j < need; j++) {
            if (i >= n) {
                // Truncated valid prefix at EOF → error_len None.
                return { validUpTo: seqStart, errorLen: null };
            }
            const c = bytes[i]!;
            if (c < lo || c > hi) {
                // "Interrupted doesn't swallow valid ASCII": the length
                // covers only the bad prefix bytes actually consumed up
                // to the interrupting byte (std: E1 80 'A' → 2), capped
                // at the full expected sequence length.
                return { validUpTo: seqStart, errorLen: i - seqStart };
            }
            // After the first continuation, any 0x80..0xBF is accepted.
            lo = 0x80;
            hi = 0xbf;
            i++;
        }
    }
    return null;
}

/** 1-based line number of raw byte offset `pos` — rust/src/cabi/
 *  envelope.rs `line_of_offset` verbatim. Each LF, lone CR and CR LF
 *  pair is exactly one terminator (spec §3.2); a whole terminator
 *  counts only when it ends at or before `pos`, so an offset pointing
 *  at a terminator belongs to the line that terminator closes. Counted
 *  over the raw bytes, before BOM removal or trimming (§6.15); `pos`
 *  beyond the end clamps to the end. */
export function lineOfOffset(bytes: Uint8Array, pos: number): number {
    let line = 1;
    let i = 0;
    const bound = Math.min(pos, bytes.length);
    while (i < bound) {
        const b = bytes[i]!;
        if (b === 0x0a) {
            line++;
            i++;
        } else if (b === 0x0d) {
            if (bytes[i + 1] === 0x0a) {
                // CRLF is ONE terminator and counts only for offsets
                // strictly after its LF byte.
                if (i + 2 <= pos) line++;
                i += 2;
            } else {
                line++;
                i++;
            }
        } else {
            i++;
        }
    }
    return line;
}

/** Byte length of the leading BOM (U+FEFF) if `bytes` starts with one
 *  (spec §3.1 — exactly one, positions keep counting it). */
export function leadingBomLen(bytes: Uint8Array): number {
    return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
        ? 3
        : 0;
}

// ---------------------------------------------------------------------------
// §3.3 whitespace — the fixed 25-code-point class, byte view.
// ---------------------------------------------------------------------------

/** ASCII members of the line-bounded inline view (space, TAB, VT, FF). */
export function inlineWsAscii(b: number): boolean {
    return b === 0x20 || b === 0x09 || b === 0x0b || b === 0x0c;
}

/**
 * Byte length of the §3.3 whitespace code point (inline view — the
 * full set minus LF/CR; lines are pre-split so they cannot occur)
 * starting at `i`, or 0 when the byte at `i` is not whitespace.
 * Mirrors `whitespace::leading_whitespace_run`'s byte fast path plus
 * the decoded-char check for non-ASCII members.
 */
export function wsLenAt(bytes: Uint8Array, i: number, hi: number): number {
    const b = bytes[i];
    if (b === undefined) return 0;
    if (inlineWsAscii(b)) return 1;
    if (b < 0x80) return 0;
    // U+0085 (C2 85), U+00A0 (C2 A0)
    if (b === 0xc2) {
        if (i + 1 < hi && (bytes[i + 1] === 0x85 || bytes[i + 1] === 0xa0)) return 2;
        return 0;
    }
    // U+1680 (E1 9A 80)
    if (b === 0xe1) {
        if (i + 2 < hi && bytes[i + 1] === 0x9a && bytes[i + 2] === 0x80) return 3;
        return 0;
    }
    // U+2000..U+200A, U+2028, U+2029, U+202F (E2 80 80..8A / A8 / A9
    // / AF) and U+205F (E2 81 9F) — one 0xE2 dispatch so every
    // whitespace code point with that lead byte stays reachable.
    if (b === 0xe2 && i + 2 < hi) {
        const t = bytes[i + 2]!;
        if (bytes[i + 1] === 0x80) {
            if ((t >= 0x80 && t <= 0x8a) || t === 0xa8 || t === 0xa9 || t === 0xaf) return 3;
            return 0;
        }
        if (bytes[i + 1] === 0x81 && t === 0x9f) return 3; // U+205F
        return 0;
    }
    // U+3000 (E3 80 80)
    if (b === 0xe3 && i + 2 < hi && bytes[i + 1] === 0x80 && bytes[i + 2] === 0x80) return 3;
    return 0;
}

/** Trim §3.3 whitespace from both ends of `bytes[lo..hi)`. */
export function trimWs(bytes: Uint8Array, lo: number, hi: number): [number, number] {
    return [trimWsStart(bytes, lo, hi), trimWsEnd(bytes, lo, hi)];
}

/** Trim §3.3 whitespace from the start only. */
export function trimWsStart(bytes: Uint8Array, lo: number, hi: number): number {
    for (;;) {
        const len = wsLenAt(bytes, lo, hi);
        if (len === 0) return lo;
        lo += len;
    }
}

/** Trim §3.3 whitespace from the end only. */
export function trimWsEnd(bytes: Uint8Array, lo: number, hi: number): number {
    for (;;) {
        if (lo >= hi) return lo;
        let s = hi - 1;
        while (s > lo && (bytes[s]! & 0xc0) === 0x80) s--;
        const len = wsLenAt(bytes, s, hi);
        if (len > 0 && s + len === hi) {
            hi = s;
        } else {
            return hi;
        }
    }
}

/** Compare `bytes[lo..hi)` to an ASCII literal. */
export function eqLit(bytes: Uint8Array, lo: number, hi: number, lit: string): boolean {
    if (hi - lo !== lit.length) return false;
    for (let i = 0; i < lit.length; i++) {
        if (bytes[lo + i] !== lit.charCodeAt(i)) return false;
    }
    return true;
}

/** `bytes[lo..hi)` starts with the ASCII literal. */
export function startsWithLit(bytes: Uint8Array, lo: number, hi: number, lit: string): boolean {
    if (hi - lo < lit.length) return false;
    for (let i = 0; i < lit.length; i++) {
        if (bytes[lo + i] !== lit.charCodeAt(i)) return false;
    }
    return true;
}
