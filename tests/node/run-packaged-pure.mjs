// CI-only packaged test: install the npm pack tarball into a scratch
// consumer dir and verify — through the PUBLIC package exports, by bare
// specifier — that the default entry fails without optional native
// packages while /pure works without third-party/native/WASM artifacts.
// Requires KTAV_PACKED_TGZ.

import {
    lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync,
    realpathSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

const tgz = process.env.KTAV_PACKED_TGZ;
if (!tgz) {
    console.error("✖ KTAV_PACKED_TGZ is not set — this runner is CI-only (npm pack first)");
    process.exit(1);
}
const tgzPath = resolve(tgz).replace(/\\/g, "/");
const installDir = mkdtempSync(join(tmpdir(), "ktav-packaged-pure-install-"));
let failed = 0;

function assertInside(root, path) {
    const rel = relative(root, path);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error(`path escapes owned root: ${path}`);
    }
}

function validatePackagePath(rootDir, packageDir) {
    const rootPath = resolve(rootDir);
    const rootStat = lstatSync(rootPath);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
        throw new Error(`consumer root is not a real directory: ${rootPath}`);
    }
    const root = realpathSync(rootPath);
    if (root !== rootPath) throw new Error("consumer root realpath changed");
    const packagePath = resolve(packageDir);
    assertInside(root, packagePath);
    if (packagePath === root) throw new Error("package path is not below consumer root");

    let current = root;
    const rel = relative(root, packagePath);
    for (const part of rel.split(sep)) {
        current = join(current, part);
        const stat = lstatSync(current);
        if (stat.isSymbolicLink()) throw new Error(`symlink/junction in package path: ${current}`);
        if (!stat.isDirectory()) throw new Error(`package path component is not a directory: ${current}`);
    }
    const realPackage = realpathSync(packagePath);
    assertInside(root, realPackage);
    if (realPackage !== packagePath) throw new Error("package root realpath differs from its checked path");
    return { root, packageDir: realPackage };
}

function inventoryTree(root, start) {
    const entries = [];
    const visit = path => {
        assertInside(root, path);
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) throw new Error(`symlink/junction in installed package tree: ${path}`);
        if (stat.isDirectory()) {
            entries.push({ path, directory: true });
            for (const name of readdirSync(path)) visit(join(path, name));
        } else if (stat.isFile()) {
            entries.push({ path, directory: false });
        } else {
            throw new Error(`unsupported filesystem entry in installed package: ${path}`);
        }
    };
    visit(start);
    return entries;
}

function removeInventory(root, entries) {
    for (const entry of [...entries].reverse()) {
        assertInside(root, entry.path);
        const stat = lstatSync(entry.path);
        if (stat.isSymbolicLink()) throw new Error(`symlink/junction appeared before removal: ${entry.path}`);
        if (entry.directory) {
            if (!stat.isDirectory()) throw new Error(`directory changed before removal: ${entry.path}`);
            rmdirSync(entry.path);
        } else {
            if (!stat.isFile()) throw new Error(`file changed before removal: ${entry.path}`);
            unlinkSync(entry.path);
        }
    }
}

function makeArtifactGuard(rootDir, packageDir) {
    const checked = validatePackagePath(rootDir, packageDir);
    // Full real tree walk rejects symlinks in every package descendant.
    const completeTree = inventoryTree(checked.root, checked.packageDir);
    const withinWasm = path => {
        const rel = relative(checked.packageDir, path);
        return rel === join("dist", "wasm") || rel.startsWith(join("dist", "wasm") + sep);
    };
    const wasmEntries = completeTree.filter(entry => withinWasm(entry.path));
    const nativeEntries = completeTree.filter(entry =>
        !entry.directory && !withinWasm(entry.path) && /\.(?:node|so|dll|dylib)$/i.test(entry.path),
    );
    return {
        root: checked.root,
        packageDir: checked.packageDir,
        wasmEntries,
        nativeEntries,
    };
}

