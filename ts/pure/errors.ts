// Structured error envelope construction for the pure TypeScript parser.
//
// The ten-field wire contract, the `message` renderings, the `path`
// derivation rules and the `spec_section` table are ported verbatim from
// `rust/src/error/error.rs` (`ErrorKind`, `Display`), `display.rs` and
// `envelope.rs` (`from_error`, `kind_spec_section`, `line_text_at`).
// The typed `KtavError` class is REUSED from `ts/internal/api.ts` —
// this module only assembles its envelope.

import { KtavError, type KtavErrorEnvelope } from "../internal/api.js";
import { lineOfOffset, tryDecodeRange } from "./bytes.js";

/** Half-open byte span into the UTF-8 source. */
export interface Span {
    start: number;
    end: number;
}

export type CompoundKindName = "object" | "array" | "multiline";

/** One structured parse-error payload, mirroring `ErrorKind`. */
export type ErrKind =
    | { k: "MissingSeparatorSpace"; line: number; span: Span }
    | { k: "LossyScalar"; line: number; body: string; canonical: string; span: Span }
    | { k: "DuplicateKey"; line: number; key: string; span: Span }
    | {
          k: "KeyPathConflict";
          line: number;
          path: string;
          span: Span;
          conflict:
              | { t: "overwrite"; existing: string; newKind: string }
              | { t: "blocked" };
      }
    | { k: "EmptyKey"; line: number; span: Span }
    | { k: "InvalidKey"; line: number; key: string; span: Span }
    | { k: "UnclosedCompound"; kind: CompoundKindName; span: Span }
    | {
          k: "UnbalancedBracket";
          line: number;
          span: Span;
          expected: "object" | "array";
          found: "}" | "]";
      }
    | { k: "MissingSeparator"; line: number; span: Span }
    | { k: "UnterminatedInlineCompound"; line: number; span: Span }
    | { k: "UnterminatedQuotedKey"; line: number; span: Span }
    | { k: "MalformedInlineCompound"; line: number; span: Span; detail: string }
    | { k: "BadEscapeSequence"; line: number; span: Span; sequence: string }
    | { k: "OrphanLineAfterTopLevelInline"; line: number; span: Span }
    | { k: "Other"; line: number | null; message: string; span: Span }
    | { k: "InvalidUtf8"; validUpTo: number; errorLen: number | null };

/** Class name spellings — `ErrorKind::code_name` / the top-level
 *  `Error` variant names (`envelope.rs from_error`). */
function codeName(kind: ErrKind): string {
    switch (kind.k) {
        case "InvalidUtf8":
            return "InvalidUtf8";
        case "MissingSeparatorSpace":
            return "MissingSeparatorSpace";
        case "LossyScalar":
            return "LossyScalar";
        case "DuplicateKey":
            return "DuplicateKey";
        case "KeyPathConflict":
            return "KeyPathConflict";
        case "EmptyKey":
            return "EmptyKey";
        case "InvalidKey":
            return "InvalidKey";
        case "UnclosedCompound":
            return "UnclosedCompound";
        case "UnbalancedBracket":
            return "UnbalancedBracket";
        case "MissingSeparator":
            return "MissingSeparator";
        case "UnterminatedInlineCompound":
            return "UnterminatedInlineCompound";
        case "UnterminatedQuotedKey":
            return "UnterminatedQuotedKey";
        case "MalformedInlineCompound":
            return "MalformedInlineCompound";
        case "BadEscapeSequence":
            return "BadEscapeSequence";
        case "OrphanLineAfterTopLevelInline":
            return "OrphanLineAfterTopLevelInline";
        case "Other":
            return "Other";
    }
}

/** Governing spec section per class — `envelope.rs kind_spec_section`. */
function specSection(kind: ErrKind): string | null {
    switch (kind.k) {
        case "MissingSeparatorSpace":
            return "§6.10";
        case "LossyScalar":
            return "§3.6/§5.2";
        case "DuplicateKey":
            return "§6.2";
        case "KeyPathConflict":
            return "§6.3";
        case "EmptyKey":
            return "§6.5";
        case "InvalidKey":
            return "§6.4";
        case "UnclosedCompound":
        case "UnbalancedBracket":
            return "§6.1";
        case "MissingSeparator":
            return "§6.6";
        case "UnterminatedInlineCompound":
            return "§6.11";
        case "UnterminatedQuotedKey":
            return "§6.16";
        case "MalformedInlineCompound":
            return "§6.12";
        case "BadEscapeSequence":
            return "§6.13";
        case "OrphanLineAfterTopLevelInline":
            return "§6.14";
        case "InvalidUtf8":
            return "§6.15";
        case "Other":
            return null; // parser-internal: no governing section
    }
}

