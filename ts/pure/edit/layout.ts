// Minimal inline-wrapper expansion — edit/splice/layout.rs port. When
// the spliced line loses readability (multiline string, growth past
// max(100 Unicode scalars, the previous physical line length), or a
// replacement needing >= 4 escapes with >= 25% overhead), the touched
// inline ancestor chain is promoted to block form; untouched nested
// branches stay inline. Escapes that stop being escapes after the move
// are re-verified semantically; when no lossless standalone form
// exists (CR or a line `))`) the valid inline candidate is kept.

import { decodeRange, leadingBomLen, trimWs, trimWsStart } from "../bytes.js";
import { findUnescapedColon, processEscapes } from "../lexer.js";
import { MAX_INLINE_DEPTH, scanInlineBody } from "../inline.js";
import { parseValue } from "../parse.js";
import type { V } from "../values.js";
import {
    charCount,
    detectEol,
    eqV,
    isCompoundBytes,
    lineIndent,
    physicalLine,
    unsupported,
    unsupportedErr,
    utf8,
    type EditError,
    type ErrCtxInternal,
} from "./shared.js";
import { slotBody, treeChild, type Node } from "./tree.js";
import {
    encodeInline,
    planValue,
    type PlanCtx,
} from "./splice.js";

export function layoutAdjust(
    source: Uint8Array,
    candidate: Uint8Array,
    root: Node,
    path: readonly string[],
    replacement: V,
    splice: [number, number, number],
): { result: Uint8Array } | { err: EditError } {
    const [from, to, inserted] = splice;
    if (candidate === source) return { result: candidate }; // byte-identical no-op
    const owner = inlineOwner(source, root, path, from);
    if (!owner) return { result: candidate };
    if ("err" in owner) return owner;
    const [start, end] = owner;
    if (from < start) return { result: candidate };
    const newEnd = end - (to - from) + inserted;
    if (newEnd < start || newEnd > candidate.length) {
        return { err: unsupported("invalid layout boundaries") };
    }
    if (!isCompoundBytes(candidate, start, newEnd)) return { result: candidate };
    const oldWidth = charCount(source, ...physicalLine(source, from));
    const limit = Math.max(100, oldWidth);
    const force = requiresBlock(replacement, 0);
    if (typeof force === "object") return force;
    const [cFrom, cTo] = physicalLine(candidate, from);
    if (!force && charCount(candidate, cFrom, cTo) <= limit) {
        return { result: candidate };
    }
    const indent = lineIndent(source, start);
    const eol = detectEol(source, end);
    const body = candidate.slice(start, newEnd);
    const expanded = expand(
        body,
        indent,
        eol,
        limit,
        [from - start, from - start + inserted],
        force,
        0,
    );
    if ("err" in expanded) return expanded;
    if (expanded.expanded === null) return { result: candidate };
    const head = candidate.slice(0, start);
    const tail = candidate.slice(newEnd);
    const mid = utf8(expanded.expanded);
    const result = new Uint8Array(head.length + mid.length + tail.length);
    result.set(head, 0);
    result.set(mid, head.length);
    result.set(tail, head.length + mid.length);
    return { result };
}

// ---------------------------------------------------------------------------
// Owner discovery (layout.rs inline_owner)
// ---------------------------------------------------------------------------

function inlineOwner(
    source: Uint8Array,
    root: Node,
    path: readonly string[],
    pos: number,
): [number, number] | null | { err: EditError } {
    if (root.inline) {
        const [ls, le] = physicalLine(source, pos);
        let [tlo, thi] = trimWs(source, ls, le);
        if (leadingBomLen(source.subarray(tlo, thi)) === 3) tlo += 3;
        return [tlo, thi];
    }
    let node: Node | null = root;
    for (const seg of path) {
        node = treeChild(node, seg);
        if (!node) return { err: { k: "NotFound" } };
        if (node.slot) {
            const [start, end] = slotBody(node.slot);
            if (
                (node.kind === "object" || node.kind === "array") &&
                isCompoundBytes(source, start, end) &&
                !containsEol(source, start, end)
            ) {
                return [start, end];
            }
        }
    }
    if (node.inline) {
        const [ls, le] = physicalLine(source, pos);
        let [tlo, thi] = trimWs(source, ls, le);
        if (leadingBomLen(source.subarray(tlo, thi)) === 3) tlo += 3;
        let blo: number;
        let bhi: number;
        if (isCompoundBytes(source, tlo, thi)) {
            blo = tlo;
            bhi = thi;
        } else {
            const colon = findUnescapedColon(source, tlo, thi);
            if (colon === -1) return null;
            blo = trimWsStart(source, colon + 1, thi);
            bhi = thi;
        }
        if (isCompoundBytes(source, blo, bhi)) return [blo, bhi];
    }
    return null;
}

