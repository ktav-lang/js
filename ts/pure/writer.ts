// Canonical (§5.9) and pretty writers over the internal value tree —
// ported from `rust/src/document/render/{helpers,canonical,emitters,
// representable}`. The pretty writers back `dumps` /
// `stringifyForceStrings` (render::render); the canonical writer backs
// `emitCanonical` / `canonicalFromSource` (render::emit_canonical).
//
// Output is amortized: a chunk array joined once, linear in output size.

import { isPairShape } from "./classify.js";
import { canonicalFloat } from "./numbers.js";
// Re-export for formatter.ts (writer is the shared §5.9 façade).
export { canonicalFloat };
import { forcedStringText } from "./ktavvalue.js";
import { KtavError } from "../internal/api.js";
import type { V, VCompound } from "./values.js";

// ---------------------------------------------------------------------------
// §5.9.0 writer-time errors — envelope.rs `from_error` wire contract
// ---------------------------------------------------------------------------

export type ReasonCodeName =
    | "ScalarRoot"
    | "EmptyKeyName"
    | "NonFiniteFloat"
    | "CRByte"
    | "BothFormsRequired"
    | "TrailingWhitespaceCollision"
    | "LeadingWhitespaceCollision";

/** ReasonCode Display renderings — error/error/display.rs, byte-exact. */
const REASON_DISPLAY: Record<ReasonCodeName, string> = {
    ScalarRoot:
        "ScalarRoot: the document root is not an Object or an Array (spec \u00A7 5.9.0)",
    EmptyKeyName:
        "EmptyKeyName: an Object pair's name is the empty string (spec \u00A7 5.9.0)",
    NonFiniteFloat: "NonFiniteFloat: a Float is NaN or \u00B1Infinity (spec \u00A7 5.9.0)",
    CRByte: "CRByte: a String contains a CR byte (spec \u00A7 5.9.0 / \u00A7 5.9.7)",
    BothFormsRequired:
        "BothFormsRequired: the multi-line String needs both forms, a segment trimming to '))' and a segment trimming to ')' (spec \u00A7 5.9.7)",
    TrailingWhitespaceCollision:
        "TrailingWhitespaceCollision: a segment trims to '))' and some content line has trailing whitespace (spec \u00A7 5.9.7)",
    LeadingWhitespaceCollision:
        "LeadingWhitespaceCollision: a segment trims to '))' and every non-blank segment shares leading whitespace at the same position (spec \u00A7 5.9.7)",
};

function specSectionOf(code: ReasonCodeName): string {
    return code === "CRByte" || code === "BothFormsRequired" ||
            code === "TrailingWhitespaceCollision" ||
            code === "LeadingWhitespaceCollision"
        ? "\u00A75.9.7"
        : "\u00A75.9.0";
}

/** Rust `{:?}` of a String — Debug escaping (control → `\u{hex}`). */
function rustDebugStr(s: string): string {
    let out = '"';
    for (const c of s) {
        const cp = c.codePointAt(0)!;
        if (c === '"') out += '\\"';
        else if (c === "\\") out += "\\\\";
        else if (c === "\n") out += "\\n";
        else if (c === "\r") out += "\\r";
        else if (c === "\t") out += "\\t";
        else if (cp < 0x20 || cp === 0x7f) out += `\\u{${cp.toString(16)}}`;
        else out += c;
    }
    return out + '"';
}

/** Error::UnrepresentableAt { code, path } → envelope + Display message. */
export function unrepresentableAt(code: ReasonCodeName, path: string[]): never {
    let message = REASON_DISPLAY[code];
    if (path.length > 0) {
        message += " at [" + path.map(rustDebugStr).join(", ") + "]";
    }
    throw new KtavError({
        error: "UnrepresentableAt",
        reason: code,
        line: null,
        line_text: null,
        span: null,
        path,
        body: null,
        canonical: null,
        spec_section: specSectionOf(code),
        message,
    });
}

/** Internal control-flow signal: a path-less §5.9.0 rejection raised
 *  mid-emission; converted to UnrepresentableAt by attachPath. */
class WriterSignal extends Error {
    constructor(readonly code: ReasonCodeName) {
        super(code);
    }
}

function sig(code: ReasonCodeName): never {
    throw new WriterSignal(code);
}