function removeArtifacts(guard) {
    // Deletions happen only after makeArtifactGuard has inventoried the
    // entire package tree. Revalidate containment and lstat each entry.
    removeInventory(guard.root, guard.nativeEntries);
    removeInventory(guard.root, guard.wasmEntries);
    const rest = inventoryTree(guard.root, guard.packageDir);
    const wasmRel = join("dist", "wasm");
    if (rest.some(entry => {
        const rel = relative(guard.packageDir, entry.path);
        return rel === wasmRel || rel.startsWith(wasmRel + sep) ||
            (!entry.directory && /\.(?:node|so|dll|dylib)$/i.test(entry.path));
    })) {
        throw new Error("runtime artifact remains after removal");
    }
}

function existsPath(path) {
    try { lstatSync(path); return true; } catch (e) {
        if (e && e.code === "ENOENT") return false;
        throw e;
    }
}

function cleanupOwnedRoot(rootDir) {
    const rootPath = resolve(rootDir);
    const rootStat = lstatSync(rootPath);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
        throw new Error(`owned scratch root is not a real directory: ${rootPath}`);
    }
    const root = realpathSync(rootPath);
    if (root !== rootPath) throw new Error("owned scratch root realpath changed before cleanup");
    const visit = path => {
        assertInside(root, path);
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) {
            unlinkSync(path); // remove the link itself; never follow it
        } else if (stat.isDirectory()) {
            for (const name of readdirSync(path)) visit(join(path, name));
            rmdirSync(path);
        } else if (stat.isFile()) {
            unlinkSync(path);
        } else {
            throw new Error(`unsupported entry under owned scratch root: ${path}`);
        }
    };
    visit(root);
}

function expectGuardRejects(root, packageDir, label, sentinelFile) {
    let rejected = false;
    try {
        removeArtifacts(makeArtifactGuard(root, packageDir));
    } catch (e) {
        if (!(e instanceof Error) || !e.message.startsWith("symlink/junction ")) {
            throw new Error(`${label}: unexpected guard error: ${e}`);
        }
        rejected = true;
    }
    if (!rejected) throw new Error(`${label}: expected artifact guard rejection`);
    if (readFileSync(sentinelFile, "utf8") !== "keep sentinel\n") {
        throw new Error(`${label}: sentinel content changed`);
    }
}

function runGuardRegressions() {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "ktav-pure-guard-fixture-"));
    const sentinelRoot = mkdtempSync(join(tmpdir(), "ktav-pure-guard-sentinel-"));
    let testError = null;
    let sentinelFile;
    try {
        sentinelFile = join(sentinelRoot, "keep.node");
        writeFileSync(sentinelFile, "keep sentinel\n");

        // package/dist -> external sentinel: guard must reject before any
        // removal. Both roots are newly created by this test.
        const linkedPackage = join(fixtureRoot, "package");
        mkdirSync(linkedPackage);
        symlinkSync(sentinelRoot, join(linkedPackage, "dist"), "junction");
        expectGuardRejects(fixtureRoot, linkedPackage, "dist link fixture", sentinelFile);

        // A nested link is also rejected during the full-tree inventory.
        const nestedRoot = join(fixtureRoot, "nested");
        mkdirSync(nestedRoot);
        mkdirSync(join(nestedRoot, "dist"));
        symlinkSync(sentinelRoot, join(nestedRoot, "dist", "wasm"), "junction");
        expectGuardRejects(fixtureRoot, nestedRoot, "nested WASM link fixture", sentinelFile);

        // A package root link is rejected while validating every path
        // ancestor from the consumer root before metadata is read.
        const cleanPackage = join(fixtureRoot, "package-link-target");
        mkdirSync(cleanPackage);
        symlinkSync(cleanPackage, join(fixtureRoot, "package-link"), "junction");
        expectGuardRejects(fixtureRoot, join(fixtureRoot, "package-link"), "package root link fixture", sentinelFile);

        // Valid-tree control: real dist/wasm plus a native artifact are
        // inventoried first, then removed only within this fixture root.
        const validRoot = join(fixtureRoot, "valid");
        const validPackage = join(validRoot, "package");
        mkdirSync(validRoot);
        mkdirSync(join(validPackage, "dist", "wasm"), { recursive: true });
        writeFileSync(join(validPackage, "dist", "wasm", "module.wasm"), "wasm");
        writeFileSync(join(validPackage, "native.node"), "native");
        removeArtifacts(makeArtifactGuard(validRoot, validPackage));
        if (existsPath(join(validPackage, "dist", "wasm")) || existsPath(join(validPackage, "native.node"))) {
            throw new Error("valid-tree control: artifacts were not removed");
        }
        if (readFileSync(sentinelFile, "utf8") !== "keep sentinel\n") {
            throw new Error("valid-tree control changed sentinel");
        }
    } catch (e) {
        testError = e;
    }
    const cleanupErrors = [];
    try { cleanupOwnedRoot(fixtureRoot); } catch (e) { cleanupErrors.push(e); }
    if (!cleanupErrors.length) {
        try {
            if (!existsPath(sentinelFile) || readFileSync(sentinelFile, "utf8") !== "keep sentinel\n") {
                throw new Error("sentinel missing or changed after fixture cleanup");
            }
        } catch (e) {
            if (!testError) testError = e;
        }
    }
    try { cleanupOwnedRoot(sentinelRoot); } catch (e) { cleanupErrors.push(e); }
    if (testError || cleanupErrors.length) {
        throw new Error(`guard fixture failed: ${testError || cleanupErrors.join("; ")}`);
    }
}

