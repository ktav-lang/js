// Deno FFI entrypoint — `Deno.dlopen` over the canonical ktav_cabi
// shared library. Same C ABI as the Java / Go / .NET bindings, exact
// same wire format, much faster than the WASM path on
// parse-and-render of large documents.
//
// Permission: requires `--allow-ffi` (ideally narrowed to the cabi
// path, e.g. `--allow-ffi=$(deno cache --reload deno.land/x/ktav)`).
// Without it Deno throws PermissionDenied at `Deno.dlopen` and we
// don't try to recover — that defeats the security model.
//
// On Node and the browser this module is unreachable: the package.json
// `exports` map routes those runtimes to `./ffi-error.js`.

import { ktavMessageError, toKtavError } from "./internal/api.js";
import type { Ktav, KtavInput, KtavValue } from "./internal/api.js";
export type { KtavArray, KtavErrorEnvelope, KtavInput, KtavObject, KtavValue, Ktav } from "./internal/api.js";
export { KtavError, toKtavError } from "./internal/api.js";

import { decode, encode } from "./internal/ffi-codec.js";
import { resolveLibPath } from "./internal/ffi-loader.js";
export { setLibraryPath } from "./internal/ffi-loader.js";

// Deno-specific globals. Declared inline so this module can be
// type-checked against `@types/node` without pulling in `@types/deno`.
declare const Deno: {
    env: { get(name: string): string | undefined };
    build: { os: string; arch: string };
    stat(path: string): Promise<unknown>;
    readFileSync(path: string): Uint8Array;
    UnsafePointer: {
        of(value: ArrayBufferView): bigint | null;
        create(value: bigint): bigint | null;
        value(p: unknown): bigint;
    };
    UnsafePointerView: new (p: unknown) => {
        getArrayBuffer(byteLength: number): ArrayBuffer;
    };
    dlopen<S>(path: string, symbols: S): { symbols: Record<string, (...args: unknown[]) => unknown> };
};

const FFI_SYMBOLS = {
    ktav_loads: {
        parameters: ["pointer", "usize", "pointer", "pointer", "pointer", "pointer"],
        result: "i32",
    },
    ktav_loads_strict: {
        parameters: ["pointer", "usize", "pointer", "pointer", "pointer", "pointer"],
        result: "i32",
    },
    ktav_dumps: {
        parameters: ["pointer", "usize", "pointer", "pointer", "pointer", "pointer"],
        result: "i32",
    },
    ktav_dumps_force_strings: {
        parameters: ["pointer", "usize", "pointer", "pointer", "pointer", "pointer"],
        result: "i32",
    },
    ktav_canonical_from_source: {
        parameters: ["pointer", "usize", "pointer", "pointer", "pointer", "pointer"],
        result: "i32",
    },
    ktav_format: {
        parameters: ["pointer", "usize", "pointer", "pointer", "pointer", "pointer"],
        result: "i32",
    },
    ktav_emit_canonical: {
        parameters: ["pointer", "usize", "pointer", "pointer", "pointer", "pointer"],
        result: "i32",
    },
    ktav_free: {
        parameters: ["pointer", "usize"],
        result: "void",
    },
    ktav_version: {
        parameters: [],
        result: "pointer",
    },
    ktav_abi_version: { parameters: [], result: "u32" },
    ktav_edit_value: { parameters: ["pointer", "usize", "pointer", "usize", "pointer", "usize", "pointer", "pointer", "pointer", "pointer"], result: "i32" },
    ktav_edit_value_segments: { parameters: ["pointer", "usize", "pointer", "usize", "pointer", "usize", "pointer", "pointer", "pointer", "pointer"], result: "i32" },
    ktav_insert_value: { parameters: ["pointer", "usize", "pointer", "usize", "pointer", "usize", "pointer", "pointer", "pointer", "pointer"], result: "i32" },
    ktav_insert_value_segments: { parameters: ["pointer", "usize", "pointer", "usize", "pointer", "usize", "pointer", "pointer", "pointer", "pointer"], result: "i32" },
    ktav_remove_value: { parameters: ["pointer", "usize", "pointer", "usize", "pointer", "pointer", "pointer", "pointer"], result: "i32" },
    ktav_remove_value_segments: { parameters: ["pointer", "usize", "pointer", "usize", "pointer", "pointer", "pointer", "pointer"], result: "i32" },
    ktav_rename_key: { parameters: ["pointer", "usize", "pointer", "usize", "pointer", "usize", "pointer", "pointer", "pointer", "pointer"], result: "i32" },
    ktav_rename_key_segments: { parameters: ["pointer", "usize", "pointer", "usize", "pointer", "usize", "pointer", "pointer", "pointer", "pointer"], result: "i32" },
} as const;
let cachedLib: { symbols: Record<string, (...args: unknown[]) => unknown> } | null = null;

