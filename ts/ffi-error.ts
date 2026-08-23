// Stub for runtimes that have no FFI surface (Node, browser, edge
// workers). The package.json `exports` map routes those targets here
// so the failure mode is a clear, immediate error message instead of
// a confusing `Deno is not defined` ReferenceError deep in the call
// stack.

const MESSAGE =
    "@ktav-lang/ktav/ffi requires Deno or Bun.\n" +
    "  - On Node, use the default import (`@ktav-lang/ktav`) — it's already N-API native.\n" +
    "  - In a browser, use `@ktav-lang/ktav/wasm` (or the default, which auto-picks WASM there).\n" +
    "  - On Deno, run with `--allow-ffi=<path-to-libktav_cabi>`.\n" +
    "  - On Bun, use the same import — `bun:ffi` is permission-free.";

export type {
    KtavArray, KtavError, KtavInput, KtavObject, KtavValue, Ktav,
} from "./api.js";

export function loads(_src: string): never {
    throw new Error(MESSAGE);
}

export function loadsStrict(_src: string): never {
    throw new Error(MESSAGE);
}

export function dumps(_value: unknown): never {
    throw new Error(MESSAGE);
}

export function stringifyForceStrings(_value: unknown): never {
    throw new Error(MESSAGE);
}

export const ktav = { loads, loadsStrict, dumps, stringifyForceStrings };