/** The reason code if `e` is a writer emission signal, else null —
 *  lets the formatter share the §5.9.0 signal protocol. */
export function writerSignalCode(e: unknown): ReasonCodeName | null {
    return e instanceof WriterSignal ? e.code : null;
}

// ---------------------------------------------------------------------------
// §3.3 whitespace views (whitespace.rs) — code-point level
// ---------------------------------------------------------------------------

const INLINE_WS_CP = new Set<number>([
    0x09, 0x0b, 0x0c, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
    0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

function isInlineWs(cp: number): boolean {
    return INLINE_WS_CP.has(cp);
}

function isKtavWs(cp: number): boolean {
    return cp === 0x0a || cp === 0x0d || INLINE_WS_CP.has(cp);
}

function firstCp(s: string): number | undefined {
    return s.codePointAt(0);
}

function lastCp(s: string): number | undefined {
    if (s.length === 0) return undefined;
    let i = s.length - 1;
    while (i > 0 && (s.charCodeAt(i) & 0xfc00) === 0xdc00) i--;
    return s.codePointAt(i);
}

/** Longest code-point leading-whitespace run (whitespace.rs
 *  `leading_whitespace_run`, UTF-16 view). */
export function leadingRunLen(s: string): number {
    let i = 0;
    while (i < s.length) {
        const cp = s.codePointAt(i)!;
        if (!isInlineWs(cp)) break;
        i += cp > 0xffff ? 2 : 1;
    }
    return i;
}

/** Longest common code-point prefix of two leading runs, capped
 *  (whitespace.rs `shared_prefix_bytes`). */
export function sharedPrefix(a: string, b: string, cap: number): number {
    const lim = Math.min(cap, a.length, b.length);
    let i = 0;
    while (i < lim && a.charCodeAt(i) === b.charCodeAt(i) && a.charCodeAt(i) < 0x80) i++;
    if (i < lim && a.charCodeAt(i) >= 0x80) {
        while (i < lim) {
            const ca = a.codePointAt(i)!;
            const cb = b.codePointAt(i)!;
            if (ca !== cb) break;
            i += ca > 0xffff ? 2 : 1;
        }
    }
    return i;
}

/** §5.6 common leading-whitespace prefix length over the non-blank
 *  lines of `s` (code-point units; only compared to zero here). */
function commonIndentLen(s: string): number {
    let first: string | null = null;
    for (const line of s.split("\n")) {
        if (trimKtav(line).length === 0) continue;
        first = line.slice(0, leadingRunLen(line));
        break;
    }
    if (first === null) return 0;
    let len = leadingRunLen(first);
    for (const line of s.split("\n")) {
        if (trimKtav(line).length === 0) continue;
        len = sharedPrefix(first, line, len);
        if (len === 0) break;
    }
    return len;
}

/** `str::trim_matches(is_ktav_whitespace)` — full §3.3 set. */
function trimKtav(s: string): string {
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
        const cp = s.codePointAt(lo)!;
        if (!isKtavWs(cp)) break;
        lo += cp > 0xffff ? 2 : 1;
    }
    while (hi > lo) {
        let start = hi - 1;
        while (start > lo && (s.charCodeAt(start) & 0xfc00) === 0xdc00) start--;
        const cp = s.codePointAt(start)!;
        if (!isKtavWs(cp)) break;
        hi = start;
    }
    return s.slice(lo, hi);
}

/** `trim_matches(is_inline_whitespace)` — line-bounded view. */
function trimInline(s: string): string {
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
        const cp = s.codePointAt(lo)!;
        if (!isInlineWs(cp)) break;
        lo += cp > 0xffff ? 2 : 1;
    }
    while (hi > lo) {
        let start = hi - 1;
        while (start > lo && (s.charCodeAt(start) & 0xfc00) === 0xdc00) start--;
        const cp = s.codePointAt(start)!;
        if (!isInlineWs(cp)) break;
        hi = start;
    }
    return s.slice(lo, hi);
}

// ---------------------------------------------------------------------------
// helpers.rs — key emission (§5.9.10)
// ---------------------------------------------------------------------------

function pushUnicodeEscape(out: string[], cp: number): void {
    out.push(`\\u${cp.toString(16).toUpperCase().padStart(4, "0")}`);
}

