// Internal entry surface for the pure TypeScript backend parser half.
// The next task (writer + public `ts/pure.ts`) consumes these exports.

import { validateUtf8 } from "./bytes.js";
import { throwKtav } from "./errors.js";

import { KtavParser } from "./parser.js";
import { toJs } from "./values.js";
import type { V } from "./values.js";

export { MAX_INLINE_DEPTH } from "./inline.js";
export type { V } from "./values.js";
export { toJs, kindLabel, isObjectV, newObjectV, emptyStringV } from "./values.js";
export { KtavError } from "../internal/api.js";
export type { KtavErrorEnvelope, KtavValue } from "../internal/api.js";
export { buildKtavError, throwKtav, type ErrCtx, type ErrKind, type Span } from "./errors.js";

export interface ParseOptions {
    /** Reject lossy canonical scalars (§3.6 / §5.2) — `parse_strict`. */
    strict?: boolean;
}

/**
 * Validate raw bytes and parse them into the internal value tree.
 * UTF-8 validation runs FIRST (§6.15): `InvalidUtf8` is reported
 * before any grammar diagnosis, with a span covering the offending
 * sequence (`std::str::Utf8Error::error_len`, or to end-of-input when
 * truncated at EOF) — rust/src/cabi/envelope.rs `not_utf8_envelope`. One leading BOM (§3.1) is skipped for
 * parsing but its bytes stay in the coordinate space, so all error
 * spans remain offsets into the ORIGINAL input.
 */
export function parseValue(bytes: Uint8Array, opts: ParseOptions = {}): V {
    const bad = validateUtf8(bytes);
    if (bad !== null) {
        throwKtav(
            { k: "InvalidUtf8", validUpTo: bad.validUpTo, errorLen: bad.errorLen },
            bytes,
            null,
        );
    }
    const parser = new KtavParser(opts.strict === true, bytes);
    return parser.run();
}

/** Parse a UTF-8 byte buffer into a native JavaScript value. */
export function parse(bytes: Uint8Array, opts: ParseOptions = {}): ReturnType<typeof toJs> {
    return toJs(parseValue(bytes, opts));
}

/** Text entry: encode via TextEncoder, then `parse`
 *  (loads / loadsStrict). */
export function parseText(text: string, opts: ParseOptions = {}): ReturnType<typeof toJs> {
    const encoded = new TextEncoder().encode(text);
    return parse(encoded, opts);
}

