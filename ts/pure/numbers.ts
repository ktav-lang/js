// §3.6 number grammar and §5.9.8 canonical float form, ported from
// `rust/src/document/parser/syntax/classify.rs` (integer/float
// literal scanning) and `rust/src/document/render/canonical/num.rs`
// (`canonical_float`) plus the ryu pretty printer
// (`ryu/src/pretty/mod.rs format64`) the canonical form is defined
// against.

// ---------------------------------------------------------------------------
// §3.6 integer literal grammar
// ---------------------------------------------------------------------------

/** §5.2 rules 13–14 exception: a base-10 digit run whose first digit
 *  is `0` with a further digit/underscore following (`01234`, `-045`,
 *  `00`, `0_7`) is never a number (classify.rs
 *  `has_redundant_leading_zero`). */
export function hasRedundantLeadingZero(
    bytes: Uint8Array,
    lo: number,
    hi: number,
): boolean {
    if (lo >= hi) return false;
    let start = lo;
    const first = bytes[start];
    if (first === 0x2b || first === 0x2d) start++;
    if (start >= hi || bytes[start] !== 0x30) return false;
    if (start + 1 >= hi) return false;
    const b = bytes[start + 1]!;
    return (b >= 0x30 && b <= 0x39) || b === 0x5f;
}

function digitValue(b: number, radix: number): number {
    let v = -1;
    if (b >= 0x30 && b <= 0x39) v = b - 0x30;
    else if (b >= 0x61 && b <= 0x66) v = b - 0x61 + 10;
    else if (b >= 0x41 && b <= 0x46) v = b - 0x41 + 10;
    return v >= 0 && v < radix ? v : -1;
}

const I64_MIN_MAG = 1n << 63n; // |i64::MIN|
const I64_MAX = (1n << 63n) - 1n;

/**
 * Parse a §3.6 integer literal; returns the value as a BigInt, or
 * null when the grammar doesn't match or the value overflows i64
 * (classify.rs `try_parse_integer` — base prefixes lowercase only;
 * underscores only between digits).
 *
 * Overflow cap: once the accumulated magnitude exceeds |i64::MIN|
 * (2^63 — larger than any representable magnitude for either sign)
 * it can only grow, so accumulation into `val` stops; the remaining
 * bytes are still scanned to validate the syntax (underscore rules,
 * digit validity) so a malformed suffix like `9_` or `12a3` still
 * returns null for SYNTAX, while a syntactically valid over-range
 * literal keeps returning the correct out-of-range result (null via
 * the unchanged final range checks). In-range values are exact.
 */
export function tryParseInteger(bytes: Uint8Array, lo: number, hi: number): bigint | null {
    if (lo >= hi) return null;
    let i = lo;
    let negative = false;
    if (bytes[i] === 0x2d) {
        i++;
        negative = true;
    } else if (bytes[i] === 0x2b) {
        i++;
    }
    if (i >= hi) return null; // sign only
    if (bytes[i] === 0x30 && i + 1 < hi) {
        switch (bytes[i + 1]) {
            case 0x78:
                return parsePrefixedInt(bytes, i + 2, hi, 16, negative);
            case 0x6f:
                return parsePrefixedInt(bytes, i + 2, hi, 8, negative);
            case 0x62:
                return parsePrefixedInt(bytes, i + 2, hi, 2, negative);
            default:
                break;
        }
    }
    return parseDecimalInt(bytes, i, hi, negative);
}

function parsePrefixedInt(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    radix: number,
    negative: boolean,
): bigint | null {
    if (lo >= hi) return null;
    if (digitValue(bytes[lo]!, radix) < 0) return null;
    let val = 0n;
    let prevUnderscore = false;
    let capped = false; // magnitude provably beyond i64 — see tryParseInteger
    for (let i = lo; i < hi; i++) {
        const b = bytes[i]!;
        if (b === 0x5f) {
            if (prevUnderscore) return null;
            prevUnderscore = true;
            continue;
        }
        prevUnderscore = false;
        const d = digitValue(b, radix);
        if (d < 0) return null;
        if (!capped) {
            val = val * BigInt(radix) + BigInt(d);
            if (val > I64_MIN_MAG) capped = true; // values only grow
        }
    }
    if (prevUnderscore) return null;
    if (capped) return null; // magnitude > |i64::MIN| → out of range for both signs
    if (negative) {
        if (val > I64_MIN_MAG) return null;
        return val === 0n ? 0n : -val;
    }
    if (val > I64_MAX) return null;
    return val;
}