/** helpers.rs `push_escaped_key_segment` — bare/quoted form selection
 *  plus the matching re-escape recipe, in one pass. */
export function pushEscapedKeySegment(key: string, rootFirstKey: boolean, out: string[]): void {
    const first = firstCp(key);
    if (
        first === 0x22 || first === 0x27 || first === 0x60 ||
        (rootFirstKey && first === 0xfeff) ||
        key.startsWith("##")
    ) {
        pushQuotedKey(key, out);
        return;
    }
    if ((first !== undefined && isInlineWs(first)) || (lastCp(key) !== undefined && isInlineWs(lastCp(key)!))) {
        pushQuotedKey(key, out);
        return;
    }
    let needsRewrite = false;
    for (const ch of key) {
        switch (ch) {
            case ".":
            case ":":
            case ",":
            case "{":
            case "}":
            case "[":
            case "]":
            case "(":
            case ")":
                pushQuotedKey(key, out);
                return;
            case "\\":
            case "\n":
            case "\r":
            case "\u007f":
                needsRewrite = true;
                break;
            default: {
                const cp = ch.codePointAt(0)!;
                if (cp < 0x20 && cp !== 0x09 && cp !== 0x0b && cp !== 0x0c) needsRewrite = true;
            }
        }
    }
    if (needsRewrite) {
        pushBareKeyEscaped(key, out);
    } else {
        out.push(key);
    }
}

function pushBareKeyEscaped(key: string, out: string[]): void {
    const cps = Array.from(key);
    const lastIdx = cps.length - 1;
    for (let i = 0; i < cps.length; i++) {
        const ch = cps[i]!; // i < cps.length
        const atEdge = i === 0 || i === lastIdx;
        const cp = ch.codePointAt(0)!;
        if (ch === "\\") out.push("\\\\");
        else if (ch === "\n") out.push("\\n");
        else if (ch === "\r") out.push("\\r");
        else if (isKtavWs(cp)) {
            if (atEdge) pushUnicodeEscape(out, cp);
            else out.push(ch);
        }
        else if (ch === ".") out.push("\\.");
        else if (ch === ":") out.push("\\:");
        else if (ch === ",") out.push("\\,");
        else if (ch === "{") out.push("\\{");
        else if (ch === "}") out.push("\\}");
        else if (ch === "[") out.push("\\[");
        else if (ch === "]") out.push("\\]");
        else if (cp < 0x20 || cp === 0x7f) pushUnicodeEscape(out, cp);
        else out.push(ch);
    }
}

function pushQuotedKey(key: string, out: string[]): void {
    out.push('"');
    for (const ch of key) {
        const cp = ch.codePointAt(0)!;
        if (ch === '"') out.push('\\"');
        else if (ch === "\\") out.push("\\\\");
        else if (ch === "\n") out.push("\\n");
        else if (ch === "\r") out.push("\\r");
        else if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0b && cp !== 0x0c) || cp === 0x7f) {
            pushUnicodeEscape(out, cp);
        } else out.push(ch);
    }
    out.push('"');
}

// ---------------------------------------------------------------------------
// helpers.rs — string form selection (§5.9.5/6/7)
// ---------------------------------------------------------------------------

/** helpers.rs `string_needs_multiline`. */
export function stringNeedsMultiline(s: string): boolean {
    const first = firstCp(s);
    const last = lastCp(s);
    if ((first !== undefined && isKtavWs(first)) || (last !== undefined && isKtavWs(last))) {
        return true;
    }
    for (let i = 0; i < s.length; i++) {
        const b = s.charCodeAt(i);
        if (b < 0x20 && b !== 0x09) return true;
    }
    return false;
}

/** classify.rs `matches_integer_grammar` — syntax only, no domain. */
function matchesIntegerGrammar(s: string): boolean {
    let i = 0;
    if (s[i] === "+" || s[i] === "-") i++;
    if (i >= s.length) return false;
    if (s[i] === "0" && i + 1 < s.length) {
        switch (s[i + 1]) {
            case "x":
                return checkDigits(s, i + 2, 16);
            case "o":
                return checkDigits(s, i + 2, 8);
            case "b":
                return checkDigits(s, i + 2, 2);
            default:
                break;
        }
    }
    return checkDigits(s, i, 10);
}

