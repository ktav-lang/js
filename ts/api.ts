// Shared TypeScript surface for all runtime entrypoints (node/web/bundler).
// wasm-bindgen emits its own `.d.ts` with `any`-ish signatures; this file
// is the canonical public typing layered on top.

/**
 * Any value representable in a Ktav document.
 *
 * Ktav is JSON-shaped with two extra typed scalars:
 *   - `:i` → `number` (safe range) or `bigint` (arbitrary precision)
 *   - `:f` → `number`
 * Bare scalars without a marker come back as `string`.
 */
export type KtavValue =
    | null
    | boolean
    | number
    | bigint
    | string
    | KtavValue[]
    | KtavObject;

export type KtavObject = { [key: string]: KtavValue };

export type KtavArray = KtavValue[];

/**
 * Top-level input accepted by `dumps` / `stringifyForceStrings`.
 *
 * Since spec 0.1.1 (ktav 0.3.1) Ktav documents may be either an Object
 * or an Array at the root — both round-trip losslessly. Scalars at the
 * root are rejected.
 */
export type KtavInput = Record<string, unknown> | unknown[];

export interface Ktav {
    /**
     * Parse a Ktav document into a native JavaScript value.
     *
     * The generic parameter is an unchecked cast — use it when your
     * document has a known shape (e.g. a configuration schema) and you
     * want IDE autocomplete on the result. Pass no parameter to get the
     * structural `KtavValue` type.
     *
     * Top-level Arrays (spec § 5.0.1) are detected from the first content
     * line and parsed as a root-level `KtavValue[]`.
     *
     * @example
     *   interface Config { port: number; host: string }
     *   const cfg = loads<Config>(text);  // cfg.port is number
     */
    loads<T = KtavValue>(s: string): T;

    /**
     * Parse a Ktav document with strict canonical-scalar validation.
     * Canonical writer forms are accepted; lossy scalar spellings throw.
     */
    loadsStrict<T = KtavValue>(s: string): T;

    /**
     * Serialize a JavaScript value as a Ktav document. The top-level
     * value must be a plain object or an array — both are valid Ktav
     * roots since spec 0.1.1.
     *
     * @example
     *   dumps({ port: 8080, host: "localhost" })
     *   dumps([1, 2, 3])  // top-level Array, items rendered bare
     */
    dumps<T extends KtavInput = KtavInput>(obj: T): string;

    /**
     * Serialize a JavaScript value as a Ktav document with every scalar
     * coerced to a String. Typed integers (`:i`), typed floats (`:f`),
     * booleans, and `null` are flattened to their textual form;
     * compounds keep their structure. Useful for "everything is a
     * string" dumps for downstream consumers that don't understand the
     * typed markers, or for diff-friendly canonical text.
     *
     * Round-trips back through `loads` as the same set of String
     * scalars. Top-level value must be an object or an array.
     *
     * @example
     *   stringifyForceStrings({ port: 8080, tls: true })
     *   //   port: 8080
     *   //   tls: true
     */
    stringifyForceStrings<T extends KtavInput = KtavInput>(obj: T): string;

    /**
     * Format Ktav text to Ktav text. Every comment is preserved
     * verbatim (spec § 3.4 — no trailing comments, attachment
     * unambiguous). Blank-line runs collapse to exactly one blank line
     * and blank padding immediately inside brackets is dropped, which
     * makes the transform a fixed point:
     * `format(format(x)) === format(x)`.
     *
     * Key order is never changed (spec § 5.9 has no sorting rule). For
     * a document with no comments AND no blank lines the result equals
     * `emitCanonical` of its parse.
     *
     * @example
     *   format("a :  1\n\n\n\nb : 2\n")  // "a: 1\n\nb: 2\n"
     */
    format(s: string): string;

    /**
     * Parse `s` and return the canonical text of its parse WITHOUT
     * passing through a JavaScript value — scalar spellings (`1.0`,
     * `1e9`, `-0.0`) survive byte-exactly, which the object-taking
     * `emitCanonical` cannot guarantee. Use this for byte-exact
     * canonical output from an existing document.
     */
    canonicalFromSource(s: string): string;

    /**
     * Render the canonical Ktav text of a value. Byte-stable across
     * conforming writers (spec § 8.2). The top-level value must be an
     * object or array; unrepresentable values throw (match on
     * `reason` on the thrown {@link KtavError}).
     *
     * Limitation: a JS number cannot express Ktav's Integer/Float
     * distinction, so a value like `1.0` arrives indistinguishable
     * from `1` and the output may differ from the source's canonical
     * form. For byte-exact canonical output from an existing document
     * use {@link canonicalFromSource}.
     *
     * @example
     *   emitCanonical({ port: 8080, host: "localhost" })
     */
    emitCanonical(obj: KtavInput): string;
}

/**
 * The ten-field error envelope the Rust backends attach to every
 * failure, since ktav 0.7.2. Field names keep the exact wire spelling
 * (`line_text`, `spec_section`) so consumers can read fields
 * positionally against the Rust / Go / Java bindings — do not
 * camelCase them.
 */
