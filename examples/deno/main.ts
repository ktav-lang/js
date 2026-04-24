// Deno example — loads the wasm `web` target. Deno runs the same ESM
// glue as the browser; we just pre-read the `.wasm` bytes via
// `Deno.readFile` so `init()` doesn't have to `fetch()` them.
// Run: deno run --allow-read examples/deno/main.ts

import init, { loads, dumps } from "../../dist/wasm/web/ktav.js";

const wasmPath = new URL("../../dist/wasm/web/ktav_bg.wasm", import.meta.url);
await init({ module_or_path: await Deno.readFile(wasmPath) });

const src = `
service: ktav-gateway
port:i 8080
tls: true
tags: [
    production
    eu-west-1
]
`;

const cfg = loads(src) as {
    service: string;
    port: number;
    tls: boolean;
    tags: string[];
};
console.log(`[deno] service=${cfg.service} port=${cfg.port}`);
console.log(`[deno] rendered:\n${dumps(cfg)}`);