// Rust требует ненулевой указатель даже при длине 0. Буфер живёт весь вызов.
const EMPTY_SRC_PLACEHOLDER = new Uint8Array(1);

async function getLib() {
    if (cachedLib) return cachedLib;
    const archMap: Record<string, string> = { x86_64: "x64", aarch64: "arm64" };
    const plat = Deno.build.os; // "linux" | "darwin" | "windows"
    const arch = archMap[Deno.build.arch] ?? Deno.build.arch;
    const path = await resolveLibPath({
        plat: plat === "windows" ? "win32" : plat,
        archName: arch,
        runtime: {
            env: name => Deno.env.get(name),
            resolveSubpackage: async (subpkg, file) => {
                // Deno honours `npm:` specifiers and the standard
                // `node_modules/<subpkg>/<file>` layout. We use the
                // latter — works for any deno project that runs
                // `npm install @ktav-lang/ktav` first.
                const url = await import.meta.resolve(`${subpkg}/${file}`);
                return new URL(url).pathname;
            },
            exists: async p => {
                try { await Deno.stat(p); return true; } catch { return false; }
            },
        },
    });
    cachedLib = Deno.dlopen(path, FFI_SYMBOLS);
    // Strict ABI gate — document ops must never run against a foreign
    // ABI (e.g. an old ABI_VERSION 1 artifact without the edit
    // symbols). Probe first, close the library on mismatch, and cache
    // nothing: every later call fails with the same clear error.
    const EXPECTED_ABI_VERSION = 2;
    try {
        // Symbol ACCESS can throw in Deno (resolution failure) — keep
        // it inside the try so any failure surfaces as the clear gate
        // error, never a raw TypeError.
        const abiVersion = cachedLib.symbols.ktav_abi_version as (() => number) | undefined;
        if (typeof abiVersion !== "function") {
            throw new Error(
                "ktav_cabi ABI_VERSION gate: library reports no ktav_abi_version symbol " +
                    "(pre-metadata library), this binding requires ABI_VERSION 2 " +
                    "(source-edit 0.9). All native document operations are refused — " +
                    "upgrade/rebuild ktav_cabi; no pure fallback is performed.",
            );
        }
        const actual = Number(abiVersion()) >>> 0; // uint32
        if (actual !== EXPECTED_ABI_VERSION) {
            throw new Error(
                `ktav_cabi ABI_VERSION gate: library reports ${actual}, ` +
                    `this binding requires ${EXPECTED_ABI_VERSION} (source-edit 0.9, ABI_VERSION 2). ` +
                    `All native document operations are refused — upgrade/rebuild ktav_cabi; ` +
                    `no pure fallback is performed.`,
            );
        }
    } catch (e) {
        try {
            (cachedLib as { close?: () => void }).close?.();
        } catch {
            // Best effort — Deno releases the handle on unload anyway.
        }
        cachedLib = null;
        throw e;
    }
    return cachedLib;
}

// ── FFI plumbing ─────────────────────────────────────────────────────

