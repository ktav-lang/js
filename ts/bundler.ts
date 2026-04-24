// Bundler entrypoint (webpack / rollup / esbuild / vite). The
// `bundler`-target wasm-bindgen build uses ESM import of `.wasm` and
// relies on the bundler to resolve it — no runtime `init` call.

// @ts-expect-error — resolved at build time by wasm-pack (`--target bundler`).
import * as wasm from "#wasm/bundler";

import type { KtavInput, KtavValue } from "./api.js";
export type { KtavArray, KtavError, KtavInput, KtavObject, KtavValue, Ktav } from "./api.js";

export function loads<T = KtavValue>(s: string): T {
    return wasm.loads(s) as T;
}

export function dumps<T extends KtavInput = KtavInput>(obj: T): string {
    return wasm.dumps(obj);
}
