// Deno smoke tests for the empty-source C ABI invariant
// (tests/ffi/empty-abi.mjs) over the `/ffi` subexport.
//
// Run: deno run --allow-ffi --allow-env --allow-read tests/deno/run-deno-empty-abi.ts

// @ts-nocheck — TypeScript here is for human eyes; Deno runs the .ts
// file directly without a checker, and the import path resolves to
// the compiled `dist/ts/ffi-deno.js` since deno honours `.js`
// suffixes via the package exports map only when imported by name.

// This runner deliberately does NOT call setLibraryPath: the test
// override SHADOWS the KTAV_LIB_PATH env branch in
// ts/internal/ffi-loader.ts resolveLibPath. Resolution is env-driven
// here (the debug-CI job points KTAV_LIB_PATH at the DEBUG cabi
// artifact, whose slice asserts catch a NULL-for-empty regression),
// and the resolver throws when the env path is missing — a load
// failure is a FAILURE, not a skip.

import { loads, loadsStrict, loadsBytes, format, canonicalFromSource } from "../../dist/ts/ffi-deno.js";
import { runEmptyAbi } from "../ffi/empty-abi.mjs";

const { failed } = await runEmptyAbi(
    { loads, loadsStrict, loadsBytes, format, canonicalFromSource },
    "deno-empty-abi",
);
Deno.exit(failed > 0 ? 1 : 0);