async function callNative(
    op: "loads" | "loads_strict" | "dumps" | "dumps_force_strings" | "format" | "emit_canonical" | "canonical_from_source",
    input: Uint8Array,
): Promise<Uint8Array> {
    const lib = await getLib();
    const symbolName = (
        op === "loads" ? "ktav_loads"
            : op === "loads_strict" ? "ktav_loads_strict"
            : op === "dumps" ? "ktav_dumps"
            : op === "dumps_force_strings" ? "ktav_dumps_force_strings"
            : op === "format" ? "ktav_format"
            : op === "canonical_from_source" ? "ktav_canonical_from_source"
            : "ktav_emit_canonical"
    );
    const sym = lib.symbols[symbolName] as (...args: unknown[]) => number;
    const ktavFree = lib.symbols.ktav_free as (ptr: bigint, len: bigint) => void;

    const outBuf = new BigUint64Array(1);
    const outLen = new BigUint64Array(1);
    const outErr = new BigUint64Array(1);
    const outErrLen = new BigUint64Array(1);

    const srcPtr = input.length === 0
        ? Deno.UnsafePointer.of(EMPTY_SRC_PLACEHOLDER)
        : Deno.UnsafePointer.of(input);

    const rc = sym(
        srcPtr,
        BigInt(input.length),
        Deno.UnsafePointer.of(outBuf),
        Deno.UnsafePointer.of(outLen),
        Deno.UnsafePointer.of(outErr),
        Deno.UnsafePointer.of(outErrLen),
    );

    if (rc !== 0) {
        const errPtrRaw = outErr[0];
        const errLen = Number(outErrLen[0]);
        let msg = `native call failed with code ${rc}`;
        if (errPtrRaw && errLen > 0) {
            const errPtr = Deno.UnsafePointer.create(errPtrRaw);
            if (errPtr) {
                const view = new Deno.UnsafePointerView(errPtr);
                msg = new TextDecoder().decode(new Uint8Array(view.getArrayBuffer(errLen)));
                ktavFree(errPtr as unknown as bigint, BigInt(errLen));
            }
        }
        // Drain success buffer too (defence in depth).
        const okPtrRaw = outBuf[0];
        const okLen = Number(outLen[0]);
        if (okPtrRaw && okLen > 0) {
            const okPtr = Deno.UnsafePointer.create(okPtrRaw);
            if (okPtr) ktavFree(okPtr as unknown as bigint, BigInt(okLen));
        }
        throw toKtavError(new Error(msg));
    }

    const okPtrRaw = outBuf[0];
    const okLen = Number(outLen[0]);
    if (!okPtrRaw || okLen === 0) return new Uint8Array(0);
    const okPtr = Deno.UnsafePointer.create(okPtrRaw);
    if (!okPtr) return new Uint8Array(0);
    const view = new Deno.UnsafePointerView(okPtr);
    const copy = new Uint8Array(view.getArrayBuffer(okLen)).slice(0);
    ktavFree(okPtr as unknown as bigint, BigInt(okLen));
    return copy;
}

// ── Public API ───────────────────────────────────────────────────────

export async function loads<T = KtavValue>(src: string): Promise<T> {
    const bytes = new TextEncoder().encode(src);
    const result = await callNative("loads", bytes);
    return decode(result) as T;
}

export async function loadsStrict<T = KtavValue>(src: string): Promise<T> {
    const bytes = new TextEncoder().encode(src);
    const result = await callNative("loads_strict", bytes);
    return decode(result) as T;
}

/**
 * Raw-byte entry (spec 0.8 § 3.1/§ 6.15): parse a Uint8Array of Ktav
 * source text WITHOUT any TextEncoder round-trip, so the exact bytes
 * reach the native parser. `ktav_loads` itself validates UTF-8 at the
 * ABI boundary (rust/src/cabi/ops.rs `loads` → `not_utf8_envelope`),
 * so invalid bytes throw a `KtavError` with `error === "InvalidUtf8"`,
 * a byte-exact span and a raw-bytes line number — before any grammar
 * diagnosis. This is the only path that can honestly exercise the
 * invalid_utf8/ conformance fixtures.
 */
export async function loadsBytes<T = KtavValue>(bytes: Uint8Array): Promise<T> {
    // Копируем до await: Rust не заимствует изменяемый или shared-буфер вызывающего.
    const owned = new Uint8Array(bytes.length);
    owned.set(bytes);
    const result = await callNative("loads", owned);
    return decode(result) as T;
}

