// Positional source tree — edit/tree.rs port: a line-oriented pass
// mirroring the real parser's line dispatch (the same colon scan,
// separator / value-shape / root-shape classification and the same
// dotted-key / reopen insertion), but recording BYTE RANGES of values
// instead of building trivia. Slots drive the splice boundaries.
// Errors here mean divergence from the real parser and are unreachable
// after a successful source parse; the caller maps them to
// EditUnsupported (fail closed).

import {
    decodeRange,
    eqLit,
    leadingBomLen,
    startsWithLit,
    trimWs,
    trimWsStart,
    wsLenAt,
} from "../bytes.js";
import { classifySeparator, isPairShape, requireSepEnd } from "../classify.js";
import {
    checkKey,
    decodeKeySegment,
    findUnescapedColon,
    keyIsSingleSegment,
    scanUnescapedColon,
    splitKeyPath,
} from "../lexer.js";
import { MAX_INLINE_DEPTH, scanInlineBody } from "../inline.js";
import { parseIndexSegment, type ErrCtxInternal } from "./shared.js";

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export type Slot =
    | { k: "pair"; colon: number; keyStart: number; b0: number; b1: number }
    | { k: "item"; start: number; b0: number; b1: number }
    | { k: "block"; anchor: number | null; start: number; end: number };

export interface Node {
    kind: "scalar" | "object" | "array";
    table: Map<string, Node> | null;
    items: Node[] | null;
    inline: boolean;
    slot: Slot | null;
}

export function scalarNode(slot: Slot): Node {
    return { kind: "scalar", table: null, items: null, inline: false, slot };
}
function emptyObjectNode(slot: Slot): Node {
    return { kind: "object", table: new Map(), items: null, inline: false, slot };
}
function emptyArrayNode(slot: Slot): Node {
    return { kind: "array", table: null, items: [], inline: false, slot };
}
function syntheticObject(): Node {
    return { kind: "object", table: new Map(), items: null, inline: false, slot: null };
}

export function wsTrimEnd(bytes: Uint8Array, lo: number, hi: number): number {
    let h = hi;
    for (;;) {
        if (h <= lo) return lo;
        let s = h - 1;
        while (s > lo && (bytes[s]! & 0xc0) === 0x80) s--;
        const len = wsLenAt(bytes, s, h);
        if (len > 0 && s + len === h) h = s;
        else return h;
    }
}

export function internalError(ctx: ErrCtxInternal, what: string): Error {
    // Unreachable after a successful source parse; surfaced as
    // EditUnsupported by the caller (fail closed).
    return new Error(`positional tree: ${what} (line ${ctx.line})`);
}

// ---------------------------------------------------------------------------
// insert.rs insert_value over the Node table: dotted expansion,
// reopen-merge (descending INVALIDATES a contiguous slot — the value
// becomes noncontiguous), duplicate/conflict → internal Unsupported
// (unreachable after a successful source parse; fail closed).
// ---------------------------------------------------------------------------

export function insertNode(
    table: Map<string, Node>,
    bytes: Uint8Array,
    klo: number,
    khi: number,
    node: Node,
    ctx: ErrCtxInternal,
    keySpan: { start: number; end: number },
): import("./shared.js").EditError | null {
    const bail = (what: string): import("./shared.js").EditError =>
        ({ k: "Unsupported", reason: `internal: ${what} while building positional tree` });
    if (keyIsSingleSegment(bytes, klo, khi)) {
        const [tlo, thi] = trimWs(bytes, klo, khi);
        if (tlo >= thi) return bail("empty key");
        if (checkKey(bytes, tlo, thi) !== "valid") return bail("invalid key");
        const decoded = decodeKeySegment(bytes, tlo, thi, ctx);
        if (table.has(decoded)) return bail("duplicate key after successful parse");
        table.set(decoded, node);
        return null;
    }
    const segments = splitKeyPath(bytes, klo, khi);
    const n = segments.length;
    let cur = table;
    for (let idx = 0; idx < n; idx++) {
        const [slo, shi] = segments[idx]!;
        const [tlo, thi] = trimWs(bytes, slo, shi);
        if (tlo >= thi) return bail("empty key");
        if (checkKey(bytes, tlo, thi) !== "valid") return bail("invalid key");
        const decoded = decodeKeySegment(bytes, tlo, thi, ctx);
        const isLeaf = idx + 1 === n;
        if (!isLeaf) {
            const existing = cur.get(decoded);
            if (existing === undefined) {
                const sub = syntheticObject();
                cur.set(decoded, sub);
                cur = sub.table!;
            } else if (existing.kind === "object") {
                existing.slot = null; // reopen / dotted descent → noncontiguous
                cur = existing.table!;
            } else {
                return bail("dotted descent through a value after successful parse");
            }
        } else {
            if (cur.has(decoded)) return bail("duplicate key after successful parse");
            cur.set(decoded, node);
            return null;
        }
    }
    void keySpan;
    return null;
}