function digitVal(ch: string, radix: number): number {
    const c = ch.codePointAt(0)!;
    let v = -1;
    if (c >= 0x30 && c <= 0x39) v = c - 0x30;
    else if (c >= 0x61 && c <= 0x66) v = c - 0x61 + 10;
    else if (c >= 0x41 && c <= 0x46) v = c - 0x41 + 10;
    return v >= 0 && v < radix ? v : -1;
}

function checkDigits(s: string, lo: number, radix: number): boolean {
    if (lo >= s.length || digitVal(s[lo]!, radix) < 0) return false;
    let prevUnderscore = false;
    for (let i = lo + 1; i < s.length; i++) {
        const ch = s[i]!;
        if (ch === "_") {
            if (prevUnderscore) return false;
            prevUnderscore = true;
            continue;
        }
        prevUnderscore = false;
        if (digitVal(ch, radix) < 0) return false;
    }
    return !prevUnderscore;
}

/** classify.rs `is_float_literal` over a JS string (digits both sides
 *  of `.` + optional exponent, or digits + exponent). */
function isFloatLiteralStr(s: string): boolean {
    if (s.length === 0) return false;
    const first = s[0]!;
    if (!(first >= "0" && first <= "9") && first !== "+" && first !== "-") return false;
    if (!/[.eE]/.test(s)) return false;
    let i = 0;
    if (s[i] === "+" || s[i] === "-") i++;
    i = scanDec(s, i);
    if (i < 0) return false;
    if (i < s.length && s[i] === ".") {
        i = scanDec(s, i + 1);
        if (i < 0) return false;
        if (i < s.length && (s[i] === "e" || s[i] === "E")) {
            i = scanExp(s, i);
            if (i < 0) return false;
        }
        return i === s.length;
    }
    if (i < s.length && (s[i] === "e" || s[i] === "E")) {
        i = scanExp(s, i);
        if (i < 0) return false;
    }
    return i === s.length;
}

function scanDec(s: string, i: number): number {
    let digits = 0;
    while (i < s.length && s[i]! >= "0" && s[i]! <= "9") {
        i++;
        digits++;
    }
    return digits > 0 ? i : -1;
}

function scanExp(s: string, i: number): number {
    i++; // e/E
    if (i < s.length && (s[i] === "+" || s[i] === "-")) i++;
    return scanDec(s, i);
}

/** helpers.rs `needs_raw_marker` — §5.2 reclassification test. */
export function needsRawMarker(s: string): boolean {
    if (s.length === 0) return false;
    const first = s.charCodeAt(0);
    if (first === 0x20 || first === 0x09) {
        const t = trimInline(s);
        return t.startsWith("{") || t.startsWith("[") || needsRawMarkerContent(t);
    }
    if (first === 0x7b || first === 0x5b) return true;
    return needsRawMarkerContent(s);
}

function needsRawMarkerContent(s: string): boolean {
    if (
        s === "null" || s === "true" || s === "false" ||
        s === "(" || s === "((" || s === "()" || s === "(())"
    ) {
        return true;
    }
    return matchesIntegerGrammar(s) || isFloatLiteralStr(s);
}

/** helpers.rs `item_needs_raw_marker` — item-context collisions. */
export function itemNeedsRawMarker(s: string): boolean {
    return (
        needsRawMarker(s) || s.startsWith("##") || s.startsWith("::") ||
        s === "]" || s === "}"
    );
}

/** helpers.rs `bare_item_is_pair_candidate` — §5.0.1 rule 6 phase-1
 *  test, delegated to the parser's own scanner (over UTF-8 bytes). */
export function bareItemIsPairCandidate(s: string): boolean {
    return isPairShape(new TextEncoder().encode(s), 0, byteLen(s));
}

/** UTF-8 byte length of a JS string (browser-safe, no Buffer). */
function byteLen(s: string): number {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x80) n++;
        else if (c < 0x800) n += 2;
        else if (c >= 0xdc00 && c < 0xe000) continue; // low surrogate: counted with high
        else if (c >= 0xd800 && c < 0xdc00) n += 4;
        else n += 3;
    }
    return n;
}

export type MultilineForm = "verbatim" | "stripped";

