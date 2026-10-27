// Bun FFI entrypoint — `bun:ffi` over the canonical ktav_cabi shared
// library. Same C ABI as the Java / Go / .NET / Deno bindings, exact
// same wire format. Bun does not require a permission flag.
//
// On Node, Deno, and the browser this module is unreachable: the
// package.json `exports` map routes those runtimes elsewhere.

import { ktavMessageError, toKtavError } from "./internal/api.js";
import type { Ktav, KtavInput, KtavValue } from "./internal/api.js";
export type { KtavArray, KtavErrorEnvelope, KtavInput, KtavObject, KtavValue, Ktav } from "./internal/api.js";
export { KtavError, toKtavError } from "./internal/api.js";

import { decode, encode } from "./internal/ffi-codec.js";
import { resolveLibPath } from "./internal/ffi-loader.js";
export { setLibraryPath } from "./internal/ffi-loader.js";

// `bun:ffi` is a Bun built-in — its types are not in @types/node and
// pulling in @types/bun for this single use site would inflate dev
// deps. We type the surface we actually use, and `@ts-expect-error`
// the dynamic import so tsc doesn't need a `declare module`.
interface BunFFI {
    FFIType: { ptr: number; u64: number; i32: number; u32: number; void: number };
    dlopen(path: string, symbols: Record<string, { args: number[]; returns: number }>): {
        symbols: Record<string, (...args: unknown[]) => unknown>;
        /** Available on modern Bun — releases the OS handle. */
        close?: () => void;
    };
    /** Convert a native pointer (number on 64-bit) into an ArrayBuffer view. */
    toArrayBuffer(ptr: number, byteOffset?: number, byteLength?: number): ArrayBuffer;
}

interface FFILib {
    ffi: BunFFI;
    symbols: Record<string, (...args: unknown[]) => unknown>;
}

let cachedLib: FFILib | null = null;

// The binding's ABI contract: ktav 0.9 source-edit (ABI_VERSION 2).
// The gate is STRICT and runs BEFORE any document operation: a library
// that reports any other version (or none) is refused for EVERY native
// call — never a silent pure fallback, never a half-working subset.
const EXPECTED_ABI_VERSION = 2;

function abiGateError(actual: string): Error {
    return new Error(
        `ktav_cabi ABI_VERSION gate: library reports ${actual}, ` +
            `this binding requires ${EXPECTED_ABI_VERSION} (source-edit 0.9, ABI_VERSION 2). ` +
            `All native document operations are refused — upgrade/rebuild ktav_cabi; ` +
            `no pure fallback is performed.`,
    );
}

// Rust требует ненулевой указатель даже при длине 0. Буфер живёт весь вызов.
const EMPTY_SRC_PLACEHOLDER = new Uint8Array(1);

