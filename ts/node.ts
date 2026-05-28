// Node / Bun entrypoint. Loads the native `.node` binary built by
// `napi-rs` and re-exports it under the canonical generic-typed API
// from `./api`. Node and Bun both support N-API, so both resolve here
// via the package.json `exports` map.

import { createRequire } from "node:module";
import { platform, arch } from "node:process";

import type { KtavInput, KtavValue } from "./api.js";
export type { KtavArray, KtavError, KtavInput, KtavObject, KtavValue, Ktav } from "./api.js";

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
    dumps: (obj: unknown) => string;
    stringifyForceStrings: (obj: unknown) => string;
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
    return native.loads(s) as T;
}

export function dumps<T extends KtavInput = KtavInput>(obj: T): string {
    return native.dumps(obj);
}

export function stringifyForceStrings<T extends KtavInput = KtavInput>(obj: T): string {
    return native.stringifyForceStrings(obj);
}
