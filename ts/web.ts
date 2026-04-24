// Browser / Deno entrypoint. The `web`-target wasm-bindgen build expects
// the consumer to call the default export (`init()`) once before using
// `loads` / `dumps`, so we expose it here alongside the typed API.

// @ts-expect-error — resolved at build time by wasm-pack (`--target web`).
import init, * as wasm from "#wasm/web";

import type { KtavInput, KtavValue } from "./api.js";
export type { KtavArray, KtavError, KtavInput, KtavObject, KtavValue, Ktav } from "./api.js";

/**
 * Initialize the WASM module. Must be awaited once before any call to
 * `loads` / `dumps` in browser / Deno contexts. Accepts the same inputs
 * as the wasm-bindgen default export (URL, BufferSource, Response, …);
 * `undefined` falls back to a sibling `.wasm` file next to the JS glue.
 */
export async function ready(input?: Parameters<typeof init>[0]): Promise<void> {
    await init(input);
}

export function loads<T = KtavValue>(s: string): T {
    return wasm.loads(s) as T;
}

export function dumps<T extends KtavInput = KtavInput>(obj: T): string {
    return wasm.dumps(obj);
}
