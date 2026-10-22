// The line-oriented parser state machine — ported from
// `rust/src/document/parser/parser/mod.rs` (Parser), `parse_str.rs`
// (line splitting over LF / CR / CRLF with BOM skip) and
// `syntax/collecting.rs` (multi-line string collection / dedent).
//
// Block-context note: the multi-line frame stack has NO depth limit in
// the Rust core; only inline compounds are bounded (MAX_INLINE_DEPTH =
// 128, see inline.ts).

import {
    decodeRange,
    eqLit,
    leadingBomLen,
    startsWithLit,
    trimWs,
    trimWsEnd,
    trimWsStart,
} from "./bytes.js";
import { throwKtav, type ErrCtx, type Span } from "./errors.js";
import {
    classifyRootKind,
    classifySeparator,
    classifyValueStart,
    requireSepEnd,
    type RootResult,
    type ValueStart,
} from "./classify.js";
import { scanUnescapedColon } from "./lexer.js";
import { insertValue } from "./insert.js";
import { newObjectV, type V } from "./values.js";

type ObjFrame = {
    t: "object";
    pairs: Map<string, V>;
    /** Raw key text of the pair that opened the pending compound. */
    pendingKey: { lo: number; hi: number } | null;
    pendingKeySpan: Span | null;
};
type ArrFrame = { t: "array"; items: V[] };
type Frame = ObjFrame | ArrFrame;

type MultilineMode = "stripped" | "verbatim";

