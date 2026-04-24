// Vite example. The bundler entry of ktav ships the wasm `bundler`
// target — Vite treats the sibling `.wasm` as an asset import and
// inlines/serves it according to its own policy. No runtime `init()`
// call is needed.

import { loads, dumps } from "ktav";

const src = `
service: ktav-vite-demo
port:i 8080
tags: [
    prod
    eu
]
`;

const cfg = loads(src);
const out = document.getElementById("out")!;
out.textContent =
    "parsed:\n" + JSON.stringify(cfg, null, 2) +
    "\n\nrendered:\n" + dumps(cfg);
