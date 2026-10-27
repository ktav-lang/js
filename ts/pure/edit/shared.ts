// Shared internals of the source-edit engine (formerly one file,
// ts/pure/edit.ts): the EditError triad + envelope mapping, value
// equality, and the byte-level helpers every stage (path / tree /
// splice / layout) uses. No public surface lives here.

import {
    decodeRange,
} from "../bytes.js";
import { KtavError, type KtavErrorEnvelope } from "../../internal/api.js";
import type { V } from "../values.js";

const ENC = new TextEncoder();

export function utf8(s: string): Uint8Array {
    return ENC.encode(s);
}

export function byteLen(s: string): number {
    return ENC.encode(s).length;
}

// ---------------------------------------------------------------------------
// EditError — the three typed outcomes (edit.rs EditError)
// ---------------------------------------------------------------------------

export type EditError =
    | { k: "InvalidPath"; offset: number }
    | { k: "NotFound" }
    | { k: "AlreadyExists" }
    | { k: "Unsupported"; reason: string };

export function unsupported(reason: string): EditError {
    return { k: "Unsupported", reason };
}

export function unsupportedErr(e: unknown, fallback: string): EditError {
    return unsupported(e instanceof Error && e.message ? `${fallback}: ${e.message}` : fallback);
}

/** Envelope + message contract (cabi edit errors): the same ten fields
 *  as every other envelope, `body` = decimal byte offset for
 *  EditInvalidPath / reason string for EditUnsupported, all location
 *  fields null (the operation is not a source-content parse error). */
export function editErrorToKtav(e: EditError): KtavError {
    let error: string;
    let body: string | null = null;
    let message: string;
    switch (e.k) {
        case "InvalidPath":
            error = "EditInvalidPath";
            body = String(e.offset);
            message = `invalid edit path (bad escape or empty segment) at byte ${e.offset}`;
            break;
        case "NotFound":
            error = "EditNotFound";
            message = "edit path does not address an existing value";
            break;
        case "AlreadyExists":
            error = "EditAlreadyExists";
            message = "edit target already exists; insertion never overwrites";
            break;
        case "Unsupported":
            error = "EditUnsupported";
            body = e.reason;
            message = `no lossless source edit: ${e.reason}`;
            break;
    }
    const env: KtavErrorEnvelope = {
        error,
        reason: null,
        line: null,
        line_text: null,
        span: null,
        path: null,
        body,
        canonical: null,
        spec_section: null,
        message,
    };
    return new KtavError(env, message);
}

// ---------------------------------------------------------------------------
// Value equality (IndexMap PartialEq — order-insensitive objects)
// ---------------------------------------------------------------------------

export function eqV(a: V, b: V): boolean {
    if (a.t !== b.t) return false;
    switch (a.t) {
        case "null":
            return true;
        case "bool":
        case "int":
        case "float":
        case "string":
            return a.v === (b as typeof a).v;
        case "array": {
            const av = a.v;
            const bv = (b as typeof a).v;
            if (av.length !== bv.length) return false;
            for (let i = 0; i < av.length; i++) {
                if (!eqV(av[i]!, bv[i]!)) return false;
            }
            return true;
        }
        case "object": {
            const am = a.v;
            const bm = (b as typeof a).v;
            if (am.size !== bm.size) return false;
            for (const [k, v] of am) {
                const other = bm.get(k);
                if (other === undefined || !eqV(v, other)) return false;
            }
            return true;
        }
    }
}

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

export function findAny(bytes: Uint8Array, lo: number, hi: number, a: number, b: number): number {
    for (let i = lo; i < hi; i++) {
        const v = bytes[i];
        if (v === a || v === b) return i;
    }
    return -1;
}

export function rfindAny(bytes: Uint8Array, lo: number, hi: number, a: number, b: number): number {
    for (let i = hi - 1; i >= lo; i--) {
        const v = bytes[i];
        if (v === a || v === b) return i;
    }
    return -1;
}

export function isCompoundBytes(bytes: Uint8Array, lo: number, hi: number): boolean {
    if (hi - lo < 2) return false;
    const f = bytes[lo];
    const l = bytes[hi - 1];
    return (f === 0x7b && l === 0x7d) || (f === 0x5b && l === 0x5d);
}

export function containsEol(bytes: Uint8Array, lo: number, hi: number): boolean {
    return findAny(bytes, lo, hi, 0x0a, 0x0d) !== -1;
}

export function physicalLine(bytes: Uint8Array, pos: number): [number, number] {
    const r = rfindAny(bytes, 0, pos, 0x0a, 0x0d);
    const start = r === -1 ? 0 : r + 1;
    const f = findAny(bytes, pos, bytes.length, 0x0a, 0x0d);
    const end = f === -1 ? bytes.length : f;
    return [start, end];
}

export function charCount(bytes: Uint8Array, lo: number, hi: number): number {
    return Array.from(decodeRange(bytes, lo, hi)).length;
}

/** Leading `    ` of the line containing `pos`. */
export function lineIndent(bytes: Uint8Array, pos: number): string {
    const r = rfindAny(bytes, 0, pos, 0x0a, 0x0d);
    const start = r === -1 ? 0 : r + 1;
    let end = start;
    while (end < bytes.length && (bytes[end] === 0x20 || bytes[end] === 0x09)) end++;
    return decodeRange(bytes, start, end);
}

/** EOL style detected at/after `pos`; falls back to scanning before. */
export function detectEol(bytes: Uint8Array, pos: number): string {
    const n = bytes.length;
    let i = pos;
    while (i < n) {
        const b = bytes[i]!;
        if (b === 0x0a) return "\n";
        if (b === 0x0d) return bytes[i + 1] === 0x0a ? "\r\n" : "\r";
        i++;
    }
    const r = rfindAny(bytes, 0, pos, 0x0a, 0x0d);
    if (r !== -1) {
        if (bytes[r] === 0x0d) return "\r";
        if (r > 0 && bytes[r - 1] === 0x0d) return "\r\n";
    }
    return "\n";
}

// ---------------------------------------------------------------------------
// §3.3 whitespace (line-bounded view) on JS chars — splice helpers
// ---------------------------------------------------------------------------

export function isInlineWsCp(cp: number): boolean {
    return (
        cp === 0x20 || cp === 0x09 || cp === 0x0b || cp === 0x0c ||
        cp === 0x85 || cp === 0xa0 || cp === 0x1680 ||
        (cp >= 0x2000 && cp <= 0x200a) || cp === 0x2028 || cp === 0x2029 ||
        cp === 0x202f || cp === 0x205f || cp === 0x3000
    );
}

export function firstCp(s: string): number | undefined {
    return s.codePointAt(0);
}

export function lastCp(s: string): number | undefined {
    return s.codePointAt(s.length - 1);
}

export function edgeWs(s: string): boolean {
    const f = firstCp(s);
    const l = lastCp(s);
    return (f !== undefined && isInlineWsCp(f)) || (l !== undefined && isInlineWsCp(l));
}

// ---------------------------------------------------------------------------
// Path helpers shared by the tree descend and verification
// ---------------------------------------------------------------------------

/** Array index segment: ASCII digits only (leading zeros allowed,
 *  signs are not indexes); overflow → NotFound. */
export function parseIndexSegment(seg: string): number | null {
    if (seg.length === 0 || !/^[0-9]+$/.test(seg)) return null;
    const n = Number(seg);
    return Number.isSafeInteger(n) ? n : null;
}

/** Parser error context mirrored locally so the edit engine does not
 *  depend on the parser's internal threading. */
export interface ErrCtxInternal {
    bytes: Uint8Array;
    line: number;
    span: { start: number; end: number };
}
