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

import type { Ktav, KtavInput, KtavValue } from "./api.js";
export type { KtavArray, KtavError, KtavInput, KtavObject, KtavValue, Ktav } from "./api.js";

import { decode, encode } from "./ffi-codec.js";
import { resolveLibPath } from "./ffi-loader.js";
export { setLibraryPath } from "./ffi-loader.js";

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
    ktav_free: {
        parameters: ["pointer", "usize"],
        result: "void",
    },
    ktav_version: {
        parameters: [],
        result: "pointer",
    },
} as const;

let cachedLib: { symbols: Record<string, (...args: unknown[]) => unknown> } | null = null;

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
    return cachedLib;
}

// ── FFI plumbing ─────────────────────────────────────────────────────

async function callNative(
    op: "loads" | "loads_strict" | "dumps" | "dumps_force_strings",
    input: Uint8Array,
): Promise<Uint8Array> {
    const lib = await getLib();
    const sym = (
        op === "loads"
            ? lib.symbols.ktav_loads
            : op === "loads_strict"
                ? lib.symbols.ktav_loads_strict
            : op === "dumps"
                ? lib.symbols.ktav_dumps
                : lib.symbols.ktav_dumps_force_strings
    ) as (...args: unknown[]) => number;
    const ktavFree = lib.symbols.ktav_free as (ptr: bigint, len: bigint) => void;

    const outBuf = new BigUint64Array(1);
    const outLen = new BigUint64Array(1);
    const outErr = new BigUint64Array(1);
    const outErrLen = new BigUint64Array(1);

    const srcPtr = input.length === 0 ? null : Deno.UnsafePointer.of(input);

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
        throw new Error(msg);
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

export async function dumps<T extends KtavInput = KtavInput>(value: T): Promise<string> {
    if (value === null || typeof value !== "object") {
        throw new Error("top-level Ktav document must be an object or an array");
    }
    const input = encode(value);
    const result = await callNative("dumps", input);
    return new TextDecoder().decode(result);
}

export async function stringifyForceStrings<T extends KtavInput = KtavInput>(
    value: T,
): Promise<string> {
    if (value === null || typeof value !== "object") {
        throw new Error("top-level Ktav document must be an object or an array");
    }
    const input = encode(value);
    const result = await callNative("dumps_force_strings", input);
    return new TextDecoder().decode(result);
}

/** Convenience facade matching the synchronous Ktav interface. */
export const ktav: Pick<Ktav, never> & {
    loads: typeof loads;
    loadsStrict: typeof loadsStrict;
    dumps: typeof dumps;
    stringifyForceStrings: typeof stringifyForceStrings;
} = { loads, loadsStrict, dumps, stringifyForceStrings };