async function getLib(): Promise<FFILib> {
    if (cachedLib !== null) return cachedLib;

    // Indirect through a string variable so Node bundlers don't try to
    // resolve `bun:ffi` at build time.
    const modName = "bun:ffi";
    const ffi = (await import(modName)) as unknown as BunFFI;

    const archMap: Record<string, string> = { x64: "x64", arm64: "arm64" };
    const plat = process.platform;
    const arch = archMap[process.arch] ?? process.arch;
    const path = await resolveLibPath({
        plat: plat as string,
        archName: arch,
        runtime: {
            env: name => process.env[name],
            resolveSubpackage: async (subpkg, file) => {
                const resolved = (import.meta as unknown as {
                    resolve(spec: string): string;
                }).resolve(`${subpkg}/${file}`);
                return new URL(resolved).pathname;
            },
            exists: async p => {
                try {
                    const fs = await import("node:fs/promises");
                    await fs.stat(p);
                    return true;
                } catch {
                    return false;
                }
            },
        },
    });

    const opened = ffi.dlopen(path, {
        ktav_loads: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr],
            returns: ffi.FFIType.i32,
        },
        ktav_loads_strict: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr],
            returns: ffi.FFIType.i32,
        },
        ktav_dumps: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr],
            returns: ffi.FFIType.i32,
        },
        ktav_dumps_force_strings: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr],
            returns: ffi.FFIType.i32,
        },
        ktav_canonical_from_source: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr],
            returns: ffi.FFIType.i32,
        },
        ktav_format: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr],
            returns: ffi.FFIType.i32,
        },
        ktav_emit_canonical: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr],
            returns: ffi.FFIType.i32,
        },
        ktav_edit_value: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr],
            returns: ffi.FFIType.i32,
        },
        ktav_edit_value_segments: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr],
            returns: ffi.FFIType.i32,
        },
        ktav_insert_value: { args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr], returns: ffi.FFIType.i32 },
        ktav_insert_value_segments: { args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr], returns: ffi.FFIType.i32 },
        ktav_remove_value: { args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr], returns: ffi.FFIType.i32 },
        ktav_remove_value_segments: { args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr], returns: ffi.FFIType.i32 },
        ktav_rename_key: { args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr], returns: ffi.FFIType.i32 },
        ktav_rename_key_segments: { args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr], returns: ffi.FFIType.i32 },
        ktav_free: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64],
            returns: ffi.FFIType.void,
        },
        ktav_version: {
            args: [],
            returns: ffi.FFIType.ptr,
        },
        // Strict gate (uint32): probed before ANY document call; a
        // mismatch releases the handle and refuses every operation.
        ktav_abi_version: {
            args: [],
            returns: ffi.FFIType.u32,
        },
    });
    // Strict ABI gate — document ops must never run against a foreign
    // ABI (e.g. an old ABI_VERSION 1 artifact without the edit
    // symbols). Probe first, close the library on mismatch, and cache
    // nothing: every later call fails with the same clear error.
    try {
        const abiVersion = opened.symbols.ktav_abi_version as (() => number) | undefined;
        if (typeof abiVersion !== "function") {
            throw abiGateError("no ktav_abi_version symbol (pre-metadata library)");
        }
        const actual = Number(abiVersion()) >>> 0; // uint32
        if (actual !== EXPECTED_ABI_VERSION) {
            throw abiGateError(String(actual));
        }
    } catch (e) {
        try {
            (opened as { close?: () => void }).close?.();
        } catch {
            // Best effort — the handle is process-lifetime anyway.
        }
        throw e;
    }
    cachedLib = { ffi, symbols: opened.symbols };
    return cachedLib;
}

