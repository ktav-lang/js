// Hardcoded paths for the JS test suites. We implement one specific
// spec version and the cabi build lives in the same workspace.
//
// The loader hooks are runtime-specific:
//   - cabi: the FFI runners call `setLibraryPath(testPaths.cabi)` on
//     the relevant entrypoint (`ffi-bun` / `ffi-deno`); the N-API and
//     WASM backends bundle their own native artefacts.
//   - spec: every runner reads `testPaths.spec` directly.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");

const platform = (() => {
    if (typeof process !== "undefined" && process.platform) return process.platform;
    if (typeof Deno !== "undefined") {
        return Deno.build.os === "windows" ? "win32" : Deno.build.os;
    }
    return "linux";
})();

function cabiName() {
    if (platform === "win32") return "ktav_cabi.dll";
    if (platform === "darwin") return "libktav_cabi.dylib";
    return "libktav_cabi.so";
}

const cargoTarget = process.env.CARGO_TARGET_DIR
    ? resolve(process.env.CARGO_TARGET_DIR)
    : join(repo, "target");
export const cabi = join(cargoTarget, "release", cabiName());
export const spec = join(repo, "spec", "versions", "0.6", "tests");

export function cabiBuilt() {
    return existsSync(cabi);
}

export function specPresent() {
    return existsSync(join(spec, "valid")) || existsSync(join(spec, "invalid"));
}