// ---------------------------------------------------------------------------
// §5.0.1 root shape WITHOUT inline parsing (root.rs
// classify_root_shape — inline bodies are positioned separately).
// ---------------------------------------------------------------------------

function rootShape(bytes: Uint8Array, lo: number, hi: number): string {
    if (eqLit(bytes, lo, hi, "{")) return "explicitObject";
    if (eqLit(bytes, lo, hi, "[")) return "explicitArray";
    if (bytes[lo] === 0x7b) return "inlineObject";
    if (bytes[lo] === 0x5b) return "inlineArray";
    return isPairShape(bytes, lo, hi) ? "object" : "array";
}

// ---------------------------------------------------------------------------
// classify.rs classify_value_shape over the raw `after` range
// `[lo, hi)` (leading whitespace allowed).
// ---------------------------------------------------------------------------

type ValueShape =
    | { t: "scalar" }
    | { t: "emptyString" }
    | { t: "emptyObject" }
    | { t: "emptyArray" }
    | { t: "openObject" }
    | { t: "openArray" }
    | { t: "openMultilineStripped" }
    | { t: "openMultilineVerbatim" }
    | { t: "inline"; start: number };

function valueShape(bytes: Uint8Array, lo: number, hi: number, ctx: ErrCtxInternal): ValueShape {
    let tlo = trimWsStart(bytes, lo, hi);
    if (eqLit(bytes, tlo, hi, "{")) return { t: "openObject" };
    if (eqLit(bytes, tlo, hi, "[")) return { t: "openArray" };
    const first = bytes[tlo];
    if (first === 0x7b || first === 0x5b) {
        const close = first === 0x7b ? 0x7d : 0x5d;
        const [ilo, ihi] = trimWs(bytes, tlo + 1, hi - 1);
        if (ilo >= ihi) {
            return first === 0x7b ? { t: "emptyObject" } : { t: "emptyArray" };
        }
        const scan = scanInlineBody(bytes, tlo, hi, first, close, ctx);
        if (scan.badEscape !== null) throw internalError(ctx, "bad escape after successful parse");
        if (scan.closerIdx === hi - 1) return { t: "inline", start: tlo };
        return first === 0x7b ? { t: "openObject" } : { t: "openArray" };
    }
    if (eqLit(bytes, tlo, hi, "(")) return { t: "openMultilineStripped" };
    if (eqLit(bytes, tlo, hi, "((")) return { t: "openMultilineVerbatim" };
    if (eqLit(bytes, tlo, hi, "()") || eqLit(bytes, tlo, hi, "(())")) return { t: "emptyString" };
    return { t: "scalar" };
}

// ---------------------------------------------------------------------------
// Inline positioning (tree.rs position_inline_top / position_inline)
// ---------------------------------------------------------------------------

/** Position an inline compound body `[bLo, bHi)` (starts `{`/`[`,
 *  ends at its matching closer) whose first byte is at `baseAbs`. */
function positionInlineTop(
    bytes: Uint8Array,
    bLo: number,
    bHi: number,
    ctx: ErrCtxInternal,
    isObject: boolean,
    depth: number,
): Node {
    const open = isObject ? 0x7b : 0x5b;
    const close = isObject ? 0x7d : 0x5d;
    const scan = scanInlineBody(bytes, bLo, bHi, open, close, ctx);
    if (scan.badEscape !== null || scan.closerIdx !== bHi - 1) {
        throw internalError(ctx, "inline compound failed to position after successful parse");
    }
    return positionInline(bytes, bLo, bHi, ctx, isObject, depth, scan);
}