async function callNative(
    op: "loads" | "loads_strict" | "dumps" | "dumps_force_strings" | "format" | "emit_canonical" | "canonical_from_source",
    input: Uint8Array,
): Promise<Uint8Array> {
    const { ffi, symbols } = await getLib();
    const symbolName = (
        op === "loads" ? "ktav_loads"
            : op === "loads_strict" ? "ktav_loads_strict"
            : op === "dumps" ? "ktav_dumps"
            : op === "dumps_force_strings" ? "ktav_dumps_force_strings"
            : op === "format" ? "ktav_format"
            : op === "canonical_from_source" ? "ktav_canonical_from_source"
            : "ktav_emit_canonical"
    );
    const sym = symbols[symbolName] as (...args: unknown[]) => number;

    // Bun FFI sweet-spot: pass TypedArrays / Buffers directly for
    // `FFIType.ptr` args — Bun pins the ArrayBuffer and forwards the
    // address. Wrapping in `ffi.ptr()` returns a plain number that
    // Bun then refuses to convert back to a pointer ("Unable to
    // convert N to a pointer"). The current code hits the auto-pin
    // path on every supported platform.
    //
    // Out-pointers / size_t out-params: `BigUint64Array(1)` gives us
    // an 8-byte ArrayBuffer view; we read [0] as bigint after the
    // call, then `Number(...)` it down to a JS number for
    // `toArrayBuffer` and `ktav_free`.
    const outBuf    = new BigUint64Array(1);
    const outLen    = new BigUint64Array(1);
    const outErr    = new BigUint64Array(1);
    const outErrLen = new BigUint64Array(1);

    const rc = sym(
        input.length === 0 ? EMPTY_SRC_PLACEHOLDER : input,
        BigInt(input.length),
        outBuf,
        outLen,
        outErr,
        outErrLen,
    );

    const ktavFree = symbols.ktav_free as (ptr: number, len: bigint) => void;

    const readPtr = (b: BigUint64Array): number => Number(b[0]);
    const readLen = (b: BigUint64Array): number => Number(b[0]);

    if (rc !== 0) {
        const errPtr = readPtr(outErr);
        const errLen = readLen(outErrLen);
        let msg = `native call failed with code ${rc}`;
        if (errPtr !== 0 && errLen > 0) {
            const buf = ffi.toArrayBuffer(errPtr, 0, errLen);
            msg = new TextDecoder().decode(new Uint8Array(buf));
            ktavFree(errPtr, BigInt(errLen));
        }
        const okPtr = readPtr(outBuf);
        const okLen = readLen(outLen);
        if (okPtr !== 0 && okLen > 0) ktavFree(okPtr, BigInt(okLen));
        throw toKtavError(new Error(msg));
    }

    const okPtr = readPtr(outBuf);
    const okLen = readLen(outLen);
    if (okPtr === 0 || okLen === 0) return new Uint8Array(0);
    const buf = ffi.toArrayBuffer(okPtr, 0, okLen);
    const copy = new Uint8Array(buf.slice(0));
    ktavFree(okPtr, BigInt(okLen));
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

/** Shared edit call: source / path (or JSON segments) / replacement
 *  (tagged wire JSON from the shared codec) → patched source text.
 *  All three inputs are snapshotted synchronously; the strict ABI gate
 *  in getLib() refuses any library whose ABI_VERSION differs from 2
 *  BEFORE any operation runs — clear error, no pure fallback. */
async function callEdit(
    op: "edit_value" | "edit_value_segments" | "insert_value" | "insert_value_segments" | "remove_value" | "remove_value_segments" | "rename_key" | "rename_key_segments",
    source: string,
    pathArg: string,
    replacement: KtavValue = null,
    renameKey = "",
): Promise<string> {
    const { ffi, symbols } = await getLib();
    const symbolName = `ktav_${op}`;
    const sym = symbols[symbolName] as ((...args: unknown[]) => number) | undefined;
    if (typeof sym !== "function") {
        throw ktavMessageError(
            `installed ktav_cabi library does not export ${symbolName} ` +
                `(source-edit requires ABI_VERSION 2 / ktav 0.9 core)`,
        );
    }
    const src = new Uint8Array(new TextEncoder().encode(source));
    let replInput: Uint8Array = new Uint8Array();
    try {
        if (op.startsWith("edit_") || op.startsWith("insert_")) replInput = encode(replacement);
    } catch (e) {
        // ABI source operations parse before decoding replacement transport.
        // Preserve that precedence even when host-side encoding fails.
        await callNative("loads", src);
        throw toKtavError(e);
    }
    const path = new Uint8Array(new TextEncoder().encode(pathArg));
    const key = new TextEncoder().encode(renameKey);
    const outBuf = new BigUint64Array(1);
    const outLen = new BigUint64Array(1);
    const outErr = new BigUint64Array(1);
    const outErrLen = new BigUint64Array(1);
    const pathArgBytes = path.length === 0 ? EMPTY_SRC_PLACEHOLDER : path;
    const replacementArg = replInput.length === 0 ? EMPTY_SRC_PLACEHOLDER : replInput;
    const keyArg = key.length === 0 ? EMPTY_SRC_PLACEHOLDER : key;
    const common = [src.length === 0 ? EMPTY_SRC_PLACEHOLDER : src, BigInt(src.length), pathArgBytes, BigInt(path.length)];
    const inputs = op.startsWith("remove_") ? common : op.startsWith("rename_")
        ? [...common, keyArg, BigInt(key.length)]
        : [...common, replacementArg, BigInt(replInput.length)];
    const rc = sym(...inputs, outBuf, outLen, outErr, outErrLen);
    const ktavFree = symbols.ktav_free as (ptr: number, len: bigint) => void;
    const readPtr = (b: BigUint64Array): number => Number(b[0]);
    if (rc !== 0) {
        const errPtr = readPtr(outErr);
        const errLen = Number(outErrLen[0]!);
        let msg = `native call failed with code ${rc}`;
        if (errPtr !== 0 && errLen > 0) {
            const buf = ffi.toArrayBuffer(errPtr, 0, errLen);
            msg = new TextDecoder().decode(new Uint8Array(buf));
            ktavFree(errPtr, BigInt(errLen));
        }
        const okPtr = readPtr(outBuf);
        const okLen = Number(outLen[0]!);
        if (okPtr !== 0 && okLen > 0) ktavFree(okPtr, BigInt(okLen));
        throw toKtavError(new Error(msg));
    }
    const okPtr = readPtr(outBuf);
    const okLen = Number(outLen[0]!);
    if (okPtr === 0 || okLen === 0) return "";
    const buf = ffi.toArrayBuffer(okPtr, 0, okLen);
    const copy = new Uint8Array(buf.slice(0));
    ktavFree(okPtr, BigInt(okLen));
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
    const pathArg = JSON.stringify([...segments]);
    return callEdit("edit_value_segments", source, pathArg, replacement);
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