function parseDecimalInt(
    bytes: Uint8Array,
    lo: number,
    hi: number,
    negative: boolean,
): bigint | null {
    if (lo >= hi) return null;
    const first = bytes[lo]!;
    if (first < 0x30 || first > 0x39) return null;
    let val = 0n;
    let prevUnderscore = false;
    let count = 0;
    // Overflow cap — see tryParseInteger. Note val may legitimately
    // equal I64_MIN_MAG (|i64::MIN|) without capping.
    let capped = false;
    for (let i = lo; i < hi; i++) {
        const b = bytes[i]!;
        if (b === 0x5f) {
            if (prevUnderscore || count === 0) return null;
            prevUnderscore = true;
            continue;
        }
        if (b < 0x30 || b > 0x39) return null;
        prevUnderscore = false;
        if (!capped) {
            val = val * 10n + BigInt(b - 0x30);
            if (val > I64_MIN_MAG) capped = true; // values only grow
        }
        count++;
    }
    if (prevUnderscore || count === 0) return null;
    if (capped) return null; // magnitude > |i64::MIN| → out of range for both signs
    if (negative) {
        if (val > I64_MIN_MAG) return null;
        return val === 0n ? 0n : -val;
    }
    if (val > I64_MAX) return null;
    return val;
}

// ---------------------------------------------------------------------------
// §3.6 float literal grammar
// ---------------------------------------------------------------------------

function scanDecPart(bytes: Uint8Array, i: number, hi: number): number {
    // Returns the index after the digit run, or -1 when invalid.
    if (i >= hi || bytes[i]! < 0x30 || bytes[i]! > 0x39) return -1;
    i++;
    let prevUnderscore = false;
    while (i < hi) {
        const b = bytes[i]!;
        if (b === 0x5f) {
            if (prevUnderscore) return -1;
            prevUnderscore = true;
            i++;
            continue;
        }
        if (b >= 0x30 && b <= 0x39) {
            prevUnderscore = false;
            i++;
            continue;
        }
        break;
    }
    return prevUnderscore ? -1 : i;
}

function scanExponent(bytes: Uint8Array, i: number, hi: number): number {
    if (i >= hi || (bytes[i] !== 0x65 && bytes[i] !== 0x45)) return -1;
    i++;
    if (i < hi && (bytes[i] === 0x2b || bytes[i] === 0x2d)) i++;
    return scanDecPart(bytes, i, hi);
}

/** Does `bytes[lo..hi)` match the §3.6 float literal grammar
 *  (classify.rs `is_float_literal`)? Digits required on both sides of
 *  `.`; a dotless form requires an exponent. */
export function isFloatLiteral(bytes: Uint8Array, lo: number, hi: number): boolean {
    if (lo >= hi) return false;
    const first = bytes[lo]!; // lo < hi (guard above)
    if (!(first >= 0x30 && first <= 0x39) && first !== 0x2b && first !== 0x2d) return false;
    let hasDotOrExp = false;
    for (let i = lo; i < hi; i++) {
        const b = bytes[i]!;
        if (b === 0x2e || b === 0x65 || b === 0x45) {
            hasDotOrExp = true;
            break;
        }
    }
    if (!hasDotOrExp) return false;
    let i = lo;
    if (bytes[i] === 0x2b || bytes[i] === 0x2d) i++;
    i = scanDecPart(bytes, i, hi);
    if (i < 0) return false;
    if (i < hi && bytes[i] === 0x2e) {
        i = scanDecPart(bytes, i + 1, hi);
        if (i < 0) return false;
        if (i < hi && (bytes[i] === 0x65 || bytes[i] === 0x45)) {
            i = scanExponent(bytes, i, hi);
            if (i < 0) return false;
        }
        return i === hi;
    }
    if (i < hi && (bytes[i] === 0x65 || bytes[i] === 0x45)) {
        i = scanExponent(bytes, i, hi);
        if (i < 0) return false;
        return i === hi;
    }
    return false;
}

/** Parse a float literal already validated by `isFloatLiteral` —
 *  classify.rs `parse_float_value`: null on NaN/Infinity (overflow →
 *  String per §5.2 rule 14). */
