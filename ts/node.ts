// Node / Bun entrypoint. Loads the native `.node` binary built by
// `napi-rs` and re-exports it under the canonical generic-typed API
// from `./api`. Node and Bun both support N-API, so both resolve here
// via the package.json `exports` map.

import { createRequire } from "node:module";
import { platform, arch } from "node:process";

import type { KtavInput, KtavValue } from "./api.js";
export type { KtavArray, KtavError, KtavInput, KtavObject, KtavValue, Ktav } from "./api.js";

// Locate the platform-specific `.node` binary. At publish time these
// live in `optionalDependencies` subpackages (@ktav-lang/js-<triple>)
// and npm installs only the matching one. For local dev / CI the
// files sit next to this script under `dist/native/`.
//
// The triple mirrors napi-rs conventions — see
// https://napi.rs/docs/deep-dive/release for the canonical list.
function resolveTriple(): string {
    const abi = platform === "linux" ? "-gnu" : platform === "win32" ? "-msvc" : "";
    const os = platform === "win32" ? "win32" : platform === "darwin" ? "darwin" : "linux";
    return `${os}-${arch}${abi}`;
}

interface NativeBinding {
    loads: (s: string) => unknown;
    dumps: (obj: unknown) => string;
}

const require_ = createRequire(import.meta.url);
const triple = resolveTriple();

let native: NativeBinding;
try {
    // Local dev / CI path — a single .node file next to this module.
    native = require_(`../native/ktav.${triple}.node`) as NativeBinding;
} catch {
    // Published path — resolves through npm's optionalDependencies.
    native = require_(`@ktav-lang/js-${triple}`) as NativeBinding;
}

export function loads<T = KtavValue>(s: string): T {
    return native.loads(s) as T;
}

export function dumps<T extends KtavInput = KtavInput>(obj: T): string {
    return native.dumps(obj);
}
