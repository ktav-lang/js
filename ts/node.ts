// Node / Bun entrypoint. Loads the native `.node` binary built by
// `napi-rs` and re-exports it under the canonical generic-typed API
// from `./api`. Node and Bun both support N-API, so both resolve here
// via the package.json `exports` map.

import { createRequire } from "node:module";
import { platform, arch } from "node:process";

import { ktavMessageError, toKtavError } from "./internal/api.js";
import type { KtavInput, KtavValue } from "./internal/api.js";
export type { KtavArray, KtavErrorEnvelope, KtavInput, KtavObject, KtavValue, Ktav } from "./internal/api.js";
export { KtavError, ktavMessageError, toKtavError } from "./internal/api.js";

// Locate the platform-specific `.node` binary. At publish time these
// live in `optionalDependencies` subpackages (@ktav-lang/ktav-<triple>)
// and npm installs only the matching one. For local dev / CI the
// file sits next to this script under `dist/native/`.
//
// The triple mirrors napi-rs conventions — see
// https://napi.rs/docs/deep-dive/release for the canonical list.
// Linux needs both `-gnu` (glibc) and `-musl` (Alpine) variants —
// we try gnu first since that's the majority of Linux installs, and
// silently fall through to musl on `MODULE_NOT_FOUND`. Detecting the
// libc up-front would need `process.report.getReport()` parsing or
// a userland `detect-libc` dep — the try/catch is cheaper.
function candidateTriples(): string[] {
    const os =
        platform === "win32" ? "win32" :
        platform === "darwin" ? "darwin" :
        "linux";
    const abiList =
        platform === "win32" ? ["-msvc"] :
        platform === "darwin" ? [""] :
        ["-gnu", "-musl"];
    return abiList.map(abi => `${os}-${arch}${abi}`);
}

interface NativeBinding {
    loads: (s: string) => unknown;
    loadsStrict: (s: string) => unknown;
    dumps: (obj: unknown) => string;
    stringifyForceStrings: (obj: unknown) => string;
    format: (s: string) => string;
    emitCanonical: (obj: unknown) => string;
    canonicalFromSource: (s: string) => string;
    loadsBytes: (bytes: Uint8Array) => unknown;
    editValue?: (source: string, path: string, replacement: unknown) => string;
    editValueSegments?: (
        source: string,
        segments: string[],
        replacement: unknown,
    ) => string;
    insertValue?: (source: string, path: string, replacement: unknown) => string;
    insertValueSegments?: (source: string, segments: string[], replacement: unknown) => string;
    removeValue?: (source: string, path: string) => string;
    removeValueSegments?: (source: string, segments: string[]) => string;
    renameKey?: (source: string, path: string, newKey: string) => string;
    renameKeySegments?: (source: string, segments: string[], newKey: string) => string;
}

/** A native binary predating the source-edit 0.9 core simply lacks the
 *  symbols — report that clearly instead of a confusing TypeError or a
 *  silent pure fallback (ABI_VERSION 2 adds the two edit symbols). */
function requireNativeEdit(name: "editValue" | "editValueSegments" | "insertValue" | "insertValueSegments" | "removeValue" | "removeValueSegments" | "renameKey" | "renameKeySegments"): (
    ...args: unknown[]
) => string {
    const fn = native[name];
    if (typeof fn !== "function") {
        throw ktavMessageError(
            `installed ktav native binary does not support ${name} ` +
                `(source-edit requires ABI_VERSION 2 / ktav 0.9 core; ` +
                `the loaded binary predates it)`,
        );
    }
    return fn as (...args: unknown[]) => string;
}

const require_ = createRequire(import.meta.url);

function tryLoad(path: string): NativeBinding | null {
    try {
        return require_(path) as NativeBinding;
    } catch (e: unknown) {
        if (
            e && typeof e === "object" && "code" in e &&
            (e as { code: string }).code === "MODULE_NOT_FOUND"
        ) {
            return null;
        }
        throw e;
    }
}