// §3.3 inline whitespace set, code-point view (whitespace.rs).
const INLINE_WS_CP = new Set<number>([
    0x09, 0x0b, 0x0c, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
    0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

function isWsChar(cp: number): boolean {
    return INLINE_WS_CP.has(cp);
}

/** UTF-16 length of the leading §3.3-whitespace run of `s`
 *  (whitespace.rs `leading_whitespace_run`, code-point view). */
export function leadingRunLen(s: string): number {
    let i = 0;
    while (i < s.length) {
        const cp = s.codePointAt(i)!;
        if (!isWsChar(cp)) break;
        i += cp > 0xffff ? 2 : 1;
    }
    return i;
}

/** Longest common code-point prefix of the two leading runs, capped
 *  at `cap` (whitespace.rs `shared_prefix_bytes`). */
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

/** Trim §3.3 whitespace from a JS string; returns UTF-16 bounds. */
function trimStringWs(s: string): [number, number] {
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
        const cp = s.codePointAt(lo)!;
        if (!isWsChar(cp)) break;
        lo += cp > 0xffff ? 2 : 1;
    }
    while (hi > lo) {
        let start = hi - 1;
        while (start > lo && (s.charCodeAt(start) & 0xfc00) === 0xdc00) start--;
        const cp = s.codePointAt(start)!;
        if (!isWsChar(cp)) break;
        hi = start;
    }
    return [lo, hi];
}

function trimEndWs(s: string): string {
    const [, hi] = trimStringWs(s);
    return s.slice(0, hi);
}

/**
 * Multi-line string finisher (collecting.rs `Collecting::finish`):
 * verbatim joins raw lines; stripped dedents the common leading
 * whitespace (code-point-for-code-point, §5.6) and trims each
 * non-blank line's trailing whitespace.
 */
export function finishMultiline(mode: MultilineMode, lines: string[]): string {
    if (mode === "verbatim") return lines.join("\n");
    if (lines.length === 1) {
        const [lo, hi] = trimStringWs(lines[0]!);
        return lines[0]!.slice(lo, hi);
    }
    // The common prefix is byte-identified across the first non-blank
    // line's run and every other non-blank line's run.
    let firstText: string | null = null;
    for (const l of lines) {
        const [lo, hi] = trimStringWs(l);
        if (lo < hi) {
            firstText = l.slice(0, leadingRunLen(l));
            break;
        }
    }
    if (firstText === null) return lines.map(() => "").join("\n");
    let common = leadingRunLen(firstText);
    for (const l of lines) {
        const [lo, hi] = trimStringWs(l);
        if (lo >= hi) continue;
        common = sharedPrefix(firstText, l, common);
        if (common === 0) break;
    }
    const out: string[] = [];
    for (const l of lines) {
        const [lo, hi] = trimStringWs(l);
        if (lo >= hi) {
            out.push(""); // blank line → empty
        } else if (common > 0 && l.length >= common) {
            out.push(trimEndWs(l.slice(common)));
        } else {
            out.push(trimEndWs(l.slice(0, hi)));
        }
    }
    return out.join("\n");
}

function otherError(line: number, message: string, span: Span, bytes: Uint8Array): never {
    // Parser-internal invariant (core's `Other` class — unreachable
    // for correct input; kept for parity).
    throwKtav({ k: "Other", line, message, span }, bytes, null);
}

export class KtavParser {
    private readonly strict: boolean;
    private readonly bytes: Uint8Array;
    private stack: Frame[] = [];
    private collecting: { mode: MultilineMode; lines: string[] } | null = null;
    private openerOffsets: number[] = [];
    private multilineOpener: number | null = null;
    private rootInitialized = false;
    private rootConsumed = false;
    private rootInlineValue: V | null = null;
    private rootIsExplicitCompound = false;

    constructor(strict: boolean, bytes: Uint8Array) {
        this.strict = strict;
        this.bytes = bytes;
    }

    /** Parse the whole validated buffer into the internal value tree. */
    run(): V {
        const bytes = this.bytes;
        const len = bytes.length;
        let lo = leadingBomLen(bytes);
        let lineNum = 0;
        for (;;) {
            let end = len;
            let next = -1;
            for (let i = lo; i < len; i++) {
                const b = bytes[i];
                if (b === 0x0a) {
                    end = i;
                    next = i + 1;
                    break;
                }
                if (b === 0x0d) {
                    // CR LF → one terminator; bare CR → one terminator.
                    end = i;
                    next = i + 1 < len && bytes[i + 1] === 0x0a ? i + 2 : i + 1;
                    break;
                }
            }
            lineNum++;
            this.handleLine(lo, end, lineNum);
            if (end === len) break;
            lo = next;
        }
        return this.finish(len);
    }

    finish(eofOffset: number): V {
        if (this.collecting !== null) {
            const start = this.multilineOpener ?? eofOffset;
            throwKtav(
                { k: "UnclosedCompound", kind: "multiline", span: { start, end: eofOffset } },
                this.bytes,
                null,
            );
        }
        if (this.stack.length > 1) {
            const kind = this.stack[this.stack.length - 1]!.t;
            const start = this.openerOffsets[this.openerOffsets.length - 1]!;
            throwKtav(
                { k: "UnclosedCompound", kind, span: { start, end: eofOffset } },
                this.bytes,
                null,
            );
        }
        // §6.1: an explicit root left open at EOF is an
        // UnclosedCompound; an implicit root frame legitimately stays.
        if (this.rootIsExplicitCompound && !this.rootConsumed) {
            const kind = this.stack[this.stack.length - 1]!.t;
            const start = this.openerOffsets[this.openerOffsets.length - 1]!;
            throwKtav(
                { k: "UnclosedCompound", kind, span: { start, end: eofOffset } },
                this.bytes,
                null,
            );
        }
        if (this.rootInlineValue !== null) return this.rootInlineValue;
        // Empty / comments-only document → empty Object root (rule 1).
        if (this.stack.length === 0) return newObjectV();
        const frame = this.stack.pop()!;
        return frame.t === "object"
            ? { t: "object", v: frame.pairs }
            : { t: "array", v: frame.items };
    }

    handleLine(lo: number, hi: number, lineNum: number): void {
        const bytes = this.bytes;
        const lineStart = lo;
        // Inside a multi-line string the line is raw content unless it
        // is the terminator — comments/brackets are NOT special here.
        if (this.collecting !== null) {
            const [tlo, thi] = trimWs(bytes, lo, hi);
            const term = this.collecting.mode === "stripped" ? ")" : "))";
            if (eqLit(bytes, tlo, thi, term)) {
                const finished = finishMultiline(
                    this.collecting.mode,
                    this.collecting.lines,
                );
                this.collecting = null;
                this.multilineOpener = null;
                this.attachScalarValue({ t: "string", v: finished }, lineNum, lineStart);
                return;
            }
            this.collecting.lines.push(decodeRange(bytes, lo, hi));
            return;
        }

        const [tlo, thi] = trimWs(bytes, lo, hi);
        if (tlo >= thi || startsWithLit(bytes, tlo, thi, "##")) {
            return;
        }

        const trimmedSpan: Span = { start: tlo, end: thi };

        // §5.0.1 — any content line after a consumed root is an orphan.
        if (this.rootConsumed) {
            throwKtav(
                {
                    k: "OrphanLineAfterTopLevelInline",
                    line: lineNum,
                    span: trimmedSpan,
                },
                bytes,
                null,
            );
        }

        // First content line establishes the root kind (§5.0.1).
        if (!this.rootInitialized) {
            this.rootInitialized = true;
            // `}` / `]` first content falls through to close-frame and
            // raises UnbalancedBracket against the empty stack.
            if (!eqLit(bytes, tlo, thi, "}") && !eqLit(bytes, tlo, thi, "]")) {
                const ctx: ErrCtx = { bytes, line: lineNum, span: trimmedSpan };
                const root: RootResult = classifyRootKind(bytes, tlo, thi, ctx, this.strict);
                switch (root.t) {
                    case "inlineObject":
                    case "inlineArray":
                        this.rootConsumed = true;
                        this.rootInlineValue = root.v;
                        return;
                    case "explicitObject":
                        this.rootIsExplicitCompound = true;
                        this.stack.push({
                            t: "object",
                            pairs: new Map(),
                            pendingKey: null,
                            pendingKeySpan: null,
                        });
                        this.openerOffsets.push(trimmedSpan.start);
                        return;
                    case "explicitArray":
                        this.rootIsExplicitCompound = true;
                        this.stack.push({ t: "array", items: [] });
                        this.openerOffsets.push(trimmedSpan.start);
                        return;
                    case "object":
                        this.stack.push({
                            t: "object",
                            pairs: new Map(),
                            pendingKey: null,
                            pendingKeySpan: null,
                        });
                        this.openerOffsets.push(0);
                        break;
                    case "array":
                        this.stack.push({ t: "array", items: [] });
                        this.openerOffsets.push(0);
                        break;
                }
            }
        }

        if (eqLit(bytes, tlo, thi, "}")) {
            this.closeFrame("object", lineNum, trimmedSpan);
            return;
        }
        if (eqLit(bytes, tlo, thi, "]")) {
            this.closeFrame("array", lineNum, trimmedSpan);
            return;
        }

        const top = this.stack[this.stack.length - 1];
        if (top !== undefined && top.t === "array") {
            this.handleArrayItem(tlo, thi, lineNum, trimmedSpan);
        } else {
            this.handleObjectPair(tlo, thi, lineNum, trimmedSpan);
        }
    }

    private attachScalarValue(value: V, lineNum: number, lineStart: number): void {
        const frame = this.stack[this.stack.length - 1]!;
        if (frame.t === "object") {
            const pending = frame.pendingKey;
            if (pending === null) {
                otherError(
                    lineNum,
                    `Line ${lineNum}: internal error \u{2014} multi-line string closed without pending key`,
                    { start: lineStart, end: lineStart },
                    this.bytes,
                );
            }
            frame.pendingKey = null;
            const keySpan =
                frame.pendingKeySpan ?? { start: lineStart, end: lineStart };
            frame.pendingKeySpan = null;
            insertValue(
                frame.pairs,
                this.bytes,
                pending.lo,
                pending.hi,
                value,
                { bytes: this.bytes, line: lineNum, span: keySpan },
                keySpan,
            );
        } else {
            frame.items.push(value);
        }
    }

    private handleObjectPair(
        tlo: number,
        thi: number,
        lineNum: number,
        trimmedSpan: Span,
    ): void {
        const bytes = this.bytes;
        const ctx: ErrCtx = { bytes, line: lineNum, span: trimmedSpan };
        // The pair separator is the first UNescaped `:` (§5.3); an
        // unterminated quoted segment swallows it (§5.3.3 / §6.16).
        const scan = scanUnescapedColon(bytes, tlo, thi);
        if (scan.t === "unterminated") {
            throwKtav(
                { k: "UnterminatedQuotedKey", line: lineNum, span: trimmedSpan },
                bytes,
                null,
            );
        }
        if (scan.t === "absent") {
            throwKtav(
                { k: "MissingSeparator", line: lineNum, span: trimmedSpan },
                bytes,
                null,
            );
        }
        const colon = scan.i;
        // Key = [tlo, colon) with trailing ws trimmed (the line is
        // pre-trimmed, so no leading ws is possible).
        const keyEnd = trimWsEnd(bytes, tlo, colon);
        const keyStart = tlo;
        if (keyEnd <= keyStart) {
            // The colon is the offending byte for `: value`.
            throwKtav(
                { k: "EmptyKey", line: lineNum, span: { start: keyStart, end: keyStart + 1 } },
                bytes,
                null,
            );
        }
        const keySpan: Span = { start: keyStart, end: keyEnd };

        const sep = classifySeparator(bytes, colon + 1, thi);
        requireSepEnd(bytes, sep.lo, sep.hi, ctx, sep.lo, trimmedSpan);
        if (sep.t === "raw") {
            const [vlo, vhi] = trimWs(bytes, sep.lo, sep.hi);
            this.insertObjectPair(
                { lo: keyStart, hi: keyEnd },
                { t: "string", v: decodeRange(bytes, vlo, vhi) },
                lineNum,
                keySpan,
            );
            return;
        }
        const vs: ValueStart = classifyValueStart(bytes, sep.lo, sep.hi, ctx, this.strict);
        this.applyValueStart(vs, { lo: keyStart, hi: keyEnd }, lineNum, keySpan, trimmedSpan);
    }

    private handleArrayItem(
        tlo: number,
        thi: number,
        lineNum: number,
        trimmedSpan: Span,
    ): void {
        const bytes = this.bytes;
        const ctx: ErrCtx = { bytes, line: lineNum, span: trimmedSpan };
        // The only array-item prefix marker is `::` (§5.4); a glued
        // form like `::value` is MissingSeparatorSpace (§6.10).
        if (startsWithLit(bytes, tlo, thi, "::")) {
            requireSepEnd(bytes, tlo + 2, thi, ctx, tlo + 2, trimmedSpan);
            const vlo = trimWsStart(bytes, tlo + 2, thi);
            this.pushArrayItem({ t: "string", v: decodeRange(bytes, vlo, thi) });
            return;
        }
        const vs = classifyValueStart(bytes, tlo, thi, ctx, this.strict);
        this.applyValueStart(vs, null, lineNum, trimmedSpan, trimmedSpan);
    }

    /** Route a classified value start; `key` is null on array items. */
    private applyValueStart(
        vs: ValueStart,
        key: { lo: number; hi: number } | null,
        lineNum: number,
        keySpan: Span,
        trimmedSpan: Span,
    ): void {
        switch (vs.t) {
            case "scalar":
                this.insertValueStart(key, { t: "string", v: decodeRange(this.bytes, vs.lo, vs.hi) }, lineNum, keySpan);
                return;
            case "null":
                this.insertValueStart(key, { t: "null" }, lineNum, keySpan);
                return;
            case "bool":
                this.insertValueStart(key, { t: "bool", v: vs.v }, lineNum, keySpan);
                return;
            case "int":
                this.insertValueStart(key, { t: "int", v: vs.v }, lineNum, keySpan);
                return;
            case "float":
                this.insertValueStart(key, { t: "float", v: vs.v }, lineNum, keySpan);
                return;
            case "emptyObject":
                this.insertValueStart(key, newObjectV(), lineNum, keySpan);
                return;
            case "emptyArray":
                this.insertValueStart(key, { t: "array", v: [] }, lineNum, keySpan);
                return;
            case "openObject":
            case "openArray": {
                if (key !== null) this.setPendingKey(key, keySpan, lineNum);
                this.stack.push(
                    vs.t === "openObject"
                        ? { t: "object", pairs: new Map(), pendingKey: null, pendingKeySpan: null }
                        : { t: "array", items: [] },
                );
                // The opener is the trailing `{`/`[` on the line.
                this.openerOffsets.push(trimmedSpan.end - 1);
                return;
            }
            case "openMultilineStripped":
                if (key !== null) this.setPendingKey(key, keySpan, lineNum);
                this.collecting = { mode: "stripped", lines: [] };
                this.multilineOpener = trimmedSpan.end - 1;
                return;
            case "openMultilineVerbatim":
                if (key !== null) this.setPendingKey(key, keySpan, lineNum);
                this.collecting = { mode: "verbatim", lines: [] };
                this.multilineOpener = trimmedSpan.end - 2;
                return;
            case "inline":
                this.insertValueStart(key, vs.v, lineNum, keySpan);
                return;
        }
    }

    private insertValueStart(
        key: { lo: number; hi: number } | null,
        value: V,
        lineNum: number,
        keySpan: Span,
    ): void {
        if (key === null) {
            this.pushArrayItem(value);
        } else {
            this.insertObjectPair(key, value, lineNum, keySpan);
        }
    }

    private insertObjectPair(
        key: { lo: number; hi: number },
        value: V,
        lineNum: number,
        keySpan: Span,
    ): void {
        const frame = this.stack[this.stack.length - 1]!;
        if (frame.t !== "object") return; // unreachable (dispatch invariant)
        insertValue(
            frame.pairs,
            this.bytes,
            key.lo,
            key.hi,
            value,
            { bytes: this.bytes, line: lineNum, span: keySpan },
            keySpan,
        );
    }

    private pushArrayItem(value: V): void {
        const frame = this.stack[this.stack.length - 1]!;
        if (frame.t === "array") {
            frame.items.push(value);
        }
    }

    private setPendingKey(
        key: { lo: number; hi: number },
        keySpan: Span,
        lineNum: number,
    ): void {
        const frame = this.stack[this.stack.length - 1]!;
        if (frame.t !== "object") return; // unreachable (dispatch invariant)
        if (frame.pendingKey !== null) {
            otherError(
                lineNum,
                `Line ${lineNum}: internal error \u{2014} pending key already set`,
                { start: keySpan.start, end: keySpan.start },
                this.bytes,
            );
        }
        frame.pendingKey = key;
        frame.pendingKeySpan = keySpan;
    }

    closeFrame(
        expected: "object" | "array",
        lineNum: number,
        trimmedSpan: Span,
    ): void {
        if (this.stack.length <= 1) {
            if (this.stack.length === 1 && this.rootIsExplicitCompound) {
                const frameKind = this.stack[0]!.t;
                if (frameKind !== expected) {
                    throwKtav(
                        {
                            k: "UnbalancedBracket",
                            line: lineNum,
                            span: trimmedSpan,
                            expected: frameKind,
                            found: expected === "object" ? "}" : "]",
                        },
                        this.bytes,
                        null,
                    );
                }
                // Root consumed — subsequent content lines are orphans.
                this.rootConsumed = true;
                return;
            }
            throwKtav(
                {
                    k: "UnbalancedBracket",
                    line: lineNum,
                    span: trimmedSpan,
                    expected,
                    found: expected === "object" ? "}" : "]",
                },
                this.bytes,
                null,
            );
        }
        const frame = this.stack.pop()!;
        this.openerOffsets.pop();
        if (frame.t !== expected) {
            throwKtav(
                {
                    k: "UnbalancedBracket",
                    line: lineNum,
                    span: trimmedSpan,
                    expected: frame.t,
                    found: expected === "object" ? "}" : "]",
                },
                this.bytes,
                null,
            );
        }
        const value: V =
            frame.t === "object"
                ? { t: "object", v: frame.pairs }
                : { t: "array", v: frame.items };
        this.attachChildValue(value, lineNum, trimmedSpan);
    }

    private attachChildValue(value: V, lineNum: number, trimmedSpan: Span): void {
        const frame = this.stack[this.stack.length - 1]!;
        if (frame.t === "object") {
            const pending = frame.pendingKey;
            if (pending === null) {
                otherError(
                    lineNum,
                    `Line ${lineNum}: internal error \u{2014} closed compound without pending key`,
                    trimmedSpan,
                    this.bytes,
                );
            }
            frame.pendingKey = null;
            // Prefer the key's own span so duplicate-key errors point
            // at the key instead of the closing brace.
            const keySpan = frame.pendingKeySpan ?? trimmedSpan;
            frame.pendingKeySpan = null;
            insertValue(
                frame.pairs,
                this.bytes,
                pending.lo,
                pending.hi,
                value,
                { bytes: this.bytes, line: lineNum, span: keySpan },
                keySpan,
            );
        } else {
            frame.items.push(value);
        }
    }
}
