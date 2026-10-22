// Bun smoke tests for the empty-source C ABI invariant
// (tests/ffi/empty-abi.mjs) over the `/ffi` subexport.
//
// Run: bun run tests/bun/run-bun-empty-abi.mjs
//
// This runner deliberately does NOT call setLibraryPath: the test
// override SHADOWS the KTAV_LIB_PATH env branch in
// ts/internal/ffi-loader.ts resolveLibPath. Resolution is env-driven
// here (the debug-CI job points KTAV_LIB_PATH at the DEBUG cabi
// artifact, whose slice asserts catch a NULL-for-empty regression),
// and the resolver throws when the env path is missing — a load
// failure is a FAILURE, not a skip.

import { loads, loadsStrict, loadsBytes, format, canonicalFromSource } from "../../dist/ts/ffi-bun.js";
import { runEmptyAbi } from "../ffi/empty-abi.mjs";

if (typeof globalThis.Bun === "undefined") {
    throw new Error("[bun-empty-abi] Bun runtime required");
}

const { failed } = await runEmptyAbi(
    { loads, loadsStrict, loadsBytes, format, canonicalFromSource },
    "bun-empty-abi",
);
process.exit(failed > 0 ? 1 : 0);
