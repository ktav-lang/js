// Comment-preserving formatter — ported from
// `rust/src/document/parser/fmt_parser/{mod,positioned,frame,doc}.rs`
// and `render/formatted.rs`. Mirrors the plain parser's line dispatch
// exactly (same errors via the shared classify/lexer modules), but
// every comment / blank line is attached to the construct that follows
// it and re-emitted at that construct's indent.

import { decodedPathSegments } from "./insert.js";
import { decodeRange, eqLit, leadingBomLen, startsWithLit, trimWs, trimWsEnd, trimWsStart, validateUtf8 } from "./bytes.js";
import { throwKtav, type ErrCtx, type Span } from "./errors.js";
import {
    classifyRootKind,
    classifySeparator,
    classifyValueStart,
    requireSepEnd,
    type RootResult,
    type ValueStart,
} from "./classify.js";
import {
    checkKey,
    decodeKeySegment,
    keyIsSingleSegment,
    scanUnescapedColon,
    splitKeyPath,
} from "./lexer.js";
import { finishMultiline } from "./parser.js";
import {
    canonicalFloat,
    chooseMultilineForm,
    emitStringAsItemCanonical,
    emitStringInPairCanonical,
    pushEscapedKeySegment,
    stringNeedsMultiline,
    unrepresentableAt,
    writerSignalCode,
    materializePath,
    type PathNode,
    type ReasonCodeName,
} from "./writer.js";

// ---------------------------------------------------------------------------
// Trivia-carrying value tree (fmt_parser/doc.rs)
// ---------------------------------------------------------------------------

export type TriviaLine = { k: "blank" } | { k: "comment"; text: string };
type Trivia = TriviaLine[];

export type PValue =
    | { t: "null" }
    | { t: "bool"; v: boolean }
    | { t: "int"; v: string }
    | { t: "float"; v: string }
    | { t: "string"; v: string }
    | { t: "array"; items: Array<[Trivia, PValue]>; trailing: Trivia }
    | { t: "object"; pairs: Map<string, [Trivia, PValue]>; trailing: Trivia };

/** Compound view + frame-table views (narrowing without casts). */
type PCompound = Extract<PValue, { t: "object" } | { t: "array" }>;
type PObject = Extract<PCompound, { t: "object" }>;
type PArray = Extract<PCompound, { t: "array" }>;

interface FmtDoc {
    leading: Trivia;
    root: PValue;
}

function newPObject(): PObject {
    return { t: "object", pairs: new Map(), trailing: [] };
}

function newPArray(): PArray {
    return { t: "array", items: [], trailing: [] };
}

function kindLabelP(v: PValue): string {
    switch (v.t) {
        case "null": return "null";
        case "bool": return "bool";
        case "int": return "integer";
        case "float": return "float";
        case "string": return "string";
        case "array": return "array";
        case "object": return "object";
    }
}

function isObjectP(v: [Trivia, PValue]): boolean {
    return v[1].t === "object";
}

// ---------------------------------------------------------------------------
// Dotted insertion over PObject — insert.rs / insert.ts semantics.
// ---------------------------------------------------------------------------

function rawPathSegmentsP(bytes: Uint8Array, lo: number, hi: number): string[] {
    return splitKeyPath(bytes, lo, hi).map(([slo, shi]) => decodeRange(bytes, slo, shi));
}

