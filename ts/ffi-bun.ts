// Bun FFI entrypoint — `bun:ffi` over the canonical ktav_cabi shared
// library. Same C ABI as the Java / Go / .NET / Deno bindings, exact
// same wire format. Bun does not require a permission flag.
//
// On Node, Deno, and the browser this module is unreachable: the
// package.json `exports` map routes those runtimes elsewhere.

import type { Ktav, KtavInput, KtavValue } from "./api.js";
export type { KtavArray, KtavError, KtavInput, KtavObject, KtavValue, Ktav } from "./api.js";

import { decode, encode } from "./ffi-codec.js";
import { resolveLibPath } from "./ffi-loader.js";
export { setLibraryPath } from "./ffi-loader.js";

// `bun:ffi` is a Bun built-in — its types are not in @types/node and
// pulling in @types/bun for this single use site would inflate dev
// deps. We type the surface we actually use, and `@ts-expect-error`
// the dynamic import so tsc doesn't need a `declare module`.
interface BunFFI {
    FFIType: { ptr: number; u64: number; i32: number; void: number };
    dlopen(path: string, symbols: Record<string, { args: number[]; returns: number }>): {
        symbols: Record<string, (...args: unknown[]) => unknown>;
    };
    /** Convert a native pointer (number on 64-bit) into an ArrayBuffer view. */
    toArrayBuffer(ptr: number, byteOffset?: number, byteLength?: number): ArrayBuffer;
}

interface FFILib {
    ffi: BunFFI;
    symbols: Record<string, (...args: unknown[]) => unknown>;
}

let cachedLib: FFILib | null = null;

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
        ktav_dumps: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr],
            returns: ffi.FFIType.i32,
        },
        ktav_free: {
            args: [ffi.FFIType.ptr, ffi.FFIType.u64],
            returns: ffi.FFIType.void,
        },
        ktav_version: {
            args: [],
            returns: ffi.FFIType.ptr,
        },
    });
    cachedLib = { ffi, symbols: opened.symbols };
    return cachedLib;
}

async function callNative(op: "loads" | "dumps", input: Uint8Array): Promise<Uint8Array> {
    const { ffi, symbols } = await getLib();
    const sym = (op === "loads" ? symbols.ktav_loads : symbols.ktav_dumps) as
        (...args: unknown[]) => number;

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
        input.length === 0 ? null : input,
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
        throw new Error(msg);
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

export async function dumps<T extends KtavInput = KtavInput>(value: T): Promise<string> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("top-level Ktav document must be an object");
    }
    const input = encode(value);
    const result = await callNative("dumps", input);
    return new TextDecoder().decode(result);
}

export const ktav: Pick<Ktav, never> & {
    loads: typeof loads;
    dumps: typeof dumps;
} = { loads, dumps };