export function parseFloatValue(bytes: Uint8Array, lo: number, hi: number): number | null {
    let text = decodeAsciiish(bytes, lo, hi);
    if (text.indexOf("_") !== -1) text = text.replace(/_/g, "");
    const v = Number(text);
    if (Number.isNaN(v) || !Number.isFinite(v)) return null;
    return v;
}

function decodeAsciiish(bytes: Uint8Array, lo: number, hi: number): string {
    // Float literal grammar is pure ASCII by construction.
    let out = "";
    for (let i = lo; i < hi; i++) out += String.fromCharCode(bytes[i]!);
    return out;
}

// ---------------------------------------------------------------------------
// Shortest round-trip digits + ryu pretty format + §5.9.8 canonical form
// ---------------------------------------------------------------------------

/** Decompose a finite non-zero double into its shortest round-trip
 *  digits: `sign * 0.<digits> * 10^e10` (JS `Number#toString` yields
 *  the same shortest-correctly-rounded digit sequence as ryu).
 *  SIGN HANDLED ONCE: callers strip the sign via `neg = v < 0` and
 *  prefix "-" themselves, so this works on `Math.abs(v)` — a '-' must
 *  never leak into `digits` (it would double the sign downstream). */
function shortestDigits(v: number): { digits: string; e10: number } {
    const a = Math.abs(v); // callers guarantee v !== 0 (finite, nonzero)
    let s = String(a);
    let exp = 0;
    const ePos = s.indexOf("e");
    if (ePos !== -1) {
        exp = parseInt(s.slice(ePos + 1), 10);
        s = s.slice(0, ePos);
    }
    const dot = s.indexOf(".");
    let intPart: string;
    let fracPart: string;
    if (dot === -1) {
        intPart = s;
        fracPart = "";
    } else {
        intPart = s.slice(0, dot);
        fracPart = s.slice(dot + 1);
    }
    let digits = (intPart + fracPart).replace(/^0+/, "");
    if (digits === "") return { digits: "0", e10: 0 };
    // Leading zeros stripped from the raw digit string shift the
    // decimal exponent left by exactly that count.
    const rawDigits = intPart + fracPart;
    const stripped = rawDigits.length - digits.length;
    const e10 = exp + intPart.length - stripped;
    return { digits, e10 };
}

/**
 * The ryu pretty format of a finite double (`format64` in
 * ryu/src/pretty/mod.rs): "0.0"/"-0.0" for zero, plain decimal inside
 * the fixed window, otherwise shortest scientific with lowercase `e`
 * and no `+`.
 */
export function ryuFormat(v: number): string {
    const neg = v < 0 || Object.is(v, -0);
    if (v === 0) return neg ? "-0.0" : "0.0";
    const { digits, e10 } = shortestDigits(v);
    const len = digits.length;
    const k = e10 - len; // value = digits * 10^k
    const kk = e10;
    let body: string;
    if (k >= 0 && kk <= 16) {
        body = digits + "0".repeat(kk - len) + ".0";
    } else if (kk > 0 && kk <= 16) {
        body = digits.slice(0, kk) + "." + digits.slice(kk);
    } else if (kk > -5 && kk <= 0) {
        body = "0." + "0".repeat(-kk) + digits;
    } else if (len === 1) {
        body = digits + "e" + String(kk - 1);
    } else {
        body = digits.slice(0, 1) + "." + digits.slice(1) + "e" + String(kk - 1);
    }
    return neg ? "-" + body : body;
}

/**
 * §5.9.8 canonical float form (canonical/num.rs `canonical_float`):
 * scientific when abs(value) >= 1e7 or 0 < abs(value) < 1e-2;
 * otherwise the ryu decimal form unchanged. `s` must be a ryu-format
 * string. (Non-finite never reaches here — the grammar rejects them.)
 */
export function canonicalFloat(s: string): string {
    const v = Number(s);
    if (v === 0) return s; // ±0.0 kept as-is
    const abs = Math.abs(v);
    if (!(abs >= 1e-2 && abs < 1e7)) {
        // Scientific branch: normalise the shortest digits to
        // d[.ddd]e<exp> with no '+' and no trailing mantissa zeros.
        const { digits, e10 } = shortestDigits(v);
        const mantissa = digits.length > 1 ? digits.replace(/0+$/, "") : digits;
        const mant =
            mantissa.length === 1 ? mantissa : mantissa[0] + "." + mantissa.slice(1);
        return (v < 0 ? "-" : "") + mant + "e" + String(e10 - 1);
    }
    return s;
}