function resolveNative(): NativeBinding {
    for (const triple of candidateTriples()) {
        const found = tryLoad(`../native/ktav.${triple}.node`)
            ?? tryLoad(`@ktav-lang/js-${triple}`);
        if (found) return found;
    }
    throw new Error(
        `Failed to locate ktav native binary for ${platform}-${arch}. ` +
        `Expected either a local dist/native/ build or an installed ` +
        `@ktav-lang/js-<triple> optional dependency.`,
    );
}
const native: NativeBinding = resolveNative();

export function loads<T = KtavValue>(s: string): T {
    try {
        return native.loads(s) as T;
    } catch (e) {
        throw toKtavError(e);
    }
}

export function loadsStrict<T = KtavValue>(s: string): T {
    try {
        return native.loadsStrict(s) as T;
    } catch (e) {
        throw toKtavError(e);
    }
}

/**
 * Raw-byte entry: parse a Uint8Array as UTF-8 Ktav text without any
 * TextEncoder/TextDecoder re-encoding step. The 0.8.1 invalid_utf8/
 * fixtures are only meaningful if the parser receives the exact bytes
 * (spec 0.8 § 6.15). Throws KtavError with error === "InvalidUtf8" for
 * invalid input, before any grammar diagnosis.
 */
export function loadsBytes<T = KtavValue>(bytes: Uint8Array): T {
    try {
        return native.loadsBytes(bytes) as T;
    } catch (e) {
        throw toKtavError(e);
    }
}

export function dumps<T extends KtavInput = KtavInput>(obj: T): string {
    if (obj === null || typeof obj !== "object") {
        throw ktavMessageError("top-level Ktav document must be an object or array");
    }
    try {
        return native.dumps(obj);
    } catch (e) {
        throw toKtavError(e);
    }
}

export function stringifyForceStrings<T extends KtavInput = KtavInput>(obj: T): string {
    if (obj === null || typeof obj !== "object") {
        throw ktavMessageError("top-level Ktav document must be an object or array");
    }
    try {
        return native.stringifyForceStrings(obj);
    } catch (e) {
        throw toKtavError(e);
    }
}

export function format(s: string): string {
    try {
        return native.format(s);
    } catch (e) {
        throw toKtavError(e);
    }
}

export function emitCanonical<T extends KtavInput = KtavInput>(obj: T): string {
    if (obj === null || typeof obj !== "object") {
        throw ktavMessageError("top-level Ktav document must be an object or array");
    }
    try {
        return native.emitCanonical(obj);
    } catch (e) {
        throw toKtavError(e);
    }
}

export function canonicalFromSource(s: string): string {
    try {
        return native.canonicalFromSource(s);
    } catch (e) {
        throw toKtavError(e);
    }
}

export function insertValue(source: string, path: string, value: KtavValue): string { try { return requireNativeEdit("insertValue")(source,path,value) as string; } catch(e) { throw toKtavError(e); } }
export function insertValueSegments(source: string, path: readonly string[], value: KtavValue): string { try { return requireNativeEdit("insertValueSegments")(source,[...path],value) as string; } catch(e) { throw toKtavError(e); } }
export function removeValue(source: string, path: string): string { try { return requireNativeEdit("removeValue")(source,path) as string; } catch(e) { throw toKtavError(e); } }
export function removeValueSegments(source: string, path: readonly string[]): string { try { return requireNativeEdit("removeValueSegments")(source,[...path]) as string; } catch(e) { throw toKtavError(e); } }
export function renameKey(source: string, path: string, key: string): string { try { return requireNativeEdit("renameKey")(source,path,key) as string; } catch(e) { throw toKtavError(e); } }
export function renameKeySegments(source: string, path: readonly string[], key: string): string { try { return requireNativeEdit("renameKeySegments")(source,[...path],key) as string; } catch(e) { throw toKtavError(e); } }

export function editValue(source: string, path: string, replacement: KtavValue): string {
    try {
        return requireNativeEdit("editValue")(source, path, replacement) as string;
    } catch (e) {
        throw toKtavError(e);
    }
}

export function editValueSegments(
    source: string,
    segments: readonly string[],
    replacement: KtavValue,
): string {
    try {
        return requireNativeEdit("editValueSegments")(source, [...segments], replacement) as string;
    } catch (e) {
        throw toKtavError(e);
    }
}
