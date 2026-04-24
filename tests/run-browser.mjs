// Browser driver via Playwright (chromium headless). Spins up a tiny
// static HTTP server rooted at the repo, loads a runner page that
// imports the shared assertions + wasm web build, and reports results
// back over `window.__ktavResult`.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".wasm": "application/wasm",
    ".ktav": "text/plain",
    ".json": "application/json",
};

// Collect fixtures — we can't ship the FS walker into the browser, so
// we gather valid / invalid fixture lists server-side and hand them to
// the page as a manifest JSON.
function specDir() {
    const env = process.env.KTAV_SPEC_DIR;
    if (env && existsSync(join(env, "versions"))) return env.replace(/\\/g, "/");
    const submodule = join(repo, "spec");
    if (existsSync(join(submodule, "versions"))) return submodule.replace(/\\/g, "/");
    const sibling = resolve(repo, "..", "spec");
    if (existsSync(join(sibling, "versions"))) return sibling.replace(/\\/g, "/");
    return null;
}
function walkKtavFiles(dir) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...walkKtavFiles(full));
        else if (full.endsWith(".ktav")) out.push(full.replace(/\\/g, "/"));
    }
    return out;
}

const spec = specDir();
// Everything in the manifest is repo-relative — the runner page
// fetches these via `/` + path, the static server resolves them back
// against `repo`. Absolute paths would leak host-specific prefixes
// (`D:/dev/...` or `/home/...`) into fetch URLs and 404 on the server.
const repoFwd = repo.replace(/\\/g, "/");
const relFromRepo = (p) => {
    const fwd = p.replace(/\\/g, "/");
    if (fwd.startsWith(repoFwd + "/")) return fwd.slice(repoFwd.length + 1);
    return fwd;
};
const manifest = spec
    ? {
        specDir: relFromRepo(spec),
        valid: walkKtavFiles(`${spec}/versions/0.1/tests/valid`).map(relFromRepo),
        invalid: walkKtavFiles(`${spec}/versions/0.1/tests/invalid`).map(relFromRepo),
    }
    : { specDir: null, valid: [], invalid: [] };

const server = createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/__manifest") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(manifest));
        return;
    }
    const full = resolve(repo, "." + urlPath);
    if (!full.startsWith(repo) || !existsSync(full) || !statSync(full).isFile()) {
        res.writeHead(404);
        res.end("not found");
        return;
    }
    res.writeHead(200, {
        "content-type": mime[extname(full)] || "application/octet-stream",
        "cache-control": "no-store",
    });
    res.end(readFileSync(full));
});

await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/tests/browser-runner.html`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (msg) => console.log(`[browser:${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => console.error(`[browser:pageerror] ${err}`));

await page.goto(url);
const result = await page.evaluate(
    () =>
        new Promise((resolve) => {
            const done = () => {
                if (globalThis.__ktavResult) resolve(globalThis.__ktavResult);
                else setTimeout(done, 50);
            };
            done();
        }),
);

await browser.close();
server.close();

console.log(`\n[browser] ${result.passed}/${result.total} passed, ${result.failed} failed`);
process.exit(result.failed > 0 ? 1 : 0);
