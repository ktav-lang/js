// Source-splice engine — edit/splice.rs port: replace only the bytes
// of the target value by the positional tree's ranges. Marker zones
// (`:` / `::`) are preserved / minimally transitioned (context from
// the OLD slot, rendering from the NEW value); comment loss inside a
// structurally replaced container is a typed Unsupported BEFORE the
// splice; an equal replacement is a byte-identical no-op. Layout
// adjustment and semantic verification live one layer up
// (layout.ts / edit.ts) so the module graph stays acyclic.

import { decodeRange, startsWithLit, trimWs, trimWsStart } from "../bytes.js";
import { parseValue } from "../parse.js";
import {
    bareItemIsPairCandidate,
    itemNeedsRawMarker,
    needsRawMarker,
    pushEscapedKeySegment,
    renderCompoundItem,
} from "../writer.js";
import type { V } from "../values.js";
import { MAX_INLINE_DEPTH } from "../inline.js";
import {
    byteLen,
    detectEol,
    edgeWs,
    eqV,
    firstCp,
    isInlineWsCp,
    lineIndent,
    parseIndexSegment,
    unsupported,
    unsupportedErr,
    utf8,
    type EditError,
} from "./shared.js";
import {
    buildTree,
    collectMultilineScalarRanges,
    type Node,
    type Slot,
} from "./tree.js";

function bodyOf(s: string): Uint8Array {
    return utf8(s);
}

// ---------------------------------------------------------------------------
// Inline encoding (splice.rs encode_inline / push_inline_string)
// ---------------------------------------------------------------------------

function writeUnicodeEscape(out: string[], cp: number): void {
    out.push(`\\u${cp.toString(16).toUpperCase().padStart(4, "0")}`);
}

export function pushInlineString(s: string, forceString: boolean, out: string[]): void {
    const cps = Array.from(s);
    const lastIdx = cps.length - 1;
    for (let i = 0; i < cps.length; i++) {
        const ch = cps[i]!;
        const cp = ch.codePointAt(0)!;
        if (forceString && i === 0) {
            writeUnicodeEscape(out, cp);
            continue;
        }
        switch (ch) {
            case "\\":
                out.push("\\\\");
                break;
            case ",":
                out.push("\\,");
                break;
            case "}":
                out.push("\\}");
                break;
            case "]":
                out.push("\\]");
                break;
            case "{":
                out.push("\\{");
                break;
            case "[":
                out.push("\\[");
                break;
            case "\n":
                out.push("\\n");
                break;
            case "\r":
                out.push("\\r");
                break;
            default:
                if ((i === 0 || i === lastIdx) && isInlineWsCp(cp)) {
                    writeUnicodeEscape(out, cp);
                } else {
                    out.push(ch);
                }
        }
    }
}

export function encodeInline(s: string, forceString: boolean): string {
    const out: string[] = [];
    pushInlineString(s, forceString, out);
    return out.join("");
}

export function pushInlineValue(v: V, depth: number, out: string[]): EditError | null {
    if (depth > MAX_INLINE_DEPTH) {
        return unsupported("replacement nesting exceeds inline depth limit (128)");
    }
    switch (v.t) {
        case "object": {
            out.push("{");
            let index = 0;
            for (const [key, value] of v.v) {
                if (index !== 0) out.push(", ");
                pushEscapedKeySegment(key, false, out);
                out.push(": ");
                if (value.t === "string") {
                    pushInlineString(value.v, needsRawMarker(value.v), out);
                } else {
                    const err = pushInlineValue(value, depth + 1, out);
                    if (err) return err;
                }
                index++;
            }
            out.push("}");
            return null;
        }
        case "array": {
            out.push("[");
            for (let index = 0; index < v.v.length; index++) {
                const value = v.v[index]!;
                if (index !== 0) out.push(", ");
                if (value.t === "string" && value.v.length === 0) {
                    out.push("()");
                } else if (value.t === "string") {
                    pushInlineString(value.v, needsRawMarker(value.v), out);
                } else {
                    const err = pushInlineValue(value, depth + 1, out);
                    if (err) return err;
                }
            }
            out.push("]");
            return null;
        }
        case "string":
            pushInlineString(v.v, needsRawMarker(v.v), out);
            return null;
        case "null":
            out.push("null");
            return null;
        case "bool":
            out.push(v.v ? "true" : "false");
            return null;
        case "int":
        case "float":
            out.push(v.v);
            return null;
    }
}