export async function dumps<T extends KtavInput = KtavInput>(value: T): Promise<string> {
    if (value === null || typeof value !== "object") {
        throw ktavMessageError("top-level Ktav document must be an object or array");
    }
    let input: Uint8Array;
    try {
        input = encode(value);
    } catch (e) {
        throw toKtavError(e);
    }
    const result = await callNative("dumps", input);
    return new TextDecoder().decode(result);
}

export async function stringifyForceStrings<T extends KtavInput = KtavInput>(
    value: T,
): Promise<string> {
    if (value === null || typeof value !== "object") {
        throw ktavMessageError("top-level Ktav document must be an object or array");
    }
    let input: Uint8Array;
    try {
        input = encode(value);
    } catch (e) {
        throw toKtavError(e);
    }
    const result = await callNative("dumps_force_strings", input);
    return new TextDecoder().decode(result);
}

export async function format(src: string): Promise<string> {
    const bytes = new TextEncoder().encode(src);
    const result = await callNative("format", bytes);
    return new TextDecoder().decode(result);
}

export async function emitCanonical<T extends KtavInput = KtavInput>(value: T): Promise<string> {
    if (value === null || typeof value !== "object") {
        throw ktavMessageError("top-level Ktav document must be an object or array");
    }
    let input: Uint8Array;
    try {
        input = encode(value);
    } catch (e) {
        throw toKtavError(e);
    }
    const result = await callNative("emit_canonical", input);
    return new TextDecoder().decode(result);
}


export async function canonicalFromSource(src: string): Promise<string> {
    const bytes = new TextEncoder().encode(src);
    const result = await callNative("canonical_from_source", bytes);
    return new TextDecoder().decode(result);
}

/** Shared edit call over the 10-arg C ABI (source / path / replacement
 *  buffers + the standard out-pointer quartet). An old library
 *  (ABI_VERSION 1) lacks the symbols and fails with a clear error,
 *  never a pure fallback. */
async function callEdit(
    op: "edit_value" | "edit_value_segments" | "insert_value" | "insert_value_segments" | "remove_value" | "remove_value_segments" | "rename_key" | "rename_key_segments",
    source: string, pathArg: string, replacement: KtavValue = null, renameKey = "",
): Promise<string> {
    const lib = await getLib();
    const symbolName = `ktav_${op}`;
    const sym = lib.symbols[symbolName] as ((...args: unknown[]) => number) | undefined;
    if (typeof sym !== "function") {
        throw ktavMessageError(
            `installed ktav_cabi library does not export ${symbolName} ` +
                `(source-edit requires ABI_VERSION 2 / ktav 0.9 core)`,
        );
    }
    const src = new Uint8Array(new TextEncoder().encode(source));
    let replInput = new Uint8Array();
    try { if (op.startsWith("edit_") || op.startsWith("insert_")) replInput = encode(replacement); }
    catch (e) {
        // ABI source operations parse before decoding replacement transport.
        // Preserve that precedence even when host-side encoding fails.
        await callNative("loads", src);
        throw toKtavError(e);
    }
    const path = new Uint8Array(new TextEncoder().encode(pathArg));
    const key = new TextEncoder().encode(renameKey);
    const ktavFree = lib.symbols.ktav_free as (ptr: bigint, len: bigint) => void;
    const outBuf = new BigUint64Array(1);
    const outLen = new BigUint64Array(1);
    const outErr = new BigUint64Array(1);
    const outErrLen = new BigUint64Array(1);
    const ptrOf = (input: Uint8Array): unknown => input.length === 0 ? Deno.UnsafePointer.of(EMPTY_SRC_PLACEHOLDER) : Deno.UnsafePointer.of(input);
    const common = [ptrOf(src), BigInt(src.length), ptrOf(path), BigInt(path.length)];
    const extra = op.startsWith("remove_") ? [] : op.startsWith("rename_") ? [ptrOf(key), BigInt(key.length)] : [ptrOf(replInput), BigInt(replInput.length)];
    const rc = sym(...common, ...extra, Deno.UnsafePointer.of(outBuf), Deno.UnsafePointer.of(outLen), Deno.UnsafePointer.of(outErr), Deno.UnsafePointer.of(outErrLen));
    if (rc !== 0) {
        const errPtrRaw = outErr[0];
        const errLen = Number(outErrLen[0]);
        let msg = `native call failed with code ${rc}`;
        if (errPtrRaw && errLen > 0) {
            const errPtr = Deno.UnsafePointer.create(errPtrRaw);
            if (errPtr) {
                const view = new Deno.UnsafePointerView(errPtr);
                msg = new TextDecoder().decode(new Uint8Array(view.getArrayBuffer(errLen)));
                ktavFree(errPtr as unknown as bigint, BigInt(errLen));
            }
        }
        const okPtrRaw = outBuf[0];
        const okLen = Number(outLen[0]);
        if (okPtrRaw && okLen > 0) {
            const okPtr = Deno.UnsafePointer.create(okPtrRaw);
            if (okPtr) ktavFree(okPtr as unknown as bigint, BigInt(okLen));
        }
        throw toKtavError(new Error(msg));
    }
    const okPtrRaw = outBuf[0];
    const okLen = Number(outLen[0]);
    if (!okPtrRaw || okLen === 0) return "";
    const okPtr = Deno.UnsafePointer.create(okPtrRaw);
    if (!okPtr) return "";
    const view = new Deno.UnsafePointerView(okPtr);
    const copy = new Uint8Array(view.getArrayBuffer(okLen)).slice(0);
    ktavFree(okPtr as unknown as bigint, BigInt(okLen));
    // The patched SOURCE bytes may legitimately begin with a BOM the
    // edit preserved — a default TextDecoder would silently STRIP it.
    // ignoreBOM:true means "keep U+FEFF" (it does not add one).
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(copy);
}

