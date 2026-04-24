import { defineConfig } from "vite";

// Vite example targeting the `bundler` wasm build. Vite resolves the
// `.wasm` import at build time — no runtime `init()` call.
export default defineConfig({
    resolve: {
        alias: {
            "@ktav-lang/ktav": new URL("../../dist/ts/bundler.js", import.meta.url).pathname,
        },
    },
    optimizeDeps: {
        exclude: ["@ktav-lang/ktav"],
    },
});