/** helpers.rs `choose_multiline_form` — ok:false carries the §5.9.0
 *  collision code when neither form can hold `s` losslessly. */
export function chooseMultilineForm(
    s: string,
    preferStripped: boolean,
): { ok: true; form: MultilineForm } | { ok: false; code: ReasonCodeName } {
    let soleSingle = false;
    let soleDouble = false;
    let wsOnlyLine = false;
    let indentedLine = false;
    let trailingWsLine = false;
    for (const line of s.split("\n")) {
        const trimmed = trimInline(line);
        if (trimmed === ")") soleSingle = true;
        if (trimmed === "))") soleDouble = true;
        if (line.length === 0) continue;
        if (trimmed.length === 0) wsOnlyLine = true;
        else if (leadingRunLen(line) > 0) indentedLine = true;
        if (trimEndInline(line).length !== line.length) trailingWsLine = true;
    }
    const strippedSafe = !soleSingle && !wsOnlyLine && !indentedLine && !trailingWsLine;
    const verbatimOk = !soleDouble;
    if (preferStripped && strippedSafe) return { ok: true, form: "stripped" };
    if (verbatimOk) return { ok: true, form: "verbatim" };
    const hasCommonIndent = commonIndentLen(s) !== 0;
    const strippedLossless = !soleSingle && !wsOnlyLine && !hasCommonIndent && !trailingWsLine;
    if (strippedLossless) return { ok: true, form: "stripped" };
    const code = soleSingle
        ? "BothFormsRequired"
        : trailingWsLine
          ? "TrailingWhitespaceCollision"
          : "LeadingWhitespaceCollision";
    return { ok: false, code };
}

/** `trim_end_matches(is_inline_whitespace)`. */
function trimEndInline(s: string): string {
    let hi = s.length;
    while (hi > 0) {
        let start = hi - 1;
        while (start > 0 && (s.charCodeAt(start) & 0xfc00) === 0xdc00) start--;
        const cp = s.codePointAt(start)!;
        if (!isInlineWs(cp)) break;
        hi = start;
    }
    return s.slice(0, hi);
}

// ---------------------------------------------------------------------------
// Indentation (helpers.rs push_indent) — cached per level
// ---------------------------------------------------------------------------

const INDENT_CACHE: string[] = [""];

function indentFor(level: number): string {
    for (let i = INDENT_CACHE.length; i <= level; i++) {
        INDENT_CACHE[i] = INDENT_CACHE[i - 1] + "    ";
    }
    return INDENT_CACHE[level]!;
}

// ---------------------------------------------------------------------------
// §5.9.0 cold path — representable.rs `attach_path`
// ---------------------------------------------------------------------------

/** First §5.9.0 offense in document order, or null (cold path).
 *  EXPLICIT STACK — frames carry their own path (DFS pre-order, so
 *  the first hit in pop order is the first offense in document order,
 *  matching the recursive original). */
function findOffense(value: V, forceStrings: boolean, path: string[]): string[] | null {
    type Frame = { v: V; path: string[]; key: string | null };
    const stack: Frame[] = [{ v: value, path, key: null }];
    while (stack.length > 0) {
        const fr = stack.pop()!;
        if (fr.key !== null && fr.key.length === 0) return fr.path;
        switch (fr.v.t) {
            case "object": {
                const entries = Array.from(fr.v.v.entries());
                for (let i = entries.length - 1; i >= 0; i--) {
                    stack.push({
                        v: entries[i]![1],
                        path: fr.path.concat(entries[i]![0]),
                        key: entries[i]![0],
                    });
                }
                break;
            }
            case "array": {
                for (let i = fr.v.v.length - 1; i >= 0; i--) {
                    stack.push({ v: fr.v.v[i]!, path: fr.path, key: null });
                }
                break;
            }
            case "float":
                if (!forceStrings && !Number.isFinite(Number(fr.v.v))) return fr.path;
                break;
            case "string":
                if (fr.v.v.includes("\r")) return fr.path;
                if (stringNeedsMultiline(fr.v.v)) {
                    if (!chooseMultilineForm(fr.v.v, false).ok) return fr.path;
                }
                break;
            default:
                break;
        }
    }
    return null;
}

