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
 * Top-level input accepted by `dumps`. Ktav documents are objects, so
 * the top-level value must be a record — arrays and scalars at the root
 * are rejected with `KtavEncodeError`.
 */
export type KtavInput = Record<string, unknown>;

export interface Ktav {
    /**
     * Parse a Ktav document into a native JavaScript value.
     *
     * The generic parameter is an unchecked cast — use it when your
     * document has a known shape (e.g. a configuration schema) and you
     * want IDE autocomplete on the result. Pass no parameter to get the
     * structural `KtavValue` type.
     *
     * @example
     *   interface Config { port: number; host: string }
     *   const cfg = loads<Config>(text);  // cfg.port is number
     */
    loads<T = KtavValue>(s: string): T;

    /**
     * Serialize a JavaScript value as a Ktav document. The input must
     * be a plain object — Ktav documents are objects at the root.
     *
     * @example
     *   dumps({ port: 8080, host: "localhost" })
     */
    dumps<T extends KtavInput = KtavInput>(obj: T): string;
}

/**
 * Error thrown when input cannot be parsed as valid Ktav. The underlying
 * wasm-bindgen bridge maps `ktav::ParseError` to a JS `Error` — this
 * alias exists so consumers can write `catch (e: KtavError)` without
 * reaching into the wasm glue.
 */
export type KtavError = Error;
