// Deno driver for the shared assertion set. Deno runs the same
// web-target wasm as the browser — pre-read the `.wasm` via
// `Deno.readFile` so `init()` doesn't have to `fetch()`.
// Run: deno run --allow-read --allow-env tests/run-deno.ts

import init, { loads, dumps } from "../dist/wasm/web/ktav.js";
// @ts-expect-error — plain .mjs, no type-decls; run-time is fine.
import { runAll } from "./shared/assertions.mjs";

const wasmUrl = new URL("../dist/wasm/web/ktav_bg.wasm", import.meta.url);
await init({ module_or_path: await Deno.readFile(wasmUrl) });

const repo = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function walkKtavFiles(dir: string): string[] {
    try {
        Deno.statSync(dir);
    } catch {
        return [];
    }
    const out: string[] = [];
    for (const entry of Deno.readDirSync(dir)) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory) out.push(...walkKtavFiles(full));
        else if (entry.name.endsWith(".ktav")) out.push(full);
    }
    return out;
}

function specDir(): string | null {
    const env = Deno.env.get("KTAV_SPEC_DIR");
    const candidates = [
        env,
        `${repo}/spec`,
        `${repo}/../spec`,
    ].filter(Boolean) as string[];
    for (const c of candidates) {
        try {
            if (Deno.statSync(`${c}/versions`).isDirectory) return c;
        } catch {
            // missing, try next
        }
    }
    return null;
}

const { passed, failed, total } = runAll({
    loads,
    dumps,
    readTextFile: (p: string) => Deno.readTextFileSync(p),
    walkKtavFiles,
    specDir: specDir(),
    label: "deno",
    log: (m: string) => console.log(m),
});

console.log(`\n[deno] ${passed}/${total} passed, ${failed} failed`);
Deno.exit(failed > 0 ? 1 : 0);
