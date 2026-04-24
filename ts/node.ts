// Node.js entrypoint. Re-exports the wasm-bindgen `nodejs`-target build
// with the canonical generic-typed public API from `./api`.

// @ts-expect-error — resolved at runtime via package.json `imports`; the
// wasm-bindgen `.d.ts` is emitted by `wasm-pack` at build time.
import * as wasm from "#wasm/node";

import type { KtavInput, KtavValue } from "./api.js";
export type { KtavArray, KtavError, KtavInput, KtavObject, KtavValue, Ktav } from "./api.js";

export function loads<T = KtavValue>(s: string): T {
    return wasm.loads(s) as T;
}

export function dumps<T extends KtavInput = KtavInput>(obj: T): string {
    return wasm.dumps(obj);
}
