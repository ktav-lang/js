// Bun example — calls into the native ktav_cabi via bun:ffi. No
// permission flag required (Bun trusts FFI). Same C ABI as the
// Java / Go / .NET / Deno bindings.
//
// Run (from repo root):
//
//   cargo build --release -p ktav-cabi
//   KTAV_LIB_PATH="$PWD/target/release/libktav_cabi.so" \
//       bun run examples/bun/ffi.ts

import { loads, dumps } from "../../dist/ts/ffi-bun.js";

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

const cfg = await loads<Config>(src);
console.log(`[bun-ffi] service=${cfg.service} port=${cfg.port} tls=${cfg.tls}`);
console.log(`[bun-ffi] db: ${cfg.db.host} (timeout=${cfg.db.timeout}s)`);

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
console.log("[bun-ffi] rendered:\n" + (await dumps(built)));