export interface KtavErrorEnvelope {
    /** Structured error class, e.g. "DuplicateKey", "Unrepresentable", "Message". */
    error: string;
    /** Stable writer-time code (spec § 5.9.0), e.g. "EmptyKeyName"; null for parse errors. */
    reason: string | null;
    /** 1-based line number for parse-time errors; null otherwise. */
    line: number | null;
    /** Text of the offending line for parse-time errors; null otherwise. */
    line_text: string | null;
    /** Byte offsets (start inclusive, end exclusive) into the UTF-8 source text —
     *  NOT UTF-16 code units. Convert before feeding to LSP / UTF-16 consumers. */
    span: { start: number; end: number } | null;
    /** Exact decoded key segments of the offending path — never a joined string. */
    path: string[] | null;
    /** Class-specific text payload — the offending source fragment, not prose:
     *  LossyScalar's source form, BadEscapeSequence's sequence, etc. null otherwise. */
    body: string | null;
    /** Canonical text, when the error carries one; null otherwise. */
    canonical: string | null;
    /** Spec section reference, e.g. "§6.15"; null otherwise. */
    spec_section: string | null;
    /** The core's own rendering of the error, verbatim — never reassembled
     *  from the other fields. Absent only when the envelope came from a
     *  pre-0.7.2 native binary; {@link KtavError} falls back to a locally
     *  reconstructed message in that case. */
    message?: string;
}

/**
 * Typed error thrown by every public Ktav operation. `message` is
 * the core's own rendering, taken verbatim from the envelope's own
 * `message` field — the raw ten-field JSON envelope is kept on the
 * `envelope` member and typed fields too, but `message` itself is
 * never reassembled from them.
 */
export class KtavError extends Error {
    readonly error: string;
    readonly reason: string | null;
    readonly line: number | null;
    readonly line_text: string | null;
    /** Byte offsets into the UTF-8 source (not UTF-16 code units).
     *  Convert before LSP / UTF-16 use. */
    readonly span: { start: number; end: number } | null;
    /** Exact decoded key segments — never a joined string. */
    readonly path: string[] | null;
    readonly body: string | null;
    readonly canonical: string | null;
    readonly spec_section: string | null;

    /** Raw ten-field envelope, for programmatic inspection. */
    readonly envelope: KtavErrorEnvelope;

    constructor(env: KtavErrorEnvelope, message?: string) {
        super(message ?? env.message ?? describeEnvelope(env));
        this.name = "KtavError";
        this.error = env.error;
        this.reason = env.reason;
        this.line = env.line;
        this.line_text = env.line_text;
        this.span = env.span;
        this.path = env.path;
        this.body = env.body;
        this.canonical = env.canonical;
        this.spec_section = env.spec_section;
        this.envelope = env;
    }
}

/** Fallback rendering for a pre-0.7.2 envelope with no `message` field. */
function describeEnvelope(env: KtavErrorEnvelope): string {
    if (env.error === "Message") return "Ktav error";
    if (env.error === "Unrepresentable" || env.error === "UnrepresentableAt") {
        // Display only — the `path` member stays an array.
        const at = env.path !== null && env.path.join(".") !== ""
            ? ` at path ${env.path.join(".")}`
            : "";
        return `Ktav cannot represent ${env.reason}${at}`;
    }
    if (env.error === "InvalidUtf8") {
        return env.spec_section !== null
            ? `Ktav input is not valid UTF-8 (${env.spec_section})`
            : "Ktav input is not valid UTF-8";
    }
    if (env.line !== null) {
        return env.body !== null
            ? `Ktav parse error ${env.error} at line ${env.line}: ${env.body}`
            : `Ktav parse error ${env.error} at line ${env.line}`;
    }
    return `Ktav parse error ${env.error}`;
}

const ENVELOPE_KEYS = [
    "error", "reason", "line", "line_text", "span", "path", "body", "canonical", "spec_section",
] as const;

function parseEnvelope(raw: string): KtavErrorEnvelope | null {
    let v: unknown;
    try { v = JSON.parse(raw); } catch { return null; }
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    const obj = v as Record<string, unknown>;
    for (const k of ENVELOPE_KEYS) {
        if (!(k in obj)) return null;
    }
    return obj as unknown as KtavErrorEnvelope;
}

const MESSAGE_ENVELOPE: KtavErrorEnvelope = {
    error: "Message",
    reason: null,
    line: null,
    line_text: null,
    span: null,
    path: null,
    body: null,
    canonical: null,
    spec_section: null,
};

/** Build a `KtavError` with an all-null `Message` envelope and readable text. */
export function ktavMessageError(text: string): KtavError {
    return new KtavError(MESSAGE_ENVELOPE, text);
}

/**
 * Normalize any thrown value into a typed error. `KtavError` instances
 * pass through; Errors whose `message` parses as an envelope JSON
 * object (the wire contract of the Rust layer) become `KtavError`s;
 * anything else becomes a `KtavError` with error "Message" carrying the
 * original (or fallback) readable text.
 */
export function toKtavError(cause: unknown, fallbackMessage?: string): Error {
    if (cause instanceof KtavError) return cause;
    if (cause instanceof Error) {
        const env = parseEnvelope(cause.message);
        if (env !== null) return new KtavError(env);
        return new KtavError(MESSAGE_ENVELOPE, fallbackMessage ?? cause.message);
    }
    return new KtavError(MESSAGE_ENVELOPE, fallbackMessage ?? String(cause));
}