function insertP(
    table: PObject,
    bytes: Uint8Array,
    pathLo: number,
    pathHi: number,
    value: [Trivia, PValue],
    ctx: ErrCtx,
    keySpan: Span,
): void {
    if (keyIsSingleSegment(bytes, pathLo, pathHi)) {
        const [klo, khi] = trimWs(bytes, pathLo, pathHi);
        if (klo >= khi || checkKey(bytes, klo, khi) === "empty") {
            throwKtav({ k: "EmptyKey", line: ctx.line, span: keySpan }, bytes, null);
        }
        if (checkKey(bytes, klo, khi) === "invalid") {
            throwKtav(
                { k: "InvalidKey", line: ctx.line, key: decodeRange(bytes, pathLo, pathHi), span: keySpan },
                bytes,
                rawPathSegmentsP(bytes, pathLo, pathHi),
            );
        }
        const decoded = decodeKeySegment(bytes, klo, khi, ctx);
        const existing = table.pairs.get(decoded);
        if (existing !== undefined) {
            if (isObjectP(existing) !== isObjectP(value)) {
                throwKtav(
                    {
                        k: "KeyPathConflict",
                        line: ctx.line,
                        path: decodeRange(bytes, pathLo, pathHi),
                        span: keySpan,
                        conflict: {
                            t: "overwrite",
                            existing: kindLabelP(existing[1]),
                            newKind: kindLabelP(value[1]),
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
        table.pairs.set(decoded, value);
        return;
    }
    const segments = splitKeyPath(bytes, pathLo, pathHi);
    let cur: PObject = table;
    for (let idx = 0; idx < segments.length; idx++) {
        const [slo, shi] = segments[idx]!; // idx < segments.length
        const [tlo, thi] = trimWs(bytes, slo, shi);
        if (tlo >= thi || checkKey(bytes, tlo, thi) === "empty") {
            throwKtav({ k: "EmptyKey", line: ctx.line, span: keySpan }, bytes, null);
        }
        if (checkKey(bytes, tlo, thi) === "invalid") {
            throwKtav(
                { k: "InvalidKey", line: ctx.line, key: decodeRange(bytes, pathLo, pathHi), span: keySpan },
                bytes,
                rawPathSegmentsP(bytes, pathLo, pathHi),
            );
        }
        const decoded = decodeKeySegment(bytes, tlo, thi, ctx);
        if (idx + 1 < segments.length) {
            const existing = cur.pairs.get(decoded);
            if (existing === undefined) {
                const subTable: PObject = newPObject();
                const sub: [Trivia, PValue] = [
                    [], { t: "object", pairs: subTable.pairs, trailing: subTable.trailing },
                ];
                cur.pairs.set(decoded, sub);
                cur = subTable;
            } else if (existing[1].t === "object") {
                cur = existing[1];
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
            if (cur.pairs.has(decoded)) {
                throwKtav(
                    { k: "DuplicateKey", line: ctx.line, key: decodeRange(bytes, pathLo, pathHi), span: keySpan },
                    bytes,
                    decodedPathSegments(bytes, pathLo, pathHi, ctx),
                );
            }
            cur.pairs.set(decoded, value);
            return;
        }
    }
}

/** doc.rs `stamp` — a plain `Value` wrapped into the trivia tree with
 *  empty trivia throughout. Sound because a comment can never occur
 *  inside an inline compound (§3.4). */
function stampP(v: import("./values.js").V): PValue {
    switch (v.t) {
        case "null":
        case "bool":
        case "int":
        case "float":
        case "string":
            return v;
        case "array":
            return {
                t: "array",
                items: v.v.map((item): [Trivia, PValue] => [[], stampP(item)]),
                trailing: [],
            };
        case "object": {
            const pairs = new Map<string, [Trivia, PValue]>();
            for (const [k, val] of v.v) pairs.set(k, [[], stampP(val)]);
            return { t: "object", pairs, trailing: [] };
        }
    }
}

// ---------------------------------------------------------------------------
// PositionedParser (fmt_parser/positioned.rs)
// ---------------------------------------------------------------------------
type PFrame =
    | {
          t: "object";
          table: PObject;
          pendingKey: { lo: number; hi: number } | null;
          pendingKeySpan: Span | null;
          pendingKeyTrivia: Trivia;
          atStart: boolean;
      }
    | { t: "array"; table: PArray; pendingItemTrivia: Trivia; atStart: boolean };

/** Drop trailing Blanks where a run becomes a `trailing` bucket. */
function trimTrailingBlanks(trivia: Trivia): Trivia {
    const out = trivia.slice();
    while (out.length > 0 && out[out.length - 1]!.k === "blank") out.pop();
    return out;
}

class PositionedParser {
    private readonly bytes: Uint8Array;
    private readonly strict: boolean;
    private stack: PFrame[] = [];
    private collecting: { mode: "stripped" | "verbatim"; lines: string[] } | null = null;
    private openerOffsets: number[] = [];
    private multilineOpener: number | null = null;
    private rootInitialized = false;
    private rootConsumed = false;
    private rootInlineValue: PValue | null = null;
    private rootIsExplicitCompound = false;
    private pendingTrivia: Trivia = [];
    private docLeading: Trivia = [];

    constructor(strict: boolean, bytes: Uint8Array) {
        this.strict = strict;
        this.bytes = bytes;
    }

    private currentAtStart(): boolean {
        const top = this.stack[this.stack.length - 1];
        if (top === undefined) return !this.rootInitialized;
        return top.atStart;
    }

    private pushBlankTrivia(): void {
        if (this.pendingTrivia.length === 0 && this.currentAtStart()) return;
        if (this.pendingTrivia[this.pendingTrivia.length - 1]?.k === "blank") return;
        this.pendingTrivia.push({ k: "blank" });
    }

    run(): FmtDoc {
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

    private finish(eofOffset: number): FmtDoc {
        const bytes = this.bytes;
        if (this.collecting !== null) {
            const start = this.multilineOpener ?? eofOffset;
            throwKtav(
                { k: "UnclosedCompound", kind: "multiline", span: { start, end: eofOffset } },
                bytes,
                null,
            );
        }
        if (this.stack.length > 1 || (this.rootIsExplicitCompound && !this.rootConsumed)) {
            const kind = this.stack[this.stack.length - 1]!.t;
            const start = this.openerOffsets[this.openerOffsets.length - 1]!;
            throwKtav(
                { k: "UnclosedCompound", kind, span: { start, end: eofOffset } },
                bytes,
                null,
            );
        }
        const eofTrivia = trimTrailingBlanks(this.pendingTrivia);
        const rv = this.rootInlineValue;
        // Invariant: set only from `stampP` of an inline compound.
        if (rv !== null && (rv.t === "array" || rv.t === "object")) rv.trailing.push(...eofTrivia);
        if (rv !== null) return { leading: this.docLeading, root: rv };
        if (this.stack.length === 0) {
            return { leading: this.docLeading.concat(eofTrivia), root: newPObject() };
        }
        const frame = this.stack.pop()!;
        const root: PValue =
            frame.t === "object"
                ? { t: "object", pairs: frame.table.pairs, trailing: frame.table.trailing }
                : { t: "array", items: frame.table.items, trailing: frame.table.trailing };
        root.trailing.push(...eofTrivia);
        return { leading: this.docLeading, root };
    }

    private handleLine(lo: number, hi: number, lineNum: number): void {
        const bytes = this.bytes;
        const lineStart = lo;
        if (this.collecting !== null) {
            const [tlo, thi] = trimWs(bytes, lo, hi);
            const term = this.collecting.mode === "stripped" ? ")" : "))";
            if (eqLit(bytes, tlo, thi, term)) {
                const finished = finishMultiline(this.collecting.mode, this.collecting.lines);
                this.collecting = null;
                this.multilineOpener = null;
                this.attachScalarValue({ t: "string", v: finished }, lineNum, lineStart);
                return;
            }
            this.collecting.lines.push(decodeRange(bytes, lo, hi));
            return;
        }

        const [tlo, thi] = trimWs(bytes, lo, hi);
        if (tlo >= thi) {
            this.pushBlankTrivia();
            return;
        }
        if (startsWithLit(bytes, tlo, thi, "##")) {
            this.pendingTrivia.push({ k: "comment", text: decodeRange(bytes, tlo, thi) });
            return;
        }

        const trimmedSpan: Span = { start: tlo, end: thi };

        if (this.rootConsumed) {
            throwKtav(
                { k: "OrphanLineAfterTopLevelInline", line: lineNum, span: trimmedSpan },
                bytes,
                null,
            );
        }

        if (!this.rootInitialized) {
            this.rootInitialized = true;
            if (!eqLit(bytes, tlo, thi, "}") && !eqLit(bytes, tlo, thi, "]")) {
                const ctx: ErrCtx = { bytes, line: lineNum, span: trimmedSpan };
                const root: RootResult = classifyRootKind(bytes, tlo, thi, ctx, this.strict);
                switch (root.t) {
                    case "inlineObject":
                    case "inlineArray":
                        this.rootConsumed = true;
                        this.docLeading = this.pendingTrivia;
                        this.pendingTrivia = [];
                        this.rootInlineValue = stampP(root.v);
                        return;
                    case "explicitObject":
                        this.docLeading = this.pendingTrivia;
                        this.pendingTrivia = [];
                        this.rootIsExplicitCompound = true;
                        this.stack.push(this.newObjectFrame());
                        this.openerOffsets.push(trimmedSpan.start);
                        return;
                    case "explicitArray":
                        this.docLeading = this.pendingTrivia;
                        this.pendingTrivia = [];
                        this.rootIsExplicitCompound = true;
                        this.stack.push({ t: "array", table: newPArray(), pendingItemTrivia: [], atStart: true });
                        this.openerOffsets.push(trimmedSpan.start);
                        return;
                    case "object":
                        this.stack.push(this.newObjectFrame());
                        this.openerOffsets.push(0);
                        break;
                    case "array":
                        this.stack.push({ t: "array", table: newPArray(), pendingItemTrivia: [], atStart: true });
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

        const trivia = this.pendingTrivia;
        this.pendingTrivia = [];
        const top = this.stack[this.stack.length - 1]!;
        top.atStart = false;
        if (top.t === "array") {
            this.handleArrayItem(tlo, thi, lineNum, trimmedSpan, trivia);
        } else {
            this.handleObjectPair(tlo, thi, lineNum, trimmedSpan, trivia);
        }
    }

    private newObjectFrame(): PFrame {
        return {
            t: "object",
            table: newPObject(),
            pendingKey: null,
            pendingKeySpan: null,
            pendingKeyTrivia: [],
            atStart: true,
        };
    }

    private attachScalarValue(value: PValue, lineNum: number, lineStart: number): void {
        const frame = this.stack[this.stack.length - 1]!;
        if (frame.t === "object") {
            const pending = frame.pendingKey;
            if (pending === null) {
                throwKtav(
                    {
                        k: "Other",
                        line: lineNum,
                        message: `Line ${lineNum}: internal error \u{2014} multi-line string closed without pending key`,
                        span: { start: lineStart, end: lineStart },
                    },
                    this.bytes,
                    null,
                );
            }
            frame.pendingKey = null;
            const keySpan = frame.pendingKeySpan ?? { start: lineStart, end: lineStart };
            frame.pendingKeySpan = null;
            const trivia = frame.pendingKeyTrivia;
            frame.pendingKeyTrivia = [];
            insertP(frame.table, this.bytes, pending.lo, pending.hi, [trivia, value], { bytes: this.bytes, line: lineNum, span: keySpan }, keySpan);
        } else {
            frame.table.items.push([frame.pendingItemTrivia, value]);
            frame.pendingItemTrivia = [];
        }
    }

    private handleObjectPair(
        tlo: number,
        thi: number,
        lineNum: number,
        trimmedSpan: Span,
        trivia: Trivia,
    ): void {
        const bytes = this.bytes;
        const ctx: ErrCtx = { bytes, line: lineNum, span: trimmedSpan };
        const scan = scanUnescapedColon(bytes, tlo, thi);
        if (scan.t === "unterminated") {
            throwKtav({ k: "UnterminatedQuotedKey", line: lineNum, span: trimmedSpan }, bytes, null);
        }
        if (scan.t === "absent") {
            throwKtav({ k: "MissingSeparator", line: lineNum, span: trimmedSpan }, bytes, null);
        }
        const colon = scan.i;
        const keyEnd = trimWsEnd(bytes, tlo, colon);
        const keyStart = tlo;
        if (keyEnd <= keyStart) {
            throwKtav(
                { k: "EmptyKey", line: lineNum, span: { start: keyStart, end: keyStart + 1 } },
                bytes,
                null,
            );
        }
        const keySpan: Span = { start: keyStart, end: keyEnd };
        const key = { lo: keyStart, hi: keyEnd };

        const sep = classifySeparator(bytes, colon + 1, thi);
        requireSepEnd(bytes, sep.lo, sep.hi, ctx, sep.lo, trimmedSpan);
        if (sep.t === "raw") {
            const [vlo, vhi] = trimWs(bytes, sep.lo, sep.hi);
            this.insertObjectPair(key, [trivia, { t: "string", v: decodeRange(bytes, vlo, vhi) }], lineNum, keySpan);
            return;
        }
        const vs: ValueStart = classifyValueStart(bytes, sep.lo, sep.hi, ctx, this.strict);
        this.applyValueStart(vs, key, lineNum, keySpan, trimmedSpan, trivia);
    }

    private handleArrayItem(
        tlo: number,
        thi: number,
        lineNum: number,
        trimmedSpan: Span,
        trivia: Trivia,
    ): void {
        const bytes = this.bytes;
        const ctx: ErrCtx = { bytes, line: lineNum, span: trimmedSpan };
        if (startsWithLit(bytes, tlo, thi, "::")) {
            requireSepEnd(bytes, tlo + 2, thi, ctx, tlo + 2, trimmedSpan);
            const vlo = trimWsStart(bytes, tlo + 2, thi);
            this.pushArrayItem([trivia, { t: "string", v: decodeRange(bytes, vlo, thi) }]);
            return;
        }
        const vs = classifyValueStart(bytes, tlo, thi, ctx, this.strict);
        this.applyValueStart(vs, null, lineNum, trimmedSpan, trimmedSpan, trivia);
    }

    private applyValueStart(
        vs: ValueStart,
        key: { lo: number; hi: number } | null,
        lineNum: number,
        keySpan: Span,
        trimmedSpan: Span,
        trivia: Trivia,
    ): void {
        const leaf = (v: PValue): void => {
            const pair: [Trivia, PValue] = [trivia, v];
            if (key === null) this.pushArrayItem(pair);
            else this.insertObjectPair(key, pair, lineNum, keySpan);
        };
        switch (vs.t) {
            case "scalar":
                leaf({ t: "string", v: decodeRange(this.bytes, vs.lo, vs.hi) });
                return;
            case "null":
                leaf({ t: "null" });
                return;
            case "bool":
                leaf({ t: "bool", v: vs.v });
                return;
            case "int":
                leaf({ t: "int", v: vs.v });
                return;
            case "float":
                leaf({ t: "float", v: vs.v });
                return;
            case "emptyObject":
                leaf(newPObject());
                return;
            case "emptyArray":
                leaf(newPArray());
                return;
            case "openObject":
            case "openArray": {
                if (key !== null) this.setPendingKey(key, keySpan, trivia, lineNum);
                else this.setPendingItemTrivia(trivia);
                this.stack.push(
                    vs.t === "openObject"
                        ? this.newObjectFrame()
                        : { t: "array", table: newPArray(), pendingItemTrivia: [], atStart: true },
                );
                this.openerOffsets.push(trimmedSpan.end - 1);
                return;
            }
            case "openMultilineStripped":
                if (key !== null) this.setPendingKey(key, keySpan, trivia, lineNum);
                else this.setPendingItemTrivia(trivia);
                this.collecting = { mode: "stripped", lines: [] };
                this.multilineOpener = trimmedSpan.end - 1;
                return;
            case "openMultilineVerbatim":
                if (key !== null) this.setPendingKey(key, keySpan, trivia, lineNum);
                else this.setPendingItemTrivia(trivia);
                this.collecting = { mode: "verbatim", lines: [] };
                this.multilineOpener = trimmedSpan.end - 2;
                return;
            case "inline":
                leaf(stampP(vs.v));
                return;
        }
    }

    /** positioned.rs `set_pending_item` — trivia for an array item
     *  whose value opens on a later line. */
    private setPendingItemTrivia(trivia: Trivia): void {
        const frame = this.stack[this.stack.length - 1]!;
        if (frame.t === "array") frame.pendingItemTrivia = trivia;
    }

    private insertObjectPair(key: { lo: number; hi: number }, pair: [Trivia, PValue], lineNum: number, keySpan: Span): void {
        const frame = this.stack[this.stack.length - 1]!;
        if (frame.t !== "object") return;
        insertP(frame.table, this.bytes, key.lo, key.hi, pair, { bytes: this.bytes, line: lineNum, span: keySpan }, keySpan);
    }

    private pushArrayItem(pair: [Trivia, PValue]): void {
        const frame = this.stack[this.stack.length - 1]!;
        if (frame.t === "array") frame.table.items.push(pair);
    }

    private setPendingKey(key: { lo: number; hi: number }, keySpan: Span, trivia: Trivia, lineNum: number): void {
        const frame = this.stack[this.stack.length - 1]!;
        if (frame.t !== "object") return;
        if (frame.pendingKey !== null) {
            throwKtav(
                {
                    k: "Other",
                    line: lineNum,
                    message: `Line ${lineNum}: internal error \u{2014} pending key already set`,
                    span: { start: keySpan.start, end: keySpan.start },
                },
                this.bytes,
                null,
            );
        }
        frame.pendingKey = key;
        frame.pendingKeySpan = keySpan;
        frame.pendingKeyTrivia = trivia;
    }

    private closeFrame(expected: "object" | "array", lineNum: number, trimmedSpan: Span): void {
        const bytes = this.bytes;
        const trailing = trimTrailingBlanks(this.pendingTrivia);
        this.pendingTrivia = [];
        if (this.stack.length <= 1) {
            if (this.stack.length === 1 && this.rootIsExplicitCompound) {
                const frame = this.stack[0]!;
                if (frame.t !== expected) {
                    throwKtav(
                        {
                            k: "UnbalancedBracket",
                            line: lineNum,
                            span: trimmedSpan,
                            expected: frame.t,
                            found: expected === "object" ? "}" : "]",
                        },
                        bytes,
                        null,
                    );
                }
                frame.table.trailing.push(...trailing);
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
                bytes,
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
                bytes,
                null,
            );
        }
        frame.table.trailing.push(...trailing);
        const value: PValue =
            frame.t === "object"
                ? { t: "object", pairs: frame.table.pairs, trailing: frame.table.trailing }
                : { t: "array", items: frame.table.items, trailing: frame.table.trailing };
        this.attachChildValue(value, lineNum, trimmedSpan);
    }

    private attachChildValue(value: PValue, lineNum: number, trimmedSpan: Span): void {
        const frame = this.stack[this.stack.length - 1]!;
        if (frame.t === "object") {
            const pending = frame.pendingKey;
            if (pending === null) {
                throwKtav(
                    {
                        k: "Other",
                        line: lineNum,
                        message: `Line ${lineNum}: internal error \u{2014} closed compound without pending key`,
                        span: trimmedSpan,
                    },
                    this.bytes,
                    null,
                );
            }
            frame.pendingKey = null;
            const keySpan = frame.pendingKeySpan ?? trimmedSpan;
            frame.pendingKeySpan = null;
            const trivia = frame.pendingKeyTrivia;
            frame.pendingKeyTrivia = [];
            insertP(frame.table, this.bytes, pending.lo, pending.hi, [trivia, value], { bytes: this.bytes, line: lineNum, span: keySpan }, keySpan);
        } else {
            frame.table.items.push([frame.pendingItemTrivia, value]);
            frame.pendingItemTrivia = [];
        }
    }
}

// ---------------------------------------------------------------------------
// Emission — render/formatted.rs
// ---------------------------------------------------------------------------

type W = string[];

function pushIndent(out: W, level: number): void {
    if (level > 0) out.push("    ".repeat(level));
}

function emitTrivia(trivia: Trivia, indent: number, out: W): void {
    for (const line of trivia) {
        if (line.k === "blank") out.push("\n");
        else {
            pushIndent(out, indent);
            out.push(line.text, "\n");
        }
    }
}

// EXPLICIT-STACK emission (render/formatted.rs) — no recursion; task
// order reproduces the recursive emitters byte-for-byte; per-pair
// trivia pops before its pair, trailing-bucket trivia after children.
type FmtTask =
    | { t: "pair"; key: string; v: PValue; indent: number; rootFirstKey: boolean }
    | { t: "item"; v: PValue; indent: number; rootFirst: boolean }
    | { t: "trivia"; trivia: Trivia; indent: number }
    | { t: "text"; chunks: string[] };

function fmtCloseChunks(indent: number, closer: string): string[] {
    return indent > 0 ? ["    ".repeat(indent), closer] : [closer];
}

function pushFmtCompound(
    stack: FmtTask[],
    v: PCompound,
    indent: number,
    ctx: "pair" | "item",
    out: W,
): void {
    const opener = ctx === "pair" ? ": " : "";
    if (v.t === "array") {
        if (v.items.length === 0 && v.trailing.length === 0) {
            out.push(opener + "[]\n");
            return;
        }
        out.push(opener + "[\n");
        stack.push({ t: "text", chunks: fmtCloseChunks(indent, "]\n") });
        stack.push({ t: "trivia", trivia: v.trailing, indent: indent + 1 });
        for (let i = v.items.length - 1; i >= 0; i--) {
            stack.push({ t: "item", v: v.items[i]![1], indent: indent + 1, rootFirst: false });
            stack.push({ t: "trivia", trivia: v.items[i]![0], indent: indent + 1 });
        }
        return;
    }
    if (v.pairs.size === 0 && v.trailing.length === 0) {
        out.push(opener + "{}\n");
        return;
    }
    out.push(opener + "{\n");
    stack.push({ t: "text", chunks: fmtCloseChunks(indent, "}\n") });
    stack.push({ t: "trivia", trivia: v.trailing, indent: indent + 1 });
    const entries = Array.from(v.pairs.entries());
    for (let i = entries.length - 1; i >= 0; i--) {
        stack.push({
            t: "pair",
            key: entries[i]![0],
            v: entries[i]![1][1],
            indent: indent + 1,
            rootFirstKey: false,
        });
        stack.push({ t: "trivia", trivia: entries[i]![1][0], indent: indent + 1 });
    }
}

function fmtLeafOrCompound(
    stack: FmtTask[],
    v: PValue,
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
        case "float":
            out.push(prefix, fmtFloat(v.v), "\n");
            return;
        case "string":
            if (ctx === "pair") emitStringInPairCanonical(v.v, indent, out);
            else emitStringAsItemCanonical(v.v, indent, rootFirst, out);
            return;
        case "array":
        case "object":
            pushFmtCompound(stack, v, indent, ctx, out);
            return;
    }
}

function runFmtEmitter(rootTasks: FmtTask[], out: W): void {
    const stack: FmtTask[] = rootTasks.slice().reverse();
    while (stack.length > 0) {
        const task = stack.pop()!;
        if (task.t === "text") {
            out.push(...task.chunks);
            continue;
        }
        if (task.t === "trivia") {
            emitTrivia(task.trivia, task.indent, out);
            continue;
        }
        if (task.t === "pair") {
            if (task.key.length === 0) fmtSig("EmptyKeyName");
            pushIndent(out, task.indent);
            pushEscapedKeySegment(task.key, task.rootFirstKey, out);
            fmtLeafOrCompound(stack, task.v, task.indent, "pair", false, out);
            continue;
        }
        pushIndent(out, task.indent);
        fmtLeafOrCompound(stack, task.v, task.indent, "item", task.rootFirst, out);
    }
}

/** Root-shape tasks — emitObjectPairs(root, 0, true) /
 *  emitArrayRoot over the trivia tree. */
function fmtRootTasks(root: PCompound): FmtTask[] {
    if (root.t === "object") {
        const tasks: FmtTask[] = [];
        let first = true;
        for (const [k, [trivia, v]] of root.pairs) {
            tasks.push({ t: "trivia", trivia, indent: 0 });
            tasks.push({ t: "pair", key: k, v, indent: 0, rootFirstKey: first });
            first = false;
        }
        tasks.push({ t: "trivia", trivia: root.trailing, indent: 0 });
        return tasks;
    }
    const firstIsCompound =
        root.items.length > 0 &&
        (root.items[0]![1].t === "object" || root.items[0]![1].t === "array");
    const needsWrap =
        firstIsCompound || (root.items.length === 0 && root.trailing.length > 0);
    if (needsWrap) {
        const tasks: FmtTask[] = [{ t: "text", chunks: ["[\n"] }];
        for (const [trivia, item] of root.items) {
            tasks.push({ t: "trivia", trivia, indent: 1 });
            tasks.push({ t: "item", v: item, indent: 1, rootFirst: false });
        }
        tasks.push({ t: "trivia", trivia: root.trailing, indent: 1 });
        tasks.push({ t: "text", chunks: ["]\n"] });
        return tasks;
    }
    const tasks: FmtTask[] = [];
    for (let i = 0; i < root.items.length; i++) {
        tasks.push({ t: "trivia", trivia: root.items[i]![0], indent: 0 });
        tasks.push({ t: "item", v: root.items[i]![1], indent: 0, rootFirst: i === 0 });
    }
    tasks.push({ t: "trivia", trivia: root.trailing, indent: 0 });
    return tasks;
}

class FmtSignal extends Error {
    constructor(readonly code: ReasonCodeName) {
        super(code);
    }
}

function fmtSig(code: ReasonCodeName): never {
    throw new FmtSignal(code);
}

function fmtFloat(s: string): string {
    const v = Number(s);
    if (Number.isNaN(v) || !Number.isFinite(v)) fmtSig("NonFiniteFloat");
    return canonicalFloat(s);
}

/** First §5.9.0 offense over the trivia tree in document order
 *  (representable.rs `check_node`); explicit stack, DFS pre-order.
 *  Parent-linked path nodes materialized only on return (writer.ts
 *  findOffense): array frames add no path element; keyless root → []. */
function findOffenseP(value: PValue): string[] | null {
    type Frame = { v: PValue; node: PathNode | null; key: string | null };
    const stack: Frame[] = [{ v: value, node: null, key: null }];
    while (stack.length > 0) {
        const fr = stack.pop()!;
        if (fr.key !== null && fr.key.length === 0) return materializePath(fr.node);
        switch (fr.v.t) {
            case "object": {
                const entries = Array.from(fr.v.pairs.entries());
                for (let i = entries.length - 1; i >= 0; i--) {
                    stack.push({
                        v: entries[i]![1][1],
                        node: { parent: fr.node, key: entries[i]![0] },
                        key: entries[i]![0],
                    });
                }
                break;
            }
            case "array": {
                for (let i = fr.v.items.length - 1; i >= 0; i--) {
                    stack.push({ v: fr.v.items[i]![1], node: fr.node, key: null });
                }
                break;
            }
            case "string":
                if (fr.v.v.includes("\r")) return materializePath(fr.node);
                if (stringNeedsMultiline(fr.v.v)) {
                    if (!chooseMultilineForm(fr.v.v, false).ok) return materializePath(fr.node);
                }
                break;
            default:
                break;
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Entry point — lib.rs `format_str`
// ---------------------------------------------------------------------------

/** Parse + format a trivia-carrying document (same grammar and errors
 *  as loads — validateUtf8 FIRST, §6.15). Emission signals are
 *  converted to path-carrying writer errors via the cold re-walk. */
export function formatText(text: string): string {
    const bytes = new TextEncoder().encode(text);
    const bad = validateUtf8(bytes);
    if (bad !== null) {
        throwKtav(
            { k: "InvalidUtf8", validUpTo: bad.validUpTo, errorLen: bad.errorLen },
            bytes,
            null,
        );
    }
    const doc = new PositionedParser(false, bytes).run();
    const out: W = [];
    try {
        const leading: FmtTask[] = [{ t: "trivia", trivia: doc.leading, indent: 0 }];
        // Parser invariant (§5.0.1): the formatted root is a compound.
        // Narrow explicitly so the compound call below typechecks.
        if (doc.root.t !== "object" && doc.root.t !== "array") {
            throw new Error("internal error: formatted root is not an object or array");
        }
        if (doc.root.t === "array" && doc.root.items.length === 0 && doc.root.trailing.length === 0) {
            runFmtEmitter(leading, out);
            out.push("[]\n");
        } else {
            runFmtEmitter([...leading, ...fmtRootTasks(doc.root)], out);
        }
    } catch (e) {
        const code =
            e instanceof FmtSignal ? e.code : writerSignalCode(e);
        if (code !== null) {
            const path = findOffenseP(doc.root);
            unrepresentableAt(code, path ?? []);
        }
        throw e;
    }
    return out.join("");
}
