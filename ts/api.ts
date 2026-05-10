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
}

/**
 * Error thrown when input cannot be parsed as valid Ktav. The underlying
 * wasm-bindgen bridge maps `ktav::ParseError` to a JS `Error` — this
 * alias exists so consumers can write `catch (e: KtavError)` without
 * reaching into the wasm glue.
 */
export type KtavError = Error;