/** Convert an emission signal into the path-carrying envelope error. */
function attachPath(value: V, code: ReasonCodeName, forceStrings: boolean): never {
    const path = findOffense(value, forceStrings, []);
    unrepresentableAt(code, path ?? []);
}

// ---------------------------------------------------------------------------
// Shared emitters over a chunk buffer
// ---------------------------------------------------------------------------

type W = string[];

function pushIndent(out: W, level: number): void {
    if (level > 0) out.push(indentFor(level));
}

function isCompound(v: V): boolean {
    return v.t === "object" || v.t === "array";
}

// ---------------------------------------------------------------------------
// Pretty + canonical writers — render.rs (dumps / stringifyForceStrings)
// and canonical/walk.rs (emitCanonical), one shared EXPLICIT-STACK
// emitter (no recursion: block trees have no depth limit, so recursive
// emission could overflow the JS call stack). Task order reproduces
// the recursive emitters byte-for-byte.
// ---------------------------------------------------------------------------

type EmitTask =
    | { t: "pair"; key: string; v: V; indent: number; rootFirstKey: boolean }
    | { t: "item"; v: V; indent: number; rootFirst: boolean }
    | { t: "text"; chunks: string[] };

interface EmitterCfg {
    /** render::to_string_force_strings mode. */
    forceStrings: boolean;
    /** pretty float/string rendering vs canonical. */
    pretty: boolean;
}

function closeChunks(indent: number, closer: string): string[] {
    return indent > 0 ? [indentFor(indent), closer] : [closer];
}

/** Push an object's pairs (reversed) / an array's items (reversed)
 *  plus the closer task (pushed first → pops last). */
function pushCompoundTasks(
    stack: EmitTask[],
    v: VCompound,
    indent: number,
    ctx: "pair" | "item",
    out: W,
): void {
    const opener = ctx === "pair" ? ": " : "";
    if (v.t === "array") {
        const items = v.v;
        if (items.length === 0) {
            out.push(opener + "[]\n");
            return;
        }
        out.push(opener + "[\n");
        stack.push({ t: "text", chunks: closeChunks(indent, "]\n") });
        for (let i = items.length - 1; i >= 0; i--) {
            stack.push({ t: "item", v: items[i]!, indent: indent + 1, rootFirst: false });
        }
        return;
    }
    const pairs = Array.from(v.v.entries());
    if (pairs.length === 0) {
        out.push(opener + "{}\n");
        return;
    }
    out.push(opener + "{\n");
    stack.push({ t: "text", chunks: closeChunks(indent, "}\n") });
    for (let i = pairs.length - 1; i >= 0; i--) {
        stack.push({
            t: "pair",
            key: pairs[i]![0],
            v: pairs[i]![1],
            indent: indent + 1,
            rootFirstKey: false,
        });
    }
}

/** Emit a scalar / string leaf, or enqueue a compound's children.
 *  `prefix` is ": " in pair context, "" as an array item. */
function emitLeafOrCompound(
    stack: EmitTask[],
    cfg: EmitterCfg,
    v: V,
    indent: number,
    ctx: "pair" | "item",
    rootFirst: boolean,
    out: W,
): void {
    const prefix = ctx === "pair" ? ": " : "";
    switch (v.t) {
        case "null":
            out.push(prefix, "null\n");
            return;
        case "bool":
            out.push(prefix, v.v ? "true\n" : "false\n");
            return;
        case "int":
            out.push(prefix, v.v, "\n");
            return;
        case "float": {
            const text = cfg.pretty
                ? Number.isFinite(Number(v.v))
                    ? v.v
                    : sig("NonFiniteFloat")
                : requireFloat(v.v);
            out.push(prefix, text, "\n");
            return;
        }
        case "string":
            if (ctx === "pair") {
                if (cfg.pretty) emitStringInPairPretty(v.v, indent, out);
                else emitStringInPairCanonical(v.v, indent, out);
            } else if (cfg.pretty) {
                emitStringAsItemPretty(v.v, indent, rootFirst, out);
            } else {
                emitStringAsItemCanonical(v.v, indent, rootFirst, out);
            }
            return;
        case "array":
        case "object":
            pushCompoundTasks(stack, v, indent, ctx, out);
            return;
    }
}