function positionInline(
    bytes: Uint8Array,
    bLo: number,
    bHi: number,
    ctx: ErrCtxInternal,
    isObject: boolean,
    depth: number,
    scan: ReturnType<typeof scanInlineBody>,
): Node {
    if (depth > MAX_INLINE_DEPTH) {
        throw internalError(ctx, "inline nesting exceeds depth limit");
    }
    if (isObject) {
        const table = new Map<string, Node>();
        for (const [slo, shi] of scan.segments) {
            const [tlo, thi] = trimWs(bytes, slo, shi);
            if (tlo >= thi) continue; // trailing comma
            const colon = findUnescapedColon(bytes, tlo, thi);
            if (colon === -1) throw internalError(ctx, "inline pair without separator");
            // Key: insert_value trims/validates each dotted segment itself.
            const colonAbs = colon;
            let child: Node;
            if (bytes[colon + 1] === 0x3a) {
                // Raw `::` — literal scalar; body after the marker.
                const vlo = trimWsStart(bytes, colon + 2, thi);
                child = {
                    kind: "scalar",
                    table: null,
                    items: null,
                    inline: true,
                    slot: { k: "pair", colon: colonAbs, keyStart: tlo, b0: vlo, b1: thi },
                };
            } else {
                const vlo = trimWsStart(bytes, colon + 1, thi);
                child =
                    bytes[vlo] === 0x7b || bytes[vlo] === 0x5b
                        ? positionInlineTop(bytes, vlo, thi, ctx, bytes[vlo] === 0x7b, depth + 1)
                        : { kind: "scalar", table: null, items: null, inline: true, slot: null };
                child.slot = { k: "pair", colon: colonAbs, keyStart: tlo, b0: vlo, b1: thi };
            }
            const err = insertNode(table, bytes, tlo, colon, child, ctx, {
                start: tlo,
                end: thi,
            });
            if (err) throw internalError(ctx, err.k === "Unsupported" ? err.reason : "insert");
        }
        return { kind: "object", table, items: null, inline: true, slot: null };
    }
    // Inline array: `::` is literal DATA here, not a raw marker —
    // every non-compound segment is a scalar spanning the whole
    // trimmed segment.
    const items: Node[] = [];
    for (const [slo, shi] of scan.segments) {
        const [tlo, thi] = trimWs(bytes, slo, shi);
        if (tlo >= thi) continue;
        const child: Node =
            bytes[tlo] === 0x7b || bytes[tlo] === 0x5b
                ? positionInlineTop(bytes, tlo, thi, ctx, bytes[tlo] === 0x7b, depth + 1)
                : { kind: "scalar", table: null, items: null, inline: true, slot: null };
        child.slot = { k: "item", start: tlo, b0: tlo, b1: thi };
        items.push(child);
    }
    return { kind: "array", table: null, items, inline: true, slot: null };
}

// ---------------------------------------------------------------------------
// Builder (tree.rs Builder)
// ---------------------------------------------------------------------------

interface Frame {
    kind: "object" | "array";
    table: Map<string, Node> | null;
    items: Node[] | null;
    pendingKey: { klo: number; khi: number } | null;
    pendingAnchor: number | null;
    rangeStart: number;
}

export interface TreeMeta {
    root: Node;
    rootExplicit: boolean;
}

/** Build the positional tree of a VALID document. Throws Error
 *  (internal) on any divergence from the real parser — the caller
 *  maps that to EditUnsupported. */
