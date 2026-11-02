import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const [archivesArg, sourceArg, workArg, rid] = process.argv.slice(2);
const archives = resolve(archivesArg);
const source = resolve(sourceArg);
const work = resolve(workArg);
const manifest = JSON.parse(readFileSync(join(archives, "native-npm-release-manifest.json"), "utf8"));
const arch = rid?.split("-")[1];
const os = rid?.split("-")[0];
assert.equal(manifest.source_ref, "562deb3fde092d63a78f359be095e5079929d0d1");
assert.equal(manifest.packages.length, 9);
assert.equal(process.arch, arch);
assert.equal(process.platform, os);
assert.equal(process.env.RUNNER_ARCH?.toLowerCase(), arch === "arm64" ? "arm64" : "x64");
if (os === "linux") {
    const glibc = process.report.getReport().header.glibcVersionRuntime;
    assert.equal(typeof glibc === "string", rid.endsWith("-gnu"));
    if (rid.endsWith("-musl")) {
        assert.ok(existsSync(arch === "arm64" ? "/lib/ld-musl-aarch64.so.1" : "/lib/ld-musl-x86_64.so.1"));
    }
}
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const selected = manifest.packages.find(item => item.rid === rid);
const mainRecord = manifest.packages.find(item => item.package === "@ktav-lang/ktav");
assert.ok(selected && mainRecord);
assert.equal(selected.package, `@ktav-lang/js-${rid}`);
for (const item of [selected, mainRecord]) {
    const bytes = readFileSync(join(archives, item.archive));
    assert.equal(bytes.length, item.bytes);
    assert.equal(sha(bytes), item.sha256);
    assert.equal(item.version, "0.8.1");
}
assert.ok(!existsSync(work), "consumer directory must be new");
mkdirSync(work);
const proof = join(work, "proof");
mkdirSync(proof);
const environment = { ...process.env };
for (const name of ["KTAV_LIB_PATH", "CARGO_TARGET_DIR", "NODE_PATH", "NODE_OPTIONS", "BUN_OPTIONS", "GITHUB_TOKEN", "GH_TOKEN", "NPM_TOKEN", "NODE_AUTH_TOKEN"]) delete environment[name];
const pathKey = Object.keys(environment).find(name => name.toUpperCase() === "PATH");
assert.ok(pathKey, "runtime search path is required");
environment[pathKey] = environment[pathKey].split(process.platform === "win32" ? ";" : ":").filter(value => !/[.]cargo|[.]rustup|llvm|visual studio|(?:^|[/\\])zig(?:[/\\]|$)/i.test(value)).join(process.platform === "win32" ? ";" : ":");
environment.DENO_DIR = join(work, "deno-cache");
const npmCandidates = [join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")];
const npm = npmCandidates.find(existsSync);
assert.ok(npm, "npm CLI beside the actual Node runtime is required");
writeFileSync(join(work, "package.json"), JSON.stringify({ private: true, type: "module", dependencies: { "@ktav-lang/ktav": "0.8.1", [selected.package]: "0.8.1" } }, null, 2) + "\n");
const install = spawnSync(process.execPath, [npm, "install", "--offline", "--ignore-scripts", "--no-save", "--no-package-lock", "--no-audit", "--no-fund", "--omit=dev", "--cache", join(work, "npm-cache"), join(archives, mainRecord.archive), join(archives, selected.archive)], { cwd: work, env: environment, encoding: "utf8" });
writeFileSync(join(proof, "npm-install-stdout.txt"), install.stdout ?? "");
writeFileSync(join(proof, "npm-install-stderr.txt"), install.stderr ?? "");
assert.equal(install.status, 0, install.stderr || String(install.error));
const main = join(work, "node_modules/@ktav-lang/ktav");
const native = join(work, "node_modules", ...selected.package.split("/"));
assert.equal(JSON.parse(readFileSync(join(main, "package.json"), "utf8")).version, "0.8.1");
assert.equal(JSON.parse(readFileSync(join(native, "package.json"), "utf8")).version, "0.8.1");
const installedManifest = JSON.parse(readFileSync(join(native, "native-package-manifest.json"), "utf8"));
assert.equal(installedManifest.tooling_ref, manifest.tooling_ref);
assert.deepEqual(installedManifest.roles, selected.roles);
const verifyInstalled = () => {
    for (const item of installedManifest.files) {
        const bytes = readFileSync(join(native, item.path));
        assert.equal(bytes.length, item.bytes);
        assert.equal(sha(bytes), item.sha256, `installed file changed: ${item.path}`);
    }
};
verifyInstalled();
const snapshot = (root, prefix = "") => {
    const result = [];
    for (const name of readdirSync(join(root, prefix)).sort()) {
        const relative = prefix ? `${prefix}/${name}` : name;
        const path = join(root, relative);
        const stat = lstatSync(path);
        assert.ok(!stat.isSymbolicLink(), "installed package symlink is unexpected");
        if (stat.isDirectory()) result.push(...snapshot(root, relative));
        else {
            assert.ok(stat.isFile());
            const bytes = readFileSync(path);
            result.push({ path: relative, bytes: bytes.length, sha256: sha(bytes) });
        }
    }
    return result;
};
const initial = snapshot(main);
writeFileSync(join(proof, "installed-main-initial-manifest.json"), JSON.stringify(initial, null, 2) + "\n");
assert.ok(!existsSync(join(main, "target")), "no build-tree C ABI override may mask package lookup");
assert.ok(!existsSync(join(main, "dist/native")), "no local NAPI fallback may mask the installed package");
cpSync(join(source, "tests"), join(main, "tests"), { recursive: true, errorOnExist: true, force: false });
mkdirSync(join(main, "spec/versions/0.8"), { recursive: true });
cpSync(join(source, "spec/versions/0.8/tests"), join(main, "spec/versions/0.8/tests"), { recursive: true, errorOnExist: true, force: false });
if (!rid.endsWith("-musl")) {
    cpSync(join(source, "tests"), join(work, "tests"), { recursive: true, errorOnExist: true, force: false });
    mkdirSync(join(work, "spec/versions/0.8"), { recursive: true });
    cpSync(join(source, "spec/versions/0.8/tests"), join(work, "spec/versions/0.8/tests"), { recursive: true, errorOnExist: true, force: false });
    symlinkSync(join(main, "dist"), join(work, "dist"), process.platform === "win32" ? "junction" : "dir");
    assert.equal(realpathSync(join(work, "dist")), realpathSync(join(main, "dist")));
}
const napi = realpathSync(join(native, selected.roles.napi.package_binary));
const cabi = realpathSync(join(native, selected.roles.cabi.package_binary));
const childEnvironment = { ...environment, PACKED_MAIN: main, PACKED_NATIVE: native, PACKED_NAPI: napi, PACKED_CABI: cabi, EXPECTED_ARCH: arch, EXPECTED_RID: rid, PACKED_PROOF: proof };
const nodeScript = `import assert from "node:assert/strict";import {createRequire} from "node:module";import {realpathSync,readFileSync,writeFileSync} from "node:fs";import {createHash} from "node:crypto";import {pathToFileURL} from "node:url";assert.equal(process.arch,process.env.EXPECTED_ARCH);const entry=import.meta.resolve("@ktav-lang/ktav");assert.equal(realpathSync(new URL(entry)),realpathSync(process.env.PACKED_MAIN+"/dist/ts/node.js"));await import("@ktav-lang/ktav");const require=createRequire(import.meta.url);assert.deepEqual(Object.keys(require.cache).filter(p=>p.endsWith(".node")),[realpathSync(process.env.PACKED_NAPI)]);writeFileSync(process.env.PACKED_PROOF+"/node-loaded.json",JSON.stringify({binary_sha256:createHash("sha256").update(readFileSync(process.env.PACKED_NAPI)).digest("hex"),loaded_installed_addon:true}));await import(pathToFileURL(process.env.PACKED_MAIN+"/tests/node/run-node-napi.mjs").href);`;
const ffiScript = runtime => `import assert from "node:assert/strict";import {createRequire} from "node:module";import {realpathSync,readFileSync,writeFileSync,existsSync} from "node:fs";import {createHash} from "node:crypto";import {pathToFileURL} from "node:url";const arch=${runtime === "bun" ? "process.arch" : '({x86_64:"x64",aarch64:"arm64"})[Deno.build.arch]'};assert.equal(arch,process.env.EXPECTED_ARCH);assert.ok(!process.env.KTAV_LIB_PATH);assert.ok(!process.env.CARGO_TARGET_DIR);assert.ok(!existsSync(process.env.PACKED_MAIN+"/target/release"));const entry=import.meta.resolve("@ktav-lang/ktav/ffi");assert.equal(realpathSync(new URL(entry)),realpathSync(process.env.PACKED_MAIN+"/dist/ts/ffi-${runtime}.js"));const require=createRequire(entry);const library=require.resolve("@ktav-lang/js-"+process.env.EXPECTED_RID+"/"+process.env.PACKED_CABI.split(/[\\\\/]/).at(-1));assert.equal(realpathSync(library),realpathSync(process.env.PACKED_CABI));const api=await import("@ktav-lang/ktav/ffi");assert.deepEqual(await api.loads("service: packed\\n"),{service:"packed"});writeFileSync(process.env.PACKED_PROOF+"/${runtime}-loaded.json",JSON.stringify({binary_sha256:createHash("sha256").update(readFileSync(library)).digest("hex"),default_package_locator:true}));await import(pathToFileURL(process.env.PACKED_TEST_ROOT+"/tests/${runtime}/run-${runtime}-ffi.${runtime === "bun" ? "mjs" : "ts"}").href);`;
const scripts = [["node", process.execPath, nodeScript]];
scripts.push(["bun", process.env.BUN_EXECUTABLE || "bun", ffiScript("bun")]);
if (!rid.endsWith("-musl")) scripts.push(["deno", "deno", ffiScript("deno")]);
const results = [];
for (const [runtime, executable, script] of scripts) {
    const path = join(work, `preflight-${runtime}.mjs`);
    writeFileSync(path, script + "\n");
    const args = runtime === "deno" ? ["run", "--no-config", "--no-lock", "--cached-only", "--node-modules-dir=manual", "--allow-ffi", "--allow-env", "--allow-read", `--allow-write=${proof}`, path] : [path];
    const runtimeEnvironment = { ...childEnvironment, PACKED_TEST_ROOT: runtime === "deno" ? work : main };
    const result = spawnSync(executable, args, { cwd: work, env: runtimeEnvironment, encoding: "utf8" });
    writeFileSync(join(proof, `${runtime}-stdout.txt`), result.stdout ?? "");
    writeFileSync(join(proof, `${runtime}-stderr.txt`), result.stderr ?? "");
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    assert.equal(result.status, 0, `${runtime}: ${result.stderr || result.error}`);
    const label = runtime === "node" ? "node-napi" : `${runtime}-ffi`;
    const summary = new RegExp(`\\[${label}\\] (\\d+)/(\\d+) passed`).exec(result.stdout);
    assert.ok(summary && summary[1] === summary[2] && Number(summary[1]) > 0, `${runtime}: complete corpus summary required`);
    assert.ok(!result.stdout.toLowerCase().includes("skipping"));
    const loaded = JSON.parse(readFileSync(join(proof, `${runtime}-loaded.json`), "utf8"));
    assert.equal(loaded.binary_sha256, selected.roles[runtime === "node" ? "napi" : "cabi"].binary_sha256);
    results.push({ runtime, corpus_passed: Number(summary[1]), binary_sha256: loaded.binary_sha256, version: execFileSync(executable, ["--version"], { env: environment, encoding: "utf8" }).trim() });
}
verifyInstalled();
for (const item of initial) {
    const bytes = readFileSync(join(main, item.path));
    assert.equal(bytes.length, item.bytes);
    assert.equal(sha(bytes), item.sha256, `installed main file changed: ${item.path}`);
}
writeFileSync(join(proof, "consumer-verification.json"), JSON.stringify({ rid, host_arch: process.arch, runner_arch: process.env.RUNNER_ARCH, node_version: process.version, source_ref: manifest.source_ref, tooling_ref: manifest.tooling_ref, main_archive_sha256: mainRecord.sha256, platform_archive_sha256: selected.sha256, lifecycle_scripts_disabled: true, offline_local_tarballs: true, native_execution: true, default_package_locators: true, build_tree_override: false, results, scope: "Actual matching-CPU installed-tarball consumers. No registry publication or Deno-musl execution claim." }, null, 2) + "\n");