function spanOf(kind: ErrKind, bytes: Uint8Array): Span | null {
    switch (kind.k) {
        case "InvalidUtf8": {
            // `not_utf8_envelope` (rust/src/cabi/envelope.rs lines 34-58):
            // the span covers the offending sequence — end =
            // valid_up_to + error_len, or src.len() when the sequence is
            // truncated at EOF (error_len None). An illegal lead byte is
            // reported as a one-byte sequence, but any following
            // continuation bytes belong to the same ill-formed
            // subsequence, so the span swallows them (§6.15 fixes only
            // the span's start).
            const start = kind.validUpTo;
            let end =
                kind.errorLen !== null
                    ? start + kind.errorLen
                    : bytes.length;
            if (kind.errorLen === 1) {
                while (end < bytes.length && bytes[end]! >= 0x80 && bytes[end]! <= 0xbf) {
                    end++;
                }
            }
            return { start, end };
        }
        case "Other":
        case "UnclosedCompound":
        case "LossyScalar":
        case "DuplicateKey":
        case "KeyPathConflict":
        case "EmptyKey":
        case "InvalidKey":
        case "UnbalancedBracket":
        case "MissingSeparator":
        case "UnterminatedInlineCompound":
        case "UnterminatedQuotedKey":
        case "MalformedInlineCompound":
        case "BadEscapeSequence":
        case "OrphanLineAfterTopLevelInline":
        case "MissingSeparatorSpace":
            return kind.span;
    }
}

/** 1-based line, or null — `ErrorKind::line` in traits.rs. `InvalidUtf8`
 *  carries none here but `buildKtavError` sets it explicitly from the
 *  raw bytes; the null-returning `UnclosedCompound` is filled in from
 *  its opener..EOF span by the same general post-step the C ABI applies
 *  (envelope.rs `envelope`, lines 5-16). */
function lineOf(kind: ErrKind): number | null {
    if (kind.k === "UnclosedCompound" || kind.k === "InvalidUtf8") return null;
    return kind.line;
}

/** The source line containing byte offset `pos` — envelope.rs
 *  `line_text_at`. Line boundaries are ALL THREE §3.2 terminators over
 *  the raw bytes (LF, lone CR, CRLF); an offset pointing at a
 *  terminator names the line that terminator closes, consistent with
 *  `lineOfOffset`. One trailing CR is stripped (defensive). A raw line
 *  that is not valid UTF-8 yields null (documented ABI behaviour —
 *  for normal parse errors the input is already validated, so decode
 *  cannot fail). */
function lineTextAt(bytes: Uint8Array, pos: number): string | null {
    if (bytes.length === 0) return null;
    const p = Math.min(pos, bytes.length);
    let lineStart = 0;
    for (let i = p - 1; i >= 0; i--) {
        const b = bytes[i]!;
        if (b === 0x0a) {
            lineStart = i + 1;
            break;
        }
        if (b === 0x0d) {
            if (i + 1 === p && bytes[i + 1] === 0x0a) {
                // `p` points at the LF of a CRLF: the whole terminator
                // ends strictly after p, so p belongs to the line the
                // CRLF closes — keep scanning past this terminator.
                continue;
            }
            lineStart = i + 1;
            break;
        }
    }
    let lineEnd = bytes.length;
    for (let i = p; i < bytes.length; i++) {
        const b = bytes[i]!;
        if (b === 0x0a || b === 0x0d) {
            lineEnd = i;
            break;
        }
    }
    let end = lineEnd;
    if (end > lineStart && bytes[end - 1] === 0x0d) end--;
    return tryDecodeRange(bytes, lineStart, end);
}

