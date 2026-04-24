// Browser / Deno entrypoint.
//
// Defaults to the **inline** wasm build — `crates/wasm`'s compiled
// binary is base64-embedded in the JS bundle. One HTTP round trip,
// no sibling `.wasm` fetch, works over `file://`. The `.wasm` bytes
// are lazily decoded and cached on the first call to `ready()`, so
// repeated `ready()` calls after warm-up are free.
//
// Power users who want the fetch-based build (smaller JS, separate
// cacheable `.wasm`) can import `ktav/dist/wasm/web/ktav.js`
// directly and drive its `init(URL)` themselves.

// Resolved via package.json `imports`; emitted by
// `scripts/build-wasm.mjs` after wasm-pack's `--target web`.
import init, * as wasm from "#wasm/web-inline";

import type { KtavInput, KtavValue } from "./api.js";
export type { KtavArray, KtavError, KtavInput, KtavObject, KtavValue, Ktav } from "./api.js";

let warmPromise: Promise<void> | null = null;

/**
 * Prewarm the WASM module.
 *
 * Must be awaited **once** before the first call to `loads` / `dumps`
 * on the web / Deno / browser path. The first call decodes the
 * embedded wasm bytes from base64 and instantiates the module;
 * subsequent calls return the same resolved promise without doing
 * any work (idempotent).
 *
 * On Node / Bun this is not imported — the native entry loads the
 * `.node` binary synchronously at import time.
 */
export function ready(): Promise<void> {
    if (warmPromise === null) {
        warmPromise = init().then(() => undefined);
    }
    return warmPromise;
}

export function loads<T = KtavValue>(s: string): T {
    return wasm.loads(s) as T;
}

export function dumps<T extends KtavInput = KtavInput>(obj: T): string {
    return wasm.dumps(obj);
}
