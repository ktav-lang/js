// Pure-TypeScript entrypoint — the parser + writer halves of the
// backend are implemented in TypeScript (ts/pure/*) with zero native,
// WASM, FFI, Node-builtin or subprocess dependencies; safe to load in
// any browser or JS runtime. Input text is converted with the standard
// global `TextEncoder` only, so every byte offset in an error envelope
// indexes the UTF-8 encoding of the input string — same contract as the
// native backends.

import { parse, parseText } from "./pure/parse.js";
import { jsToV } from "./pure/ktavvalue.js";
import { renderPretty } from "./pure/writer.js";
import { emitCanonicalJs, canonicalFromSourceText } from "./pure/canonical.js";
import { formatText } from "./pure/formatter.js";
import { editValueSource, editValueSegmentsSource } from "./pure/edit.js";
import { insertValueSource, insertValueSegmentsSource, removeValueSource, removeValueSegmentsSource, renameKeySource, renameKeySegmentsSource } from "./pure/edit/mutate.js";

import { ktavMessageError, toKtavError } from "./internal/api.js";
import type { KtavInput, KtavValue } from "./internal/api.js";
export type { KtavArray, KtavErrorEnvelope, KtavInput, KtavObject, KtavValue, Ktav } from "./internal/api.js";
export { KtavError, ktavMessageError, toKtavError } from "./internal/api.js";

export function loads<T = KtavValue>(s: string): T {
    try {
        return parseText(s) as T;
    } catch (e) {
        throw toKtavError(e);
    }
}

/**
 * Raw-byte entry: parse a Uint8Array as UTF-8 Ktav text without any
 * TextEncoder re-encoding step. The 0.8.1 conformance corpus's
 * invalid_utf8/ fixtures are only meaningful if the parser receives
 * the exact bytes; `loads` cannot express that (its input is already
 * a JS string). Throws KtavError with error === "InvalidUtf8" for
 * invalid input, before any grammar diagnosis (§6.15).
 */
export function loadsBytes<T = KtavValue>(bytes: Uint8Array): T {
    try {
        return parse(bytes, {}) as T;
    } catch (e) {
        throw toKtavError(e);
    }
}

export function loadsStrict<T = KtavValue>(s: string): T {
    try {
        return parseText(s, { strict: true }) as T;
    } catch (e) {
        throw toKtavError(e);
    }
}

export function dumps<T extends KtavInput = KtavInput>(obj: T): string {
    if (obj === null || typeof obj !== "object") {
        throw ktavMessageError("top-level Ktav document must be an object or array");
    }
    try {
        return renderPretty(jsToV(obj), false);
    } catch (e) {
        throw toKtavError(e);
    }
}

export function stringifyForceStrings<T extends KtavInput = KtavInput>(obj: T): string {
    if (obj === null || typeof obj !== "object") {
        throw ktavMessageError("top-level Ktav document must be an object or array");
    }
    try {
        return renderPretty(jsToV(obj), true);
    } catch (e) {
        throw toKtavError(e);
    }
}

export function format(s: string): string {
    try {
        return formatText(s);
    } catch (e) {
        throw toKtavError(e);
    }
}

export function emitCanonical<T extends KtavInput = KtavInput>(obj: T): string {
    if (obj === null || typeof obj !== "object") {
        throw ktavMessageError("top-level Ktav document must be an object or array");
    }
    try {
        return emitCanonicalJs(obj);
    } catch (e) {
        throw toKtavError(e);
    }
}

export function canonicalFromSource(s: string): string {
    try {
        return canonicalFromSourceText(s);
    } catch (e) {
        throw toKtavError(e);
    }
}

export function insertValue(source: string, path: string, value: KtavValue): string { try { return insertValueSource(source,path,value); } catch(e) { throw toKtavError(e); } }
export function insertValueSegments(source: string, segments: readonly string[], value: KtavValue): string { try { return insertValueSegmentsSource(source,segments,value); } catch(e) { throw toKtavError(e); } }
export function removeValue(source: string, path: string): string { try { return removeValueSource(source,path); } catch(e) { throw toKtavError(e); } }
export function removeValueSegments(source: string, segments: readonly string[]): string { try { return removeValueSegmentsSource(source,segments); } catch(e) { throw toKtavError(e); } }
export function renameKey(source: string, path: string, newKey: string): string { try { return renameKeySource(source,path,newKey); } catch(e) { throw toKtavError(e); } }
export function renameKeySegments(source: string, segments: readonly string[], newKey: string): string { try { return renameKeySegmentsSource(source,segments,newKey); } catch(e) { throw toKtavError(e); } }

export function editValue(source: string, path: string, replacement: KtavValue): string {
    try {
        return editValueSource(source, path, replacement);
    } catch (e) {
        throw toKtavError(e);
    }
}

export function editValueSegments(
    source: string,
    segments: readonly string[],
    replacement: KtavValue,
): string {
    try {
        return editValueSegmentsSource(source, segments, replacement);
    } catch (e) {
        throw toKtavError(e);
    }
}
