// Locates the C ABI shared library on disk. Resolution order matches
// the Java / Go / .NET bindings:
//
//   1. `KTAV_LIB_PATH` env var, if set and points at an existing file.
//   2. Bundled in the matching platform-subpackage (e.g.
//      `@ktav-lang/js-linux-x64-gnu/ktav_cabi.so`). Resolved via the
//      runtime's package resolver — works for Bun and Deno (with
//      npm: specifier or node_modules layout).
//
// Browser / "edge" runtimes never reach this code — the FFI subexport
// throws there at import time via `ffi-error.ts`.

interface RuntimeShim {
    // Reads `process.env.KTAV_LIB_PATH` on Bun, `Deno.env.get` on Deno.
    env(name: string): string | undefined;

    // Async because some runtimes need `import.meta.resolve` which is
    // a Promise (older Node) — we keep the surface uniform.
    resolveSubpackage(subpkg: string, file: string): Promise<string>;

    // True when the file at `path` exists and is readable.
    exists(path: string): Promise<boolean>;
}

const SUBPKG_PREFIX = "@ktav-lang/js";

// Mapping host OS / arch / libc into the napi-rs RID convention used
// by the optionalDependencies in package.json. The libc dimension is
// only relevant on Linux — we try `-gnu` first (majority install) and
// fall through to `-musl`.
function ridCandidates(plat: string, archName: string): string[] {
    if (plat === "linux") {
        return [`linux-${archName}-gnu`, `linux-${archName}-musl`];
    }
    if (plat === "darwin") {
        return [`darwin-${archName}`];
    }
    if (plat === "win32" || plat === "windows") {
        return [`win32-${archName}-msvc`];
    }
    throw new Error(`Unsupported FFI platform: ${plat}`);
}

function libFileName(plat: string): string {
    if (plat === "linux") return "libktav_cabi.so";
    if (plat === "darwin") return "libktav_cabi.dylib";
    if (plat === "win32" || plat === "windows") return "ktav_cabi.dll";
    throw new Error(`Unsupported FFI platform: ${plat}`);
}

export interface LoaderOptions {
    plat: string;        // "linux" | "darwin" | "win32"
    archName: string;    // "x64" | "arm64"
    runtime: RuntimeShim;
}

export async function resolveLibPath(opts: LoaderOptions): Promise<string> {
    const override = opts.runtime.env("KTAV_LIB_PATH");
    if (override && override.length > 0) {
        if (!(await opts.runtime.exists(override))) {
            throw new Error(`KTAV_LIB_PATH="${override}" — file not found`);
        }
        return override;
    }

    const file = libFileName(opts.plat);
    const errors: string[] = [];
    for (const rid of ridCandidates(opts.plat, opts.archName)) {
        const subpkg = `${SUBPKG_PREFIX}-${rid}`;
        try {
            const path = await opts.runtime.resolveSubpackage(subpkg, file);
            if (await opts.runtime.exists(path)) {
                return path;
            }
            errors.push(`${subpkg}/${file} resolved to ${path} but file is missing`);
        } catch (e) {
            errors.push(`${subpkg}: ${(e as Error).message}`);
        }
    }
    throw new Error(
        "Could not locate ktav_cabi for " + opts.plat + "-" + opts.archName + ":\n  " +
            errors.join("\n  ") +
            "\nInstall the matching @ktav-lang/js-* subpackage, or set KTAV_LIB_PATH.",
    );
}
