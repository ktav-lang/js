// Deno example — uses the WASM build (default for Deno via the
// package.json `exports` map). Zero permissions required, works in
// any sandbox. ~3-5× slower than the native FFI path on large
// documents — see `ffi.ts` for the dlopen variant.
//
// Run: deno run --allow-read examples/deno/wasm.ts

import init, { loads, dumps } from "../../dist/wasm/web/ktav.js";

// Pre-read the .wasm bytes so init() doesn't have to fetch() them.
const wasmPath = new URL("../../dist/wasm/web/ktav_bg.wasm", import.meta.url);
await init({ module_or_path: await Deno.readFile(wasmPath) });

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

const cfg = loads(src) as Config;
console.log(`[deno-wasm] service=${cfg.service} port=${cfg.port} tls=${cfg.tls}`);
console.log(`[deno-wasm] db: ${cfg.db.host} (timeout=${cfg.db.timeout}s)`);

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
console.log("[deno-wasm] rendered:\n" + dumps(built));