try {
    runGuardRegressions();
    // Scratch consumer manifest: install only the tarball; optional
    // platform binaries stay absent. No extra dependency is declared.
    writeFileSync(
        join(installDir, "package.json"),
        JSON.stringify({
            name: "ktav-packaged-pure-consumer",
            private: true,
            type: "module",
            dependencies: { "@ktav-lang/ktav": `file:${tgzPath}` },
        }, null, 2) + "\n",
    );

    execFileSync("npm", ["install", "--omit=dev", "--omit=optional", "--no-audit", "--no-fund", "--loglevel=error", tgzPath], {
        cwd: installDir,
        stdio: "inherit",
        shell: false,
        env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
    });

    const packageDir = join(installDir, "node_modules", "@ktav-lang", "ktav");
    const packageGuard = makeArtifactGuard(installDir, packageDir);
    // Metadata is read only after package root and every ancestor have
    // passed the no-link, realpath-contained validation.
    const metadata = JSON.parse(readFileSync(join(packageGuard.packageDir, "package.json"), "utf8"));
    if (metadata.dependencies && Object.keys(metadata.dependencies).length > 0) {
        throw new Error("packed package declares third-party runtime dependencies: " + JSON.stringify(metadata.dependencies));
    }
    const optional = Object.keys(metadata.optionalDependencies ?? {}).sort();
    const expectedOptional = [
        "@ktav-lang/js-darwin-arm64",
        "@ktav-lang/js-darwin-x64",
        "@ktav-lang/js-linux-arm64-gnu",
        "@ktav-lang/js-linux-arm64-musl",
        "@ktav-lang/js-linux-x64-gnu",
        "@ktav-lang/js-linux-x64-musl",
        "@ktav-lang/js-win32-arm64-msvc",
        "@ktav-lang/js-win32-x64-msvc",
    ].sort();
    if (JSON.stringify(optional) !== JSON.stringify(expectedOptional)) {
        throw new Error("unexpected optional platform package set: " + JSON.stringify(optional));
    }
    const installedModules = readdirSync(join(installDir, "node_modules"));
    if (installedModules.some(name => name !== "@ktav-lang" && name !== ".package-lock.json")) {
        throw new Error("unexpected top-level consumer runtime package(s): " + JSON.stringify(installedModules));
    }
    const ktavScope = readdirSync(join(installDir, "node_modules", "@ktav-lang"));
    if (ktavScope.some(name => name !== "ktav")) {
        throw new Error("optional binary package unexpectedly installed: " + JSON.stringify(ktavScope));
    }

    // npm pack includes WASM for other public exports. The shared guard
    // validates the whole installed tree before deleting WASM/native files.
    removeArtifacts(packageGuard);

    const runnerSource = `
const PKG = "@ktav-lang/ktav";
try {
    await import(PKG);
    console.log("DEFAULT_IMPORT_OK");
} catch (e) {
    console.log("DEFAULT_IMPORT_FAILED:" + String((e && e.message) || e).slice(0, 200));
}
const pure = await import(PKG + "/pure");
const raw = pure.loadsBytes(new TextEncoder().encode("raw: 7\\n"));
if (raw.raw !== 7) throw new Error("loadsBytes smoke mismatch");
try {
    pure.loadsBytes(new Uint8Array([0xFF]));
    throw new Error("loadsBytes accepted invalid UTF-8");
} catch (e) {
    if (e.error !== "InvalidUtf8" || !e.span || e.span.end <= e.span.start) throw e;
}
const emitted = pure.emitCanonical({ name: "hello", port: 8080 });
if (emitted !== "name: hello\\nport: 8080\\n") throw new Error("emitCanonical smoke mismatch");
const forced = pure.loads(pure.stringifyForceStrings({ port: 8080, enabled: true }));
if (forced.port !== "8080" || forced.enabled !== "true") throw new Error("force-string smoke mismatch");
const doc = pure.loads("port: 8080\\nhost: localhost\\ntags: [\\n    alpha\\n    beta\\n]\\n");
if (doc.port !== 8080 || doc.host !== "localhost" || JSON.stringify(doc.tags) !== JSON.stringify(["alpha", "beta"])) {
    throw new Error("pure loads smoke mismatch: " + JSON.stringify(doc));
}
const text = pure.dumps(doc);
const back = pure.loads(text);
if (back.port !== 8080 || back.host !== "localhost") throw new Error("dumps/loads round trip mismatch");
const strict = pure.loadsStrict("port: 8080\\n");
if (strict.port !== 8080) throw new Error("loadsStrict smoke mismatch");
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

    // NODE_PATH is deliberately absent; preserve every other caller env.
    const childEnv = { ...process.env };
    delete childEnv.NODE_PATH;
    let output;
    try {
        output = execFileSync(process.execPath, ["runner.mjs"], {
            cwd: installDir,
            encoding: "utf8",
            shell: false,
            env: childEnv,
            stdio: ["ignore", "pipe", "pipe"],
        });
    } catch (e) {
        throw new Error(`runner.mjs failed: ${String((e && e.stderr) || e).slice(0, 400)}`);
    }
    console.log(output.trim());

    if (output.includes("DEFAULT_IMPORT_OK")) {
        console.error("✖ import(\"@ktav-lang/ktav\") unexpectedly SUCCEEDED — expected the native entrypoint to fail without a native binary");
        failed++;
    } else {
        const why = output.split("\n").find(l => l.startsWith("DEFAULT_IMPORT_FAILED:")) || "(no marker)";
        if (why === "(no marker)") {
            console.error("✖ default import did not emit a failure marker");
            failed++;
        } else {
            console.log(`✔ import(\".\") failed as expected without a native binary — ${why}`);
        }
    }
    if (output.includes("PURE_OK")) {
        console.log("✔ packed /pure public import and loads/loadsStrict/dumps/canonicalFromSource/format operations passed without optional binaries");
    } else {
        console.error("✖ import(\"@ktav-lang/ktav/pure\") did not complete the operation smoke checks");
        failed++;
    }
} catch (e) {
    console.error(`✖ packaged-pure: ${e.message || e}`);
    failed++;
} finally {
    // Only this runner's mkdtemp root is cleaned. Link entries are unlinked
    // themselves; cleanup never follows them. It is not race-proof against
    // an unrelated process concurrently mutating this private scratch tree.
    try { cleanupOwnedRoot(installDir); } catch (e) {
        console.error(`✖ packaged-pure scratch cleanup failed — ${e.message || e}`);
        failed++;
    }
}

process.exit(failed > 0 ? 1 : 0);