/** The shared task loop. `rootTasks` are in document order. */
function runEmitter(rootTasks: EmitTask[], cfg: EmitterCfg, out: W): void {
    const stack: EmitTask[] = rootTasks.slice().reverse();
    while (stack.length > 0) {
        const task = stack.pop()!;
        if (task.t === "text") {
            out.push(...task.chunks);
            continue;
        }
        if (task.t === "pair") {
            if (task.key.length === 0) sig("EmptyKeyName");
            pushIndent(out, task.indent);
            pushEscapedKeySegment(task.key, task.rootFirstKey, out);
            if (cfg.forceStrings) {
                const text = forcedStringText(task.v);
                if (text !== null) {
                    if (cfg.pretty) emitStringInPairPretty(text, task.indent, out);
                    else emitStringInPairCanonical(text, task.indent, out);
                    continue;
                }
            }
            emitLeafOrCompound(stack, cfg, task.v, task.indent, "pair", false, out);
            continue;
        }
        pushIndent(out, task.indent);
        if (cfg.forceStrings) {
            const text = forcedStringText(task.v);
            if (text !== null) {
                if (cfg.pretty) emitStringAsItemPretty(text, task.indent, task.rootFirst, out);
                else emitStringAsItemCanonical(text, task.indent, task.rootFirst, out);
                continue;
            }
        }
        emitLeafOrCompound(stack, cfg, task.v, task.indent, "item", task.rootFirst, out);
    }
}

/** §5.0.1 root shape — emitRootPretty / emit_canonical's root switch.
 *  Exhaustive over `VCompound`: the `default` arm is statically
 *  unreachable (`never`). */
function rootTasks(value: VCompound, cfg: EmitterCfg): EmitTask[] {
    switch (value.t) {
        case "object": {
            const tasks: EmitTask[] = [];
            let first = true;
            for (const [k, v] of value.v) {
                tasks.push({ t: "pair", key: k, v, indent: 0, rootFirstKey: first });
                first = false;
            }
            return tasks;
        }
        case "array": {
            const items = value.v;
            if (items.length === 0) return [{ t: "text", chunks: ["[]\n"] }];
            if (isCompound(items[0]!)) {
                const tasks: EmitTask[] = [{ t: "text", chunks: ["[\n"] }];
                for (const item of items) {
                    tasks.push({ t: "item", v: item, indent: 1, rootFirst: false });
                }
                tasks.push({ t: "text", chunks: ["]\n"] });
                return tasks;
            }
            const tasks: EmitTask[] = [];
            for (let i = 0; i < items.length; i++) {
                tasks.push({ t: "item", v: items[i]!, indent: 0, rootFirst: i === 0 });
            }
            return tasks;
        }
        default: {
            // Exhaustiveness guard: VCompound has exactly these two arms.
            const _never: never = value;
            return _never;
        }
    }
}

/** render.rs `render` / `to_string_force_strings`. */
export function renderPretty(value: V, forceStrings: boolean): string {
    if (value.t !== "object" && value.t !== "array") {
        unrepresentableAt("ScalarRoot", []);
    }
    const root: VCompound = value;
    const out: W = [];
    const cfg: EmitterCfg = { forceStrings, pretty: true };
    try {
        runEmitter(rootTasks(root, cfg), cfg, out);
    } catch (e) {
        if (e instanceof WriterSignal) attachPath(value, e.code, forceStrings);
        throw e;
    }
    return out.join("");
}

/** pair.rs `render_string_in_pair` — pretty form prefers indented
 *  stripped multi-line, verbatim fallback. */
function emitStringInPairPretty(s: string, indent: number, out: W): void {
    if (s.includes("\r")) sig("CRByte");
    if (stringNeedsMultiline(s)) {
        const form = requireForm(s, true);
        if (form === "stripped") {
            out.push(": (\n");
            const contentIndent = indent + 1;
            for (const line of s.split("\n")) {
                if (line.length > 0) {
                    pushIndent(out, contentIndent);
                    out.push(line);
                }
                out.push("\n");
            }
            pushIndent(out, indent);
            out.push(")\n");
        } else {
            out.push(": ((\n", s, "\n");
            pushIndent(out, indent);
            out.push("))\n");
        }
        return;
    }
    out.push(needsRawMarker(s) ? ":: " : ": ", s, "\n");
}