export function buildTree(bytes: Uint8Array): TreeMeta {
    const stack: Frame[] = [];
    let collecting: "stripped" | "verbatim" | null = null;
    let collectingOpener = 0;
    let rootInitialized = false;
    let rootConsumed = false;
    let rootInline: Node | null = null;
    let rootExplicit = false;

    const ctx: ErrCtxInternal = { bytes, line: 0, span: { start: 0, end: 0 } };

    function handleLine(lo: number, hi: number): void {
        ctx.line++;
        ctx.span = { start: lo, end: hi };
        if (collecting !== null) {
            const [tlo, thi] = trimWs(bytes, lo, hi);
            const term = collecting === "stripped" ? ")" : "))";
            if (eqLit(bytes, tlo, thi, term)) {
                const opener = collectingOpener;
                collecting = null;
                const node = scalarNode({ k: "block", anchor: null, start: opener, end: thi });
                attachScalar(node);
                return;
            }
            return;
        }
        const [tlo, thi] = trimWs(bytes, lo, hi);
        if (tlo >= thi || startsWithLit(bytes, tlo, thi, "##")) return;
        ctx.span = { start: tlo, end: thi }; // trimmed span (tree.rs ts)
        if (rootConsumed) throw internalError(ctx, "orphan line after top-level inline");
        if (!rootInitialized) {
            rootInitialized = true;
            if (!eqLit(bytes, tlo, thi, "}") && !eqLit(bytes, tlo, thi, "]")) {
                switch (rootShape(bytes, tlo, thi)) {
                    case "inlineObject":
                    case "inlineArray": {
                        rootConsumed = true;
                        rootInline = positionInlineTop(
                            bytes,
                            tlo,
                            thi,
                            ctx,
                            bytes[tlo] === 0x7b,
                            0,
                        );
                        return;
                    }
                    case "explicitObject":
                        rootExplicit = true;
                        stack.push({
                            kind: "object",
                            table: new Map(),
                            items: null,
                            pendingKey: null,
                            pendingAnchor: null,
                            rangeStart: tlo,
                        });
                        return;
                    case "explicitArray":
                        rootExplicit = true;
                        stack.push({
                            kind: "array",
                            table: null,
                            items: [],
                            pendingKey: null,
                            pendingAnchor: null,
                            rangeStart: tlo,
                        });
                        return;
                    case "object":
                        stack.push({
                            kind: "object",
                            table: new Map(),
                            items: null,
                            pendingKey: null,
                            pendingAnchor: null,
                            rangeStart: 0,
                        });
                        break;
                    case "array":
                        stack.push({
                            kind: "array",
                            table: null,
                            items: [],
                            pendingKey: null,
                            pendingAnchor: null,
                            rangeStart: 0,
                        });
                        break;
                }
            }
        }
        if (eqLit(bytes, tlo, thi, "}")) return closeFrame("object");
        if (eqLit(bytes, tlo, thi, "]")) return closeFrame("array");
        const top = stack[stack.length - 1];
        if (top === undefined) throw internalError(ctx, "line without root frame");
        if (top.kind === "array") handleArrayItem(tlo, thi);
        else handleObjectPair(tlo, thi);
    }

    function handleObjectPair(tlo: number, thi: number): void {
        ctx.span = { start: tlo, end: thi }; // trimmed span (tree.rs ts)
        const scan = scanUnescapedColon(bytes, tlo, thi);
        if (scan.t === "unterminated") throw internalError(ctx, "unterminated quoted key");
        if (scan.t === "absent") throw internalError(ctx, "missing separator");
        const colon = scan.i;
        const khi = wsTrimEnd(bytes, tlo, colon);
        const colonOff = colon;
        const sep = classifySeparator(bytes, colon + 1, thi);
        if (sep.t === "raw") {
            requireSepEnd(bytes, sep.lo, sep.hi, ctx, colonOff + 2, ctx.span);
            const [blo, bhi] = trimWs(bytes, sep.lo, sep.hi);
            insertPair(
                { klo: tlo, khi },
                scalarNode({ k: "pair", colon: colonOff, keyStart: tlo, b0: blo, b1: bhi }),
            );
        } else {
            requireSepEnd(bytes, sep.lo, sep.hi, ctx, colonOff + 1, ctx.span);
            const vlo = trimWsStart(bytes, sep.lo, sep.hi);
            const vs = valueShape(bytes, sep.lo, thi, ctx);
            switch (vs.t) {
                case "scalar":
                case "emptyString":
                    insertPair(
                        { klo: tlo, khi },
                        scalarNode({ k: "pair", colon: colonOff, keyStart: tlo, b0: vlo, b1: thi }),
                    );
                    break;
                case "emptyObject":
                    insertPair(
                        { klo: tlo, khi },
                        emptyObjectNode({ k: "pair", colon: colonOff, keyStart: tlo, b0: vlo, b1: thi }),
                    );
                    break;
                case "emptyArray":
                    insertPair(
                        { klo: tlo, khi },
                        emptyArrayNode({ k: "pair", colon: colonOff, keyStart: tlo, b0: vlo, b1: thi }),
                    );
                    break;
                case "openObject":
                case "openArray": {
                    setPending({ klo: tlo, khi }, colonOff);
                    stack.push({
                        kind: vs.t === "openObject" ? "object" : "array",
                        table: vs.t === "openObject" ? new Map() : null,
                        items: vs.t === "openObject" ? null : [],
                        pendingKey: null,
                        pendingAnchor: null,
                        rangeStart: vlo,
                    });
                    break;
                }
                case "openMultilineStripped":
                    setPending({ klo: tlo, khi }, colonOff);
                    collecting = "stripped";
                    collectingOpener = vlo;
                    break;
                case "openMultilineVerbatim":
                    setPending({ klo: tlo, khi }, colonOff);
                    collecting = "verbatim";
                    collectingOpener = vlo;
                    break;
                case "inline": {
                    const node = positionInlineTop(bytes, vs.start, thi, ctx, bytes[vs.start] === 0x7b, 0);
                    node.inline = false; // the CONTAINER lives on the pair's line
                    node.slot = { k: "pair", colon: colonOff, keyStart: tlo, b0: vlo, b1: thi };
                    insertPair({ klo: tlo, khi }, node);
                    break;
                }
            }
        }
    }

    function handleArrayItem(tlo: number, thi: number): void {
        ctx.span = { start: tlo, end: thi }; // trimmed == whole line
        if (bytes[tlo] === 0x3a && bytes[tlo + 1] === 0x3a) {
            requireSepEnd(bytes, tlo + 2, thi, ctx, tlo + 2, ctx.span);
            const vlo = trimWsStart(bytes, tlo + 2, thi);
            pushItem(scalarNode({ k: "item", start: tlo, b0: vlo, b1: thi }));
            return;
        }
        const vs = valueShape(bytes, tlo, thi, ctx);
        const bodyStart = tlo; // trimmed line — content starts at tlo
        switch (vs.t) {
            case "scalar":
            case "emptyString":
                pushItem(scalarNode({ k: "item", start: tlo, b0: bodyStart, b1: thi }));
                break;
            case "emptyObject":
                pushItem(emptyObjectNode({ k: "item", start: tlo, b0: bodyStart, b1: thi }));
                break;
            case "emptyArray":
                pushItem(emptyArrayNode({ k: "item", start: tlo, b0: bodyStart, b1: thi }));
                break;
            case "openObject":
                stack.push({
                    kind: "object",
                    table: new Map(),
                    items: null,
                    pendingKey: null,
                    pendingAnchor: null,
                    rangeStart: bodyStart,
                });
                break;
            case "openArray":
                stack.push({
                    kind: "array",
                    table: null,
                    items: [],
                    pendingKey: null,
                    pendingAnchor: null,
                    rangeStart: bodyStart,
                });
                break;
            case "openMultilineStripped":
                collecting = "stripped";
                collectingOpener = bodyStart;
                break;
            case "openMultilineVerbatim":
                collecting = "verbatim";
                collectingOpener = bodyStart;
                break;
            case "inline": {
                const node = positionInlineTop(bytes, vs.start, thi, ctx, bytes[vs.start] === 0x7b, 0);
                node.inline = false;
                node.slot = { k: "item", start: tlo, b0: bodyStart, b1: thi };
                pushItem(node);
                break;
            }
        }
    }

    function setPending(key: { klo: number; khi: number }, anchor: number | null): void {
        const top = stack[stack.length - 1];
        if (!top || top.kind !== "object") throw internalError(ctx, "pending key outside object");
        top.pendingKey = key;
        top.pendingAnchor = anchor;
    }

    function insertPair(key: { klo: number; khi: number }, node: Node): void {
        const top = stack[stack.length - 1];
        if (!top || top.kind !== "object") throw internalError(ctx, "pair outside object");
        const err = insertNode(top.table!, bytes, key.klo, key.khi, node, ctx, ctx.span);
        if (err) throw internalError(ctx, err.k === "Unsupported" ? err.reason : "insert");
    }

    function pushItem(node: Node): void {
        const top = stack[stack.length - 1];
        if (!top || top.kind !== "array") throw internalError(ctx, "item outside array");
        top.items!.push(node);
    }

    function attachScalar(node: Node): void {
        const top = stack[stack.length - 1];
        if (!top) throw internalError(ctx, "attach without frame");
        if (top.kind === "object") {
            const key = top.pendingKey;
            if (!key) throw internalError(ctx, "multiline closed without pending key");
            top.pendingKey = null;
            const anchor = top.pendingAnchor;
            top.pendingAnchor = null;
            if (node.slot && node.slot.k === "block") {
                node = scalarNode({ k: "block", anchor, start: node.slot.start, end: node.slot.end });
            }
            const err = insertNode(top.table!, bytes, key.klo, key.khi, node, ctx, ctx.span);
            if (err) throw internalError(ctx, err.k === "Unsupported" ? err.reason : "insert");
        } else {
            top.items!.push(node);
        }
    }

    function closeFrame(expected: "object" | "array"): void {
        const thi = ctx.span.end;
        if (stack.length === 1 && rootExplicit) {
            rootConsumed = true;
            return;
        }
        if (stack.length <= 1) throw internalError(ctx, "unbalanced bracket");
        const frame = stack.pop()!;
        let anchor: number | null = null;
        const parent = stack[stack.length - 1];
        if (parent && parent.kind === "object") {
            anchor = parent.pendingAnchor;
            parent.pendingAnchor = null;
        }
        const node: Node = {
            kind: frame.kind,
            table: frame.table,
            items: frame.items,
            inline: false,
            slot: { k: "block", anchor, start: frame.rangeStart, end: thi },
        };
        if (!parent) throw internalError(ctx, "close without parent frame");
        if (parent.kind === "object") {
            const key = parent.pendingKey;
            if (!key) throw internalError(ctx, "closed compound without pending key");
            parent.pendingKey = null;
            const err = insertNode(parent.table!, bytes, key.klo, key.khi, node, ctx, ctx.span);
            if (err) throw internalError(ctx, err.k === "Unsupported" ? err.reason : "insert");
        } else {
            parent.items!.push(node);
        }
        void expected;
    }

    // Line iteration — mirrors build_with_meta: LF-only fast path,
    // CR-aware general path (CR, LF and CRLF are each ONE terminator).
    const hasCR = bytes.includes(0x0d);
    let lineStart = leadingBomLen(bytes);
    if (!hasCR) {
        while (lineStart <= bytes.length) {
            let end = bytes.length;
            for (let i = lineStart; i < bytes.length; i++) {
                if (bytes[i] === 0x0a) {
                    end = i;
                    break;
                }
            }
            handleLine(lineStart, end);
            if (end === bytes.length) break;
            lineStart = end + 1;
        }
    } else {
        while (lineStart < bytes.length) {
            let pos = bytes.length;
            for (let i = lineStart; i < bytes.length; i++) {
                const b = bytes[i]!;
                if (b === 0x0a || b === 0x0d) {
                    pos = i;
                    break;
                }
            }
            handleLine(lineStart, pos);
            if (pos === bytes.length) break;
            if (bytes[pos] === 0x0d && bytes[pos + 1] === 0x0a) lineStart = pos + 2;
            else lineStart = pos + 1;
        }
    }

    if (collecting !== null) throw internalError(ctx, "unclosed multiline after successful parse");
    if (stack.length > 1) throw internalError(ctx, "unclosed compound after successful parse");
    if (rootExplicit && !rootConsumed) {
        throw internalError(ctx, "unclosed explicit root after successful parse");
    }
    if (rootInline !== null) return { root: rootInline, rootExplicit };
    const frame = stack.pop();
    if (!frame) {
        return {
            root: { kind: "object", table: new Map(), items: null, inline: false, slot: null },
            rootExplicit,
        };
    }
    return {
        root: {
            kind: frame.kind,
            table: frame.table,
            items: frame.items,
            inline: false,
            slot: null,
        },
        rootExplicit,
    };
}