/** The verbatim `Display` rendering — `error/display.rs`, byte-exact. */
function renderMessage(kind: ErrKind): string {
    switch (kind.k) {
        case "InvalidUtf8":
            return (
                "InvalidUtf8: input is not valid UTF-8; first invalid byte sequence at byte offset " +
                kind.validUpTo
            );
        case "MissingSeparatorSpace":
            return `Line ${kind.line}: MissingSeparatorSpace: separator must be followed by whitespace or end of line`;
        case "LossyScalar":
            return (
                `Line ${kind.line}: LossyScalar: '${kind.body}' would be inferred as a number ` +
                `and silently canonicalised to '${kind.canonical}'; append '::' to keep it a ` +
                "String or write the canonical form"
            );
        case "DuplicateKey":
            return `Line ${kind.line}: duplicate key '${kind.key}'`;
        case "KeyPathConflict":
            return kind.conflict.t === "overwrite"
                ? `Line ${kind.line}: conflict at '${kind.path}' \u{2014} cannot overwrite ${kind.conflict.existing} with ${kind.conflict.newKind}`
                : `Line ${kind.line}: conflict at '${kind.path}' \u{2014} an existing value blocks the path`;
        case "EmptyKey":
            return `Empty key at line ${kind.line}`;
        case "InvalidKey":
            return `Invalid key at line ${kind.line}: '${kind.key}'`;
        case "UnclosedCompound":
            return kind.kind === "object"
                ? "Unclosed object at end of input"
                : kind.kind === "array"
                  ? "Unclosed array at end of input"
                  : "Unclosed multi-line string at end of input";
        case "UnbalancedBracket": {
            const opener = kind.expected === "object" ? "{" : "[";
            return `Line ${kind.line}: UnbalancedBracket: '${kind.found}' without matching '${opener}'`;
        }
        case "MissingSeparator":
            return `Line ${kind.line}: MissingSeparator: object entries must be 'key: value' pairs`;
        case "UnterminatedInlineCompound":
            return `Line ${kind.line}: UnterminatedInlineCompound: inline compound not closed on the same line`;
        case "UnterminatedQuotedKey":
            return `Line ${kind.line}: UnterminatedQuotedKey: quoted key segment not closed on the same line`;
        case "MalformedInlineCompound":
            return `Line ${kind.line}: MalformedInlineCompound: ${kind.detail}`;
        case "BadEscapeSequence":
            return `Line ${kind.line}: BadEscapeSequence: invalid escape sequence '${kind.sequence}'`;
        case "OrphanLineAfterTopLevelInline":
            return `Line ${kind.line}: OrphanLineAfterTopLevelInline: content after root-level inline compound`;
        case "Other":
            return kind.message;
    }
}

/** std `Utf8Error` Display wording, byte-exact —
 *  `not_utf8_envelope` line 59: "input is not valid UTF-8: {err}". */
function utf8Body(kind: Extract<ErrKind, { k: "InvalidUtf8" }>): string {
    const detail =
        kind.errorLen !== null
            ? `invalid utf-8 sequence of ${kind.errorLen} bytes from index ${kind.validUpTo}`
            : `incomplete utf-8 byte sequence from index ${kind.validUpTo}`;
    return `input is not valid UTF-8: ${detail}`;
}

/**
 * Assemble the ten-field envelope and wrap it in the shared
 * `KtavError`. `decodedPath` is the pre-derived `path` payload
 * (envelope.rs derives it for DuplicateKey / KeyPathConflict /
 * InvalidKey only — the caller supplies it, decoded per the same
 * rules).
 */
export function buildKtavError(kind: ErrKind, bytes: Uint8Array, decodedPath: string[] | null): KtavError {
    const span = spanOf(kind, bytes);
    // Spec § 6: every source-content parse error carries a 1-based
    // line. `InvalidUtf8` sets it explicitly over the raw bytes
    // (`not_utf8_envelope` line 57); any other line-less error with a
    // span (the EOF-detected `UnclosedCompound`) gets it derived from
    // the span start — the general post-step of the C ABI layer
    // (envelope.rs `envelope` lines 12-16).
    let line = lineOf(kind);
    if (kind.k === "InvalidUtf8") {
        line = lineOfOffset(bytes, kind.validUpTo);
    } else if (line === null && span !== null && bytes.length > 0) {
        line = lineOfOffset(bytes, span.start);
    }
    // No valid source text exists for InvalidUtf8, so `line_text`
    // honestly comes out null (`not_utf8_envelope` passes "" as the
    // source, so `line_text_at` yields null — lines 46-51).
    const lineText =
        kind.k === "InvalidUtf8"
            ? null
            : span !== null && bytes.length > 0
              ? lineTextAt(bytes, span.start)
              : null;
    const env: KtavErrorEnvelope = {
        error: codeName(kind),
        reason: null,
        line,
        line_text: lineText,
        span,
        path: decodedPath,
        body: bodyOf(kind),
        canonical: kind.k === "LossyScalar" ? kind.canonical : null,
        spec_section: specSection(kind),
        message: renderMessage(kind),
    };
    return new KtavError(env);
}

/** Class-specific text payload — envelope.rs `kind_body`. */
function bodyOf(kind: ErrKind): string | null {
    switch (kind.k) {
        case "LossyScalar":
            return kind.body;
        case "BadEscapeSequence":
            return kind.sequence;
        case "MalformedInlineCompound":
            return kind.detail;
        case "InvalidUtf8":
            return utf8Body(kind);
        default:
            return null;
    }
}

/** Convenience: build and throw. */
export function throwKtav(kind: ErrKind, bytes: Uint8Array, decodedPath: string[] | null): never {
    throw buildKtavError(kind, bytes, decodedPath);
}

/** Error context threaded through the lexer/parser: the source bytes
 *  (for `line_text`), the 1-based line, and the error span to report. */
export interface ErrCtx {
    bytes: Uint8Array;
    line: number;
    span: Span;
}