function containsEol(bytes: Uint8Array, lo: number, hi: number): boolean {
    for (let i = lo; i < hi; i++) {
        const b = bytes[i];
        if (b === 0x0a || b === 0x0d) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// The block-forcing criterion (layout.rs requires_block)
// ---------------------------------------------------------------------------

export function requiresBlock(value: V, depth: number): boolean | { err: EditError } {
    if (depth > MAX_INLINE_DEPTH) {
        return { err: unsupported("replacement nesting exceeds inline depth limit (128)") };
    }
    switch (value.t) {
        case "string": {
            const s = value.v;
            if (s.includes("\n") || s.includes("\r")) return true;
            const encoded = encodeInline(s, false);
            let escapes = 0;
            for (let i = 0; i < encoded.length; i++) {
                if (encoded[i] === "\\") {
                    escapes++;
                    i++; // skip the escaped char
                }
            }
            const plain = Array.from(s).length;
            const overhead = Math.max(0, Array.from(encoded).length - plain);
            return escapes >= 4 && overhead >= Math.ceil(plain / 4);
        }
        case "object":
            for (const child of value.v.values()) {
                const r = requiresBlock(child, depth + 1);
                if (r !== false) return r;
            }
            return false;
        case "array":
            for (const child of value.v) {
                const r = requiresBlock(child, depth + 1);
                if (r !== false) return r;
            }
            return false;
        default:
            return false;
    }
}

// ---------------------------------------------------------------------------
// Expansion (layout.rs expand / standalone)
// ---------------------------------------------------------------------------

function expand(
    bytes: Uint8Array, // body bytes (relative coordinates, base = body start)
    indent: string,
    eol: string,
    limit: number,
    changed: [number, number],
    force: boolean,
    depth: number,
): { expanded: string | null } | { err: EditError } {
    if (depth > MAX_INLINE_DEPTH) {
        return { err: unsupported("layout nesting exceeds inline depth limit") };
    }
    const object = bytes[0] === 0x7b;
    const open = object ? 0x7b : 0x5b;
    const close = object ? 0x7d : 0x5d;
    const ctx: ErrCtxInternal = { bytes, line: 1, span: { start: 0, end: 0 } };
    const scan = scanInlineBody(bytes, 0, bytes.length, open, close, ctx);
    if (scan.badEscape !== null || scan.closerIdx !== bytes.length - 1) {
        return { err: unsupported("cannot split inline layout") };
    }
    const childIndent = `${indent}    `;
    const out: string[] = [object ? "{" : "["];
    for (const [slo, shi] of scan.segments) {
        const [tlo, thi] = trimWs(bytes, slo, shi);
        if (tlo >= thi) continue;
        const offset = tlo;
        const partLen = thi - tlo;
        const touched = offset < changed[1] && offset + partLen > changed[0];
        let prefixHi: number;
        let vlo: number;
        let raw: boolean;
        if (object) {
            const colon = findUnescapedColon(bytes, tlo, thi);
            if (colon === -1) return { err: unsupported("inline pair has no separator") };
            raw = bytes[colon + 1] === 0x3a;
            vlo = trimWsStart(bytes, raw ? colon + 2 : colon + 1, thi);
            prefixHi = vlo; // key + colon + ws: [tlo, vlo)
        } else {
            prefixHi = tlo;
            vlo = tlo;
            raw = false;
        }
        out.push(eol, childIndent);
        const childCompoundEnds =
            (bytes[vlo] === 0x7b || bytes[vlo] === 0x5b) && isCompoundBytes(bytes, vlo, thi);
        if (
            !raw &&
            childCompoundEnds &&
            touched &&
            (force || Array.from(childIndent).length + charCount(bytes, tlo, thi) > limit)
        ) {
            const valueOffset = vlo;
            const local: [number, number] = [
                Math.max(0, changed[0] - valueOffset),
                Math.max(0, changed[1] - valueOffset),
            ];
            out.push(decodeRange(bytes, tlo, prefixHi));
            const child = expand(
                bytes.slice(vlo, thi),
                childIndent,
                eol,
                limit,
                local,
                force,
                depth + 1,
            );
            if ("err" in child) return child;
            if (child.expanded === null) return { expanded: null };
            out.push(child.expanded);
        } else {
            const child = standalone(
                bytes,
                tlo,
                thi,
                vlo,
                raw,
                object,
                childIndent,
                eol,
            );
            if ("err" in child) return child;
            if (child.piece === null) return { expanded: null };
            out.push(child.piece);
        }
    }
    out.push(eol, indent, object ? "}" : "]");
    return { expanded: out.join("") };
}

function standalone(
    bytes: Uint8Array,
    tlo: number,
    thi: number,
    vlo: number,
    raw: boolean,
    object: boolean,
    indent: string,
    eol: string,
): { piece: string | null } | { err: EditError } {
    const partText = decodeRange(bytes, tlo, thi);
    const bodyText = decodeRange(bytes, vlo, thi);
    const probeCtx = (): ErrCtxInternal => ({
        bytes: utf8(partText),
        line: 1,
        span: { start: 0, end: 0 },
    });
    // Moving escapes out of inline context changes their meaning:
    // verify the semantics survive before promoting verbatim.
    const inlineSrc = object ? `{${partText}}` : `[${partText}]`;
    let expected: V;
    try {
        expected = parseValue(utf8(inlineSrc));
    } catch (e) {
        return { err: unsupportedErr(e, "invalid inline layout") };
    }
    const blockSrc = object ? partText : `[\n${partText}\n]`;
    let movedEquals: boolean;
    try {
        movedEquals = eqV(parseValue(utf8(blockSrc)), expected);
    } catch {
        movedEquals = false;
    }
    if (movedEquals) return { piece: partText };
    let value: V;
    if (raw) {
        try {
            value = { t: "string", v: processEscapes(bytes, vlo, thi, probeCtx()).text };
        } catch (e) {
            return { err: unsupportedErr(e, "invalid inline string") };
        }
    } else {
        const wrapped = `[${bodyText}]`;
        try {
            const parsed = parseValue(utf8(wrapped));
            if (parsed.t !== "array" || parsed.v.length !== 1) {
                return { err: unsupported("moved inline value is not a single value") };
            }
            value = parsed.v[0]!;
        } catch (e) {
            return { err: unsupportedErr(e, "cannot decode moved inline value") };
        }
    }
    if (value.t === "string") {
        const s = value.v;
        if (
            s.includes("\r") ||
            s.split("\n").some(
                (line) => line.replace(/^[\t ]+/, "").replace(/[\t ]+$/, "") === "))",
            )
        ) {
            return { piece: null };
        }
    }
    const pc: PlanCtx = {
        slot: object ? "pair" : "item",
        roleItemBlock: false,
        existingRaw: raw,
        rootFirst: false,
        indent,
        eol,
        inlineCompound: true,
        blockCompound: false,
    };
    const planned = planValue(value, pc);
    if ("err" in planned) return planned;
    const out: string[] = [];
    if (object) {
        const colon = findUnescapedColon(bytes, tlo, thi);
        if (colon === -1) return { err: unsupported("moved pair has no separator") };
        out.push(decodeRange(bytes, tlo, colon + 1));
        if (planned.desiredRaw) out.push(":");
        const ws = decodeRange(bytes, raw ? colon + 2 : colon + 1, vlo);
        out.push(ws.length === 0 ? " " : ws);
    } else if (planned.desiredRaw) {
        out.push(":: ");
    }
    out.push(decodeRange(planned.body, 0, planned.body.length));
    return { piece: out.join("") };
}
