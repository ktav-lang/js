// Browser example. Loads the wasm `web` target via `init()` with a
// URL pointing to the sibling `.wasm`, which the browser fetches.
// Serve this directory (or the repo root) over HTTP — any static
// server works (`python -m http.server`, `npx serve`, Vite, etc.).

import init, { loads, dumps } from "../../dist/wasm/web/ktav.js";

const out = document.getElementById("out");

function write(msg, cls) {
    const span = document.createElement("span");
    if (cls) span.className = cls;
    span.textContent = msg + "\n";
    out.textContent = "";
    out.appendChild(span);
}

try {
    await init({
        module_or_path: new URL("../../dist/wasm/web/ktav_bg.wasm", import.meta.url),
    });

    const src = `
service: ktav-browser-demo
port:i 8080
ratio:f 0.75
tags: [
    prod
    eu
]
`;
    const cfg = loads(src);
    out.textContent =
        "parsed:\n" + JSON.stringify(cfg, null, 2) +
        "\n\nrendered:\n" + dumps(cfg);
} catch (e) {
    write(`Error: ${e.message}`, "err");
    console.error(e);
}
