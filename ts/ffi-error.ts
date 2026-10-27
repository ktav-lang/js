// Stub for runtimes that have no FFI surface (Node, browser, edge
// workers). The package.json `exports` map routes those targets here
// so the failure mode is a clear, immediate error message instead of
// a confusing `Deno is not defined` ReferenceError deep in the call
// stack.

import type { KtavValue } from "./internal/api.js";

const MESSAGE =
    "@ktav-lang/ktav/ffi requires Deno or Bun.\n" +
    "  - On Node, use the default import (`@ktav-lang/ktav`) — it's already N-API native.\n" +
    "  - In a browser, use `@ktav-lang/ktav/wasm` (or the default, which auto-picks WASM there).\n" +
    "  - On Deno, run with `--allow-ffi=<path-to-libktav_cabi>`.\n" +
    "  - On Bun, use the same import — `bun:ffi` is permission-free.";

export type {
    KtavArray, KtavErrorEnvelope, KtavInput, KtavObject, KtavValue, Ktav,
} from "./internal/api.js";
export { KtavError, toKtavError } from "./internal/api.js";

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

export function format(_src: string): never {
    throw new Error(MESSAGE);
}

export function emitCanonical(_value: unknown): never {
    throw new Error(MESSAGE);
}

export function canonicalFromSource(_src: string): never {
    throw new Error(MESSAGE);
}

export function editValue(_source: string, _path: string, _replacement: unknown): never {
    throw new Error(MESSAGE);
}

export function editValueSegments(_source: string, _segments: readonly string[], _replacement: unknown): never {
    throw new Error(MESSAGE);
}

export function insertValue(_source: string, _path: string, _replacement: KtavValue): never {
    throw new Error(MESSAGE);
}

export function insertValueSegments(_source: string, _segments: readonly string[], _replacement: KtavValue): never {
    throw new Error(MESSAGE);
}

export function removeValue(_source: string, _path: string): never {
    throw new Error(MESSAGE);
}

export function removeValueSegments(_source: string, _segments: readonly string[]): never {
    throw new Error(MESSAGE);
}

export function renameKey(_source: string, _path: string, _newKey: string): never {
    throw new Error(MESSAGE);
}

export function renameKeySegments(_source: string, _segments: readonly string[], _newKey: string): never {
    throw new Error(MESSAGE);
}

export const ktav = { loads, loadsStrict, dumps, stringifyForceStrings, format, emitCanonical, canonicalFromSource, editValue, editValueSegments, insertValue, insertValueSegments, removeValue, removeValueSegments, renameKey, renameKeySegments };