/** array_item.rs `render_string_as_item`. */
function emitStringAsItemPretty(
    s: string,
    indent: number,
    isRootArrayFirst: boolean,
    out: W,
): void {
    if (s.includes("\r")) sig("CRByte");
    if (stringNeedsMultiline(s)) {
        const form = requireForm(s, true);
        if (form === "stripped") {
            out.push("(\n");
            const contentIndent = indent + 1;
            for (const line of s.split("\n")) {
                if (line.length > 0) {
                    pushIndent(out, contentIndent);
                    out.push(line);
                }
                out.push("\n");
            }
            pushIndent(out, indent);
            out.push(")\n");
        } else {
            out.push("((\n", s, "\n");
            pushIndent(out, indent);
            out.push("))\n");
        }
        return;
    }
    if (s.length === 0) {
        out.push("::\n");
        return;
    }
    if (
        itemNeedsRawMarker(s) ||
        (isRootArrayFirst && (bareItemIsPairCandidate(s) || s.charCodeAt(0) === 0xfeff))
    ) {
        out.push(":: ");
    }
    out.push(s, "\n");
}

function requireForm(s: string, preferStripped: boolean): MultilineForm {
    const r = chooseMultilineForm(s, preferStripped);
    if (!r.ok) sig(r.code);
    return r.form;
}

// ---------------------------------------------------------------------------
// Canonical writers — canonical/walk.rs (emitCanonical / canonicalFromSource)
// ---------------------------------------------------------------------------

/** canonical/walk.rs `emit_canonical` — same explicit-stack emitter
 *  as `renderPretty` (canonical mode). */
export function emitCanonicalV(value: V): string {
    if (value.t !== "object" && value.t !== "array") {
        unrepresentableAt("ScalarRoot", []);
    }
    const root: VCompound = value;
    const out: W = [];
    const cfg: EmitterCfg = { forceStrings: false, pretty: false };
    try {
        runEmitter(rootTasks(root, cfg), cfg, out);
    } catch (e) {
        if (e instanceof WriterSignal) attachPath(value, e.code, false);
        throw e;
    }
    return out.join("");
}

/** canonical/num.rs `canonical_float_checked` — non-finite rejects. */
export function requireFloat(s: string): string {
    const v = Number(s);
    if (Number.isNaN(v) || !Number.isFinite(v)) sig("NonFiniteFloat");
    return canonicalFloat(s);
}

/** canonical/strings.rs `emit_string_in_pair` — verbatim-preferred
 *  multi-line, body at indent 0 (§5.9.7). */
export function emitStringInPairCanonical(s: string, indent: number, out: W): void {
    if (s.length === 0) {
        out.push(":\n");
        return;
    }
    if (s.includes("\r")) sig("CRByte");
    if (stringNeedsMultiline(s)) {
        emitMultilineCanonical(s, indent, true, out);
        return;
    }
    out.push(needsRawMarker(s) ? ":: " : ": ", s, "\n");
}

/** canonical/strings.rs `emit_string_as_item`. */
export function emitStringAsItemCanonical(
    s: string,
    indent: number,
    isRootArrayFirst: boolean,
    out: W,
): void {
    if (s.length === 0) {
        out.push("::\n");
        return;
    }
    if (s.includes("\r")) sig("CRByte");
    if (stringNeedsMultiline(s)) {
        emitMultilineCanonical(s, indent, false, out);
        return;
    }
    if (
        itemNeedsRawMarker(s) ||
        (isRootArrayFirst && (bareItemIsPairCandidate(s) || s.charCodeAt(0) === 0xfeff))
    ) {
        out.push(":: ", s, "\n");
    } else {
        out.push(s, "\n");
    }
}

function emitMultilineCanonical(s: string, indent: number, isPair: boolean, out: W): void {
    const form = requireForm(s, false);
    if (form === "verbatim") {
        // Body at indent 0, byte-for-byte (§5.9.6).
        out.push(isPair ? ": ((\n" : "((\n", s, "\n");
        pushIndent(out, indent);
        out.push("))\n");
    } else {
        // Stripped fallback: an unindented line pins the dedent to 0.
        out.push(isPair ? ": (\n" : "(\n", s, "\n");
        pushIndent(out, indent);
        out.push(")\n");
    }
}