export function inlineCompoundBody(v: V): { body: string } | { err: EditError } {
    const out: string[] = [];
    const err = pushInlineValue(v, 0, out);
    if (err) return { err };
    return { body: out.join("") };
}

// ---------------------------------------------------------------------------
// Splice planning (splice.rs)
// ---------------------------------------------------------------------------

export type SlotKind = "pair" | "item" | "block";

export interface PlanCtx {
    slot: SlotKind;
    roleItemBlock: boolean;
    existingRaw: boolean;
    rootFirst: boolean;
    indent: string;
    eol: string;
    inlineCompound: boolean;
    blockCompound: boolean;
}

export interface SplicePlan {
    from: number;
    prefix: [string, string];
    body: Uint8Array;
}

function scalarBody(v: V): { body: Uint8Array } | { err: EditError } {
    switch (v.t) {
        case "null":
            return { body: bodyOf("null") };
        case "bool":
            return { body: bodyOf(v.v ? "true" : "false") };
        case "int":
        case "float":
            return { body: bodyOf(v.v) };
        default:
            return { err: unsupported("internal: scalar_body called on a compound value") };
    }
}

export function inlineBody(
    replacement: V,
    forceString: boolean,
): { body: Uint8Array } | { err: EditError } {
    if (replacement.t === "string") {
        return {
            body: bodyOf(encodeInline(replacement.v, forceString && needsRawMarker(replacement.v))),
        };
    }
    if (replacement.t === "object" || replacement.t === "array") {
        const r = inlineCompoundBody(replacement);
        if ("err" in r) return r;
        return { body: bodyOf(r.body) };
    }
    return scalarBody(replacement);
}

export function verbatimBlockBody(
    s: string,
    indent: string,
    eol: string,
): { body: string } | { err: EditError } {
    for (const line of s.split("\n")) {
        const t = line.replace(/^[\t ]+/, "").replace(/[\t ]+$/, "");
        if (t === "))") {
            return {
                err: unsupported(
                    "multiline string contains a line equal to '))'; no lossless verbatim form exists",
                ),
            };
        }
    }
    const out: string[] = ["((", eol];
    if (eol === "\n") {
        out.push(s);
    } else {
        let first = true;
        for (const line of s.split("\n")) {
            if (!first) out.push(eol);
            first = false;
            out.push(line);
        }
    }
    out.push(eol, indent, "))");
    return { body: out.join("") };
}

export function planValue(
    replacement: V,
    pc: PlanCtx,
): { body: Uint8Array; desiredRaw: boolean } | { err: EditError } {
    if (replacement.t === "string") return planString(replacement.v, pc);
    if (
        replacement.t === "null" ||
        replacement.t === "bool" ||
        replacement.t === "int" ||
        replacement.t === "float"
    ) {
        const r = scalarBody(replacement);
        return "err" in r ? r : { body: r.body, desiredRaw: false };
    }
    if (pc.inlineCompound) {
        const r = inlineCompoundBody(replacement);
        if ("err" in r) return { err: r.err };
        return { body: bodyOf(r.body), desiredRaw: false };
    }
    if (replacement.t === "object" && replacement.v.size === 0) {
        return {
            body: bodyOf(pc.blockCompound ? `{${pc.eol}${pc.indent}}` : "{}"),
            desiredRaw: false,
        };
    }
    if (replacement.t === "array" && replacement.v.length === 0) {
        return {
            body: bodyOf(pc.blockCompound ? `[${pc.eol}${pc.indent}]` : "[]"),
            desiredRaw: false,
        };
    }
    let rendered: string;
    try {
        rendered = renderCompoundItem(replacement);
    } catch (e) {
        return { err: unsupportedErr(e, "replacement is not representable") };
    }
    return { body: bodyOf(reindent(rendered, pc.indent, pc.eol)), desiredRaw: false };
}

function planString(
    s: string,
    pc: PlanCtx,
): { body: Uint8Array; desiredRaw: boolean } | { err: EditError } {
    if (s.includes("\r")) {
        return { err: unsupported("replacement string contains CR (U+000D)") };
    }
    if (s.includes("\n") || edgeWs(s)) {
        const r = verbatimBlockBody(s, pc.indent, pc.eol);
        if ("err" in r) return r;
        return { body: bodyOf(r.body), desiredRaw: false };
    }
    let desiredRaw =
        pc.slot === "item" ? itemNeedsRawMarker(s) || s.length === 0 : needsRawMarker(s);
    if (pc.slot === "item" && pc.rootFirst) {
        desiredRaw = desiredRaw || bareItemIsPairCandidate(s) || firstCp(s) === 0xfeff;
    }
    if (pc.existingRaw) desiredRaw = true;
    return { body: bodyOf(s), desiredRaw };
}

