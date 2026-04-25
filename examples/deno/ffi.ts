// Deno example — calls into the native ktav_cabi via Deno.dlopen.
// Faster than the WASM path for parse / dump of large documents,
// shares one binary with the Java / Go / .NET / Bun bindings.
//
// Permission flag is required; --allow-ffi=<path> narrows the grant
// to just our cabi binary instead of "any FFI".
//
// Run (from repo root):
//
//   cargo build --release -p ktav-cabi
//   KTAV_LIB_PATH="$PWD/target/release/libktav_cabi.so" \
//       deno run --allow-ffi --allow-env --allow-read \
//           examples/deno/ffi.ts

// @ts-nocheck — typed in dist/ts/ffi-deno.d.ts; deno checker is loose.
import { loads, dumps } from "../../dist/ts/ffi-deno.js";

const src = `
service: web
port:i 8080
ratio:f 0.75
tls: true
tags: [
    prod
    eu-west-1
]
db.host: primary.internal
db.timeout:i 30
`;

interface Config {
    service: string;
    port: number;
    ratio: number;
    tls: boolean;
    tags: string[];
    db: { host: string; timeout: number };
}

// ── 1. Parse — typed reads off the parsed object. ─────────────────────
const cfg = await loads<Config>(src);
console.log(`[deno-ffi] service=${cfg.service} port=${cfg.port} tls=${cfg.tls}`);
console.log(`[deno-ffi] db: ${cfg.db.host} (timeout=${cfg.db.timeout}s)`);

// ── 2. Build & render — construct a doc in code. ──────────────────────
const built = {
    name: "frontend",
    port: 8443,
    tls: true,
    ratio: 0.95,
    upstreams: [
        { host: "a.example", port: 1080 },
        { host: "b.example", port: 1080 },
    ],
    notes: null,
};
const text = await dumps(built);
console.log("[deno-ffi] rendered:\n" + text);