// ---------------------------------------------------------------------------
// Tree navigation helpers shared by the splice descend and layout
// ---------------------------------------------------------------------------

export function treeChild(node: Node, seg: string): Node | null {
    if (node.kind === "object" && node.table) return node.table.get(seg) ?? null;
    if (node.kind === "array" && node.items) {
        const idx = parseIndexSegment(seg);
        if (idx === null) return null;
        return node.items[idx] ?? null;
    }
    return null;
}

export function slotBody(slot: Slot): [number, number] {
    switch (slot.k) {
        case "pair":
            return [slot.b0, slot.b1];
        case "item":
            return [slot.b0, slot.b1];
        case "block":
            return [slot.start, slot.end];
    }
}

/** All multiline-scalar BLOCK ranges in a subtree — data, not markup;
 *  excluded from the splice's comment scan (splice.rs
 *  collect_multiline_scalar_ranges). */
export function collectMultilineScalarRanges(node: Node, out: Array<[number, number]>): void {
    if (node.kind === "scalar" && node.slot && node.slot.k === "block") {
        out.push([node.slot.start, node.slot.end]);
        return;
    }
    if (node.kind === "object" && node.table) {
        for (const child of node.table.values()) collectMultilineScalarRanges(child, out);
    } else if (node.kind === "array" && node.items) {
        for (const item of node.items) collectMultilineScalarRanges(item, out);
    }
}