export function blockReplacement(
    replacement: V,
    pc: PlanCtx,
    a: number,
    b0: number,
    wsPair: string,
): SplicePlan | { err: EditError } {
    if (replacement.t === "string") {
        const s = replacement.v;
        if (s.includes("\r")) {
            return { err: unsupported("replacement string contains CR (U+000D)") };
        }
        const multiline = s.includes("\n") || edgeWs(s);
        if (multiline) {
            const r = verbatimBlockBody(s, pc.indent, pc.eol);
            if ("err" in r) return r;
            return { from: b0, prefix: ["", ""], body: bodyOf(r.body) };
        }
        if (pc.roleItemBlock && s.length === 0) {
            return { from: b0, prefix: ["", ""], body: bodyOf("()") };
        }
        const itemRaw =
            pc.roleItemBlock &&
            (itemNeedsRawMarker(s) ||
                (pc.rootFirst && (bareItemIsPairCandidate(s) || firstCp(s) === 0xfeff)));
        const pairRaw = !pc.roleItemBlock && needsRawMarker(s);
        if (itemRaw) {
            return { from: b0, prefix: [":: ", ""], body: bodyOf(s) };
        }
        if (pairRaw) {
            return { from: a + 1, prefix: [":", wsPair], body: bodyOf(s) };
        }
        return { from: b0, prefix: ["", ""], body: bodyOf(s) };
    }
    const pc2: PlanCtx = { ...pc, slot: "block" };
    const r = planValue(replacement, pc2);
    if ("err" in r) return r;
    return { from: b0, prefix: ["", ""], body: r.body };
}

/** Re-indent a pretty render under the target line's indent. Verbatim
 *  block interiors are NOT re-indented (their content is verbatim). */
export function reindent(doc: string, indent: string, eol: string): string {
    const lines = doc.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    const out: string[] = [];
    let inVerbatim = false;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]!;
        if (line.startsWith("    ")) line = line.slice(4);
        const trimmedEnd = line.replace(/^[\t ]+/, "").replace(/[\t ]+$/, "");
        const verbatimOpen = line.endsWith("((");
        const verbatimClose = trimmedEnd === "))";
        if (i > 0) {
            out.push(eol);
            const skipPrefix = inVerbatim || line.length === 0;
            if (!skipPrefix) out.push(indent);
        }
        out.push(line);
        if (verbatimOpen) inVerbatim = true;
        else if (verbatimClose) inVerbatim = false;
    }
    return out.join("");
}

export function sepWs(b0: number, b1: number, ws: string): string {
    return b0 === b1 && ws.length === 0 ? " " : ws;
}

// ---------------------------------------------------------------------------
// Comment-loss detection (splice.rs)
// ---------------------------------------------------------------------------

