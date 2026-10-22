// CI-only packaged test: install the npm pack tarball into a scratch
// consumer dir and verify — through the PUBLIC package exports, by bare
// specifier, exactly as a real consumer would resolve them — that
// (a) import("@ktav-lang/ktav") FAILS to load (clean install with
// --omit=optional: no platform native binary), and (b)
// import("@ktav-lang/ktav/pure") SUCCEEDS and passes a smoke round
// trip. Requires env KTAV_PACKED_TGZ.
//
// Importing by bare specifier (not by dist file URL) exercises the
// package.json `exports` map. It works from the scratch dir because
// `npm install <tgz>` places the package under
// installDir/node_modules/@ktav-lang/ktav and Node resolves bare
// specifiers relative to the importing file's location — the runner
// lives inside installDir. NODE_PATH is never set, so the repo checkout
// cannot leak into resolution.

import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const tgz = process.env.KTAV_PACKED_TGZ;
if (!tgz || !existsSync(tgz)) {
    console.error(`✖ KTAV_PACKED_TGZ not set or not a file: ${tgz ?? "(unset)"} — this runner is CI-only (npm pack first)`);
    process.exit(1);
}
const tgzPath = resolve(tgz).replace(/\\/g, "/");

const installDir = mkdtempSync(join(tmpdir(), "ktav-packaged-pure-install-"));
let failed = 0;
try {
    // Scratch consumer manifest: ESM, depending on the tarball by file:
    // path. --omit=optional keeps the platform native subpackages out.
    writeFileSync(
        join(installDir, "package.json"),
        JSON.stringify({
            name: "ktav-packaged-pure-consumer",
            private: true,
            type: "module",
            dependencies: { "@ktav-lang/ktav": `file:${tgzPath}` },
        }, null, 2) + "\n",
    );

    // No shell, no string interpolation into a shell — execFileSync argv form.
    execFileSync("npm", ["install", "--omit=dev", "--omit=optional", "--no-audit", "--no-fund", "--loglevel=error", tgzPath], {
        cwd: installDir,
        stdio: "inherit",
        shell: false,
        env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
    });

    if (!existsSync(join(installDir, "node_modules", "@ktav-lang", "ktav", "package.json"))) {
        throw new Error("npm install did not place @ktav-lang/ktav under node_modules");
    }

    // The child runner does the imports by bare specifier and reports
    // outcomes on stdout via markers; the parent judges them here.
    const runnerSource = `
const PKG = "@ktav-lang/ktav";
try {
    await import(PKG);
    console.log("DEFAULT_IMPORT_OK");
} catch (e) {
    console.log("DEFAULT_IMPORT_FAILED:" + String((e && e.message) || e).slice(0, 200));
}
const pure = await import(PKG + "/pure");
const doc = pure.loads("port: 8080\\nhost: localhost\\ntags: [\\n    alpha\\n    beta\\n]\\n");
if (doc.port !== 8080 || doc.host !== "localhost" || JSON.stringify(doc.tags) !== JSON.stringify(["alpha", "beta"])) {
    throw new Error("pure loads smoke mismatch: " + JSON.stringify(doc));
}
const text = pure.dumps(doc);
const back = pure.loads(text);
if (back.port !== 8080) throw new Error("dumps/loads round trip lost port");
const canonical = pure.canonicalFromSource("port: 8080\\nhost: localhost\\n");
if (canonical !== "port: 8080\\nhost: localhost\\n") {
    throw new Error("canonicalFromSource smoke mismatch: " + JSON.stringify(canonical));
}
const formatted = pure.format("## c\\n\\n\\n\\nport: 8080\\n");
if (!formatted.includes("## c") || /\\n\\n\\n/.test(formatted)) {
    throw new Error("format smoke mismatch: " + JSON.stringify(formatted));
}
console.log("PURE_OK");
`;
    writeFileSync(join(installDir, "runner.mjs"), runnerSource);

    let output;
    try {
        output = execFileSync(process.execPath, ["runner.mjs"], {
            cwd: installDir,
            encoding: "utf8",
            shell: false,
            // Deliberately no NODE_PATH — resolution must come from
            // installDir/node_modules only.
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
    } catch (e) {
        throw new Error(`runner.mjs failed: ${String((e && e.stderr) || e).slice(0, 400)}`);
    }
    console.log(output.trim());

    // (a) default entrypoint must FAIL to import (no native binary).
    if (output.includes("DEFAULT_IMPORT_OK")) {
        console.error("✖ import(\"@ktav-lang/ktav\") unexpectedly SUCCEEDED — expected the native entrypoint to fail without a native binary");
        failed++;
    } else {
        const why = output.split("\n").find(l => l.startsWith("DEFAULT_IMPORT_FAILED:")) || "(no marker)";
        console.log(`✔ import(".") failed as expected without a native binary — ${why}`);
    }

    // (b) ./pure must import through the public export and pass smoke.
    if (output.includes("PURE_OK")) {
        console.log("✔ import(\"@ktav-lang/ktav/pure\") resolved via the package exports map and passed the smoke round trip");
    } else {
        console.error("✖ import(\"@ktav-lang/ktav/pure\") did not complete the smoke round trip");
        failed++;
    }
} catch (e) {
    console.error(`✖ packaged-pure: ${e.message || e}`);
    failed++;
} finally {
    try { rmSync(installDir, { recursive: true, force: true }); } catch { /* temp cleanup best-effort */ }
}

process.exit(failed > 0 ? 1 : 0);