export function editValue(
    source: string,
    path: string,
    replacement: KtavValue,
): Promise<string> {
    return callEdit("edit_value", source, path, replacement);
}

export function editValueSegments(
    source: string,
    segments: readonly string[],
    replacement: KtavValue,
): Promise<string> {
    return callEdit("edit_value_segments", source, JSON.stringify([...segments]), replacement);
}

export function insertValue(source: string, path: string, replacement: KtavValue): Promise<string> { return callEdit("insert_value", source, path, replacement); }
export function insertValueSegments(source: string, segments: readonly string[], replacement: KtavValue): Promise<string> { return callEdit("insert_value_segments", source, JSON.stringify([...segments]), replacement); }
export function removeValue(source: string, path: string): Promise<string> { return callEdit("remove_value", source, path); }
export function removeValueSegments(source: string, segments: readonly string[]): Promise<string> { return callEdit("remove_value_segments", source, JSON.stringify([...segments])); }
export function renameKey(source: string, path: string, newKey: string): Promise<string> { return callEdit("rename_key", source, path, undefined, newKey); }
export function renameKeySegments(source: string, segments: readonly string[], newKey: string): Promise<string> { return callEdit("rename_key_segments", source, JSON.stringify([...segments]), undefined, newKey); }


export const ktav: Pick<Ktav, never> & {
    loads: typeof loads;
    loadsStrict: typeof loadsStrict;
    loadsBytes: typeof loadsBytes;
    dumps: typeof dumps;
    stringifyForceStrings: typeof stringifyForceStrings;
    format: typeof format;
    emitCanonical: typeof emitCanonical;
    canonicalFromSource: typeof canonicalFromSource;
    editValue: typeof editValue;
    editValueSegments: typeof editValueSegments;
    insertValue: typeof insertValue;
    insertValueSegments: typeof insertValueSegments;
    removeValue: typeof removeValue;
    removeValueSegments: typeof removeValueSegments;
    renameKey: typeof renameKey;
    renameKeySegments: typeof renameKeySegments;
} = { loads, loadsStrict, loadsBytes, dumps, stringifyForceStrings, format, emitCanonical, canonicalFromSource, editValue, editValueSegments, insertValue, insertValueSegments, removeValue, removeValueSegments, renameKey, renameKeySegments };