export function hasCommentLine(
    bytes: Uint8Array,
    from: number,
    to: number,
    skip: Array<[number, number]>,
): boolean {
    skip.sort((x, y) => x[0] - y[0]);
    let skipI = 0;
    let i = from;
    while (i < to) {
        const lineStart = i;
        let j = i;
        while (j < to && bytes[j] !== 0x0a && bytes[j] !== 0x0d) j++;
        const k = trimWsStart(bytes, lineStart, j);
        while (skipI < skip.length && skip[skipI]![1] <= k) skipI++;
        const inData = skipI < skip.length && skip[skipI]![0] <= k && k < skip[skipI]![1];
        if (!inData && startsWithLit(bytes, k, j, "##")) return true;
        i = j;
        while (i < to && (bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Verification (splice.rs lookup_value / take_target)
// ---------------------------------------------------------------------------

export function lookupValue(v: V, segments: readonly string[]): V | null {
    let cur: V = v;
    for (const seg of segments) {
        if (cur.t === "object") {
            const next = cur.v.get(seg);
            if (next === undefined) return null;
            cur = next;
        } else if (cur.t === "array") {
            const idx = parseIndexSegment(seg);
            if (idx === null || idx >= cur.v.length) return null;
            cur = cur.v[idx]!;
        } else {
            return null;
        }
    }
    return cur;
}

export function takeTarget(v: V, segments: readonly string[]): V {
    if (segments.length === 0) throw new Error("internal: empty path");
    const last = segments[segments.length - 1]!;
    let cur: V = v;
    for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i]!;
        if (cur.t === "object") {
            const next = cur.v.get(seg);
            if (next === undefined) throw new Error("internal: path vanished");
            cur = next;
        } else if (cur.t === "array") {
            const idx = parseIndexSegment(seg);
            if (idx === null || idx >= cur.v.length) throw new Error("internal: path vanished");
            cur = cur.v[idx]!;
        } else {
            throw new Error("internal: path vanished");
        }
    }
    if (cur.t === "object") {
        const slot = cur.v.get(last);
        if (slot === undefined) throw new Error("internal: path vanished");
        cur.v.set(last, { t: "null" });
        return slot;
    }
    if (cur.t === "array") {
        const idx = parseIndexSegment(last);
        if (idx === null || idx >= cur.v.length) throw new Error("internal: path vanished");
        const slot = cur.v[idx]!;
        cur.v[idx] = { t: "null" };
        return slot;
    }
    throw new Error("internal: path vanished");
}

// ---------------------------------------------------------------------------
// The splice (splice.rs apply) — up to (but excluding) layout + verify
// ---------------------------------------------------------------------------

export interface PatchContext {
    /** Assembled candidate bytes (splice applied, layout not yet). */
    candidate: Uint8Array;
    /** Positional tree root + explicitness (for the layout pass). */
    root: Node;
    /** The layout splice triple (from, b1, insertedLen). */
    splice: [number, number, number];
}

export function spliceCandidate(
    text: Uint8Array,
    segments: readonly string[],
    replacement: V,
): { patch: PatchContext } | { err: EditError } {
    let originalValue: V;
    try {
        originalValue = parseValue(text);
    } catch (e) {
        return { err: unsupportedErr(e, "source text does not parse") };
    }
    const target = lookupValue(originalValue, segments);
    if (target === null) return { err: { k: "NotFound" } };
    if (eqV(target, replacement)) return { patch: { candidate: text, root: EMPTY_ROOT, splice: [0, 0, 0] } };

    let root: Node;
    let rootExplicit: boolean;
    try {
        const meta = buildTree(text);
        root = meta.root;
        rootExplicit = meta.rootExplicit;
    } catch (e) {
        return { err: unsupportedErr(e, "source text does not parse") };
    }

    // Descend the positional tree.
    let cur: Node = root;
    let rootFirst = false;
    let containerIsRoot = true;
    for (const seg of segments) {
        if (cur.kind === "object" && cur.table) {
            rootFirst = false;
            const next = cur.table.get(seg);
            if (next === undefined) return { err: { k: "NotFound" } };
            cur = next;
        } else if (cur.kind === "array" && cur.items) {
            const idx = parseIndexSegment(seg);
            if (idx === null || idx >= cur.items.length) return { err: { k: "NotFound" } };
            rootFirst = containerIsRoot && !rootExplicit && idx === 0;
            cur = cur.items[idx]!;
        } else {
            return { err: { k: "NotFound" } };
        }
        containerIsRoot = false;
    }
    const node = cur;
    const inline = node.inline;
    const slot: Slot | null = node.slot;
    if (!slot) {
        return {
            err: unsupported(
                "target is a noncontiguous value (dotted-key/reopen intermediate); no lossless single-range splice exists",
            ),
        };
    }
    const slotKind: SlotKind = slot.k;

    let body: [number, number];
    let anchor: number;
    let blockItemRole = false;
    if (slot.k === "pair") {
        body = [slot.b0, slot.b1];
        anchor = slot.colon;
    } else if (slot.k === "item") {
        body = [slot.b0, slot.b1];
        anchor = slot.start;
    } else {
        body = [slot.start, slot.end];
        anchor = slot.anchor ?? slot.start;
        blockItemRole = slot.anchor === null;
    }
    const b0 = body[0];
    const b1 = body[1];
    const a = anchor;
    if (a > b1 || b0 > b1 || b1 > text.length) {
        return { err: unsupported("internal: invalid marker/body offsets") };
    }

    const inlineItem = inline && slotKind === "item";
    let existingRaw = false;
    let wsRaw = "";
    let wsPlain = "";
    if (slotKind !== "block" && !inlineItem) {
        existingRaw = text[a + 1] === 0x3a;
        if (existingRaw) {
            if (a + 2 > b0) return { err: unsupported("internal: invalid raw marker range") };
            wsRaw = decodeRange(text, a + 2, b0);
        }
        if (slotKind === "pair") {
            if (a + 1 > b0) return { err: unsupported("internal: invalid plain marker range") };
            wsPlain = decodeRange(text, a + 1, b0);
        }
    }

    // Structural replacement must not erase interior comments.
    if (node.kind === "object" || node.kind === "array") {
        const ranges: Array<[number, number]> = [];
        collectMultilineScalarRanges(node, ranges);
        if (hasCommentLine(text, b0, b1, ranges)) {
            return {
                err: unsupported(
                    "target container contains comment lines; structural replacement cannot preserve them losslessly",
                ),
            };
        }
    }

    const indent = lineIndent(text, a);
    const eol = detectEol(text, b1);
    const pc: PlanCtx = {
        slot: slotKind,
        roleItemBlock: slotKind === "block" && blockItemRole,
        existingRaw,
        rootFirst,
        indent,
        eol,
        inlineCompound:
            slotKind !== "block" && (node.kind === "object" || node.kind === "array"),
        blockCompound:
            slotKind === "block" && (node.kind === "object" || node.kind === "array"),
    };
    const wsPairBlock =
        slotKind !== "block" || blockItemRole ? "" : decodeRange(text, a + 1, b0);

    let plan: SplicePlan;
    if (inline) {
        if (slotKind === "item" && replacement.t === "string" && replacement.v.length === 0) {
            plan = { from: b0, prefix: ["", ""], body: bodyOf("()") };
        } else if (slotKind === "item") {
            const r = inlineBody(replacement, true);
            if ("err" in r) return r;
            plan = { from: b0, prefix: ["", ""], body: r.body };
        } else if (slotKind === "pair" && existingRaw && replacement.t !== "string") {
            const r = inlineBody(replacement, false);
            if ("err" in r) return r;
            plan = { from: a + 1, prefix: [wsRaw, ""], body: r.body };
        } else {
            const r = inlineBody(replacement, !existingRaw);
            if ("err" in r) return r;
            plan = { from: b0, prefix: ["", ""], body: r.body };
        }
    } else if (slotKind === "block") {
        const r = blockReplacement(replacement, pc, a, b0, wsPairBlock);
        if ("err" in r) return r;
        plan = r;
    } else {
        const r = planValue(replacement, pc);
        if ("err" in r) return r;
        const desiredRaw = r.desiredRaw;
        if (existingRaw === desiredRaw) {
            const prefix = b0 === b1 && wsPlain.length === 0 && wsRaw.length === 0 ? " " : "";
            plan = { from: b0, prefix: [prefix, ""], body: r.body };
        } else if (existingRaw && !desiredRaw && slotKind === "pair") {
            plan = { from: a + 1, prefix: [sepWs(b0, b1, wsRaw), ""], body: r.body };
        } else if (existingRaw && !desiredRaw) {
            plan = { from: a, prefix: [wsRaw, ""], body: r.body };
        } else if (!existingRaw && desiredRaw && slotKind === "pair") {
            plan = { from: a + 1, prefix: [":", sepWs(b0, b1, wsPlain)], body: r.body };
        } else {
            plan = { from: a, prefix: [":: ", ""], body: r.body };
        }
    }

    const from = plan.from;
    if (from > b1 || b1 > text.length) {
        return { err: unsupported("internal: splice range out of bounds") };
    }
    const prefixText = plan.prefix[0] + plan.prefix[1];
    const insertedLen = byteLen(prefixText) + plan.body.length;
    const candidate = new Uint8Array(text.length - (b1 - from) + insertedLen);
    candidate.set(text.subarray(0, from), 0);
    candidate.set(utf8(prefixText), from);
    candidate.set(plan.body, from + byteLen(prefixText));
    candidate.set(text.subarray(b1), from + insertedLen);

    return {
        patch: {
            candidate,
            root,
            splice: [from, b1, insertedLen],
        },
    };
}

// ── Public API ───────────────────────────────────────────────────────

const EMPTY_ROOT: Node = {
    kind: "object",
    table: new Map(),
    items: null,
    inline: false,
    slot: null,
};
