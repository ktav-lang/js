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

// `bun:ffi` is a Bun built-in — its types are not in @types/node and
// pulling in @types/bun for this single use site would inflate dev
// deps. We type the surface we actually use, and `@ts-expect-error`
// the dynamic import so tsc doesn't need a `declare module`.
interface BunFFI {
    FFIType: { ptr: number; u64: number; i32: number; void: number };
    dlopen(path: string, symbols: Record<string, { args: number[]; returns: number }>): {
        symbols: Record<string, (...args: unknown[]) => unknown>;
    };
    ptr(typedArray: ArrayBufferView): bigint;
    CString: new (ptr: bigint, byteOffset?: number, byteLength?: number) => { toString(): string };
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

    // Out-parameters as Node `Buffer`. Bun's bun:ffi `ptr()` is
    // documented to handle ArrayBufferView, but on some host/arch
    // combinations passing a `BigUint64Array` makes it serialise the
    // *value* instead of taking the buffer address. `Buffer.alloc(8)`
    // is unambiguous: it's a memory region, never mistaken for a
    // scalar.
    const outBuf    = Buffer.alloc(8);
    const outLen    = Buffer.alloc(8);
    const outErr    = Buffer.alloc(8);
    const outErrLen = Buffer.alloc(8);

    // Source bytes — explicit `ptr()` so Bun pins the underlying
    // ArrayBuffer; pass `null` (-> 0) for empty input.
    const srcPtr = input.length === 0 ? null : ffi.ptr(input);

    const rc = sym(
        srcPtr,
        BigInt(input.length),
        ffi.ptr(outBuf),
        ffi.ptr(outLen),
        ffi.ptr(outErr),
        ffi.ptr(outErrLen),
    );

    // Read out-pointer / size_t values back from the 8-byte buffers.
    const readPtr = (b: Buffer): bigint => b.readBigUInt64LE(0);

    const ktavFree = symbols.ktav_free as (ptr: bigint, len: bigint) => void;

    if (rc !== 0) {
        const errPtr = readPtr(outErr);
        const errLen = Number(readPtr(outErrLen));
        let msg = `native call failed with code ${rc}`;
        if (errPtr !== 0n && errLen > 0) {
            const cstr = new ffi.CString(errPtr, 0, errLen);
            msg = cstr.toString();
            ktavFree(errPtr, BigInt(errLen));
        }
        const okPtr = readPtr(outBuf);
        const okLen = Number(readPtr(outLen));
        if (okPtr !== 0n && okLen > 0) ktavFree(okPtr, BigInt(okLen));
        throw new Error(msg);
    }

    const okPtr = readPtr(outBuf);
    const okLen = Number(readPtr(outLen));
    if (okPtr === 0n || okLen === 0) return new Uint8Array(0);
    const cstr = new ffi.CString(okPtr, 0, okLen);
    const text = cstr.toString();
    ktavFree(okPtr, BigInt(okLen));
    return new TextEncoder().encode(text);
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
