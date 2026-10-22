// Runtime-agnostic empty-source C ABI invariant suite. Rust
// `slice::from_raw_parts` (rust/src/cabi/declare.rs) requires a
// non-null, aligned source pointer EVEN WHEN the length is 0, so an
// empty Ktav document is a valid empty Object and must round-trip
// without tripping a debug-build assertion. Also pins the loadsBytes
// ownership rule: the binding snapshots the caller's bytes
// SYNCHRONOUSLY, so later mutation / transfer of the caller's buffer
// (and concurrent writes to a SharedArrayBuffer view) cannot affect
// the in-flight parse.
//
// NO skips for a missing library: a load/resolution failure is a
// failure. Debug-CI runners point KTAV_LIB_PATH at the debug artifact
// (debug builds assert the non-null slice); release builds hide the
// violation, so this suite is only fully meaningful against debug.

function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function expectEmptyObject(name, v) {
    if (v === null || typeof v !== "object") {
        throw new Error(`expected empty Object, got ${v === null ? "null" : typeof v}`);
    }
    if (Array.isArray(v)) throw new Error("expected Object, got Array");
    if (Object.keys(v).length !== 0) {
        throw new Error(`expected 0 keys, got ${JSON.stringify(Object.keys(v))}`);
    }
}

/**
 * @param {object} ops
 * @param {(s: string) => Promise<unknown>} ops.loads
 * @param {(s: string) => Promise<unknown>} ops.loadsStrict
 * @param {(b: Uint8Array) => Promise<unknown>} ops.loadsBytes
 * @param {(s: string) => Promise<string>} ops.format
 * @param {(s: string) => Promise<string>} ops.canonicalFromSource
 * @param {string} label — summary prefix, e.g. "bun-empty-abi"
 */
export async function runEmptyAbi(ops, label) {
    let passed = 0, failed = 0;
    const check = async (name, fn) => {
        try {
            await fn();
            console.log("✔ " + name);
            passed++;
        } catch (e) {
            console.log("✖ " + name + " — " + (e?.message || e));
            failed++;
        }
    };

    // 1./2. Empty TEXT source is a valid empty Object (both strictness
    // levels; the pointer passed to Rust must be non-null with length 0).
    await check("loads empty source -> empty Object", async () => {
        expectEmptyObject("loads", await ops.loads(""));
    });
    await check("loadsStrict empty source -> empty Object", async () => {
        expectEmptyObject("loadsStrict", await ops.loadsStrict(""));
    });

    // 3./4. Empty source renders to ZERO bytes on both writers.
    await check("format empty source -> empty string", async () => {
        const out = await ops.format("");
        if (out !== "") throw new Error("expected empty string, got " + JSON.stringify(out));
    });
    await check("canonicalFromSource empty source -> empty string", async () => {
        const out = await ops.canonicalFromSource("");
        if (out !== "") throw new Error("expected empty string, got " + JSON.stringify(out));
    });

    // 5. Raw-byte path with a zero-length input.
    await check("loadsBytes zero-length -> empty Object", async () => {
        expectEmptyObject("loadsBytes", await ops.loadsBytes(new Uint8Array(0)));
    });

    // 6. Caller mutates the buffer AFTER the Promise is pending — the
    // parse must see the synchronous snapshot, not the borrowed buffer.
    await check("loadsBytes: caller mutation after pending Promise is invisible", async () => {
        const u8 = new TextEncoder().encode("k: 1\n");
        const p = ops.loadsBytes(u8);
        u8.fill(0);
        const v = await p;
        if (!same(v, { k: 1 })) throw new Error("got " + JSON.stringify(v));
    });

    // 7. Transfer must really detach the caller's buffer in this CI runtime.
    await check("loadsBytes: ArrayBuffer transfer after pending Promise is invisible", async () => {
        const u8 = new TextEncoder().encode("k: 1\n");
        const p = ops.loadsBytes(u8);
        structuredClone(u8.buffer, { transfer: [u8.buffer] });
        if (u8.byteLength !== 0) throw new Error("transfer fixture did not detach the input");
        const v = await p;
        if (!same(v, { k: 1 })) throw new Error("got " + JSON.stringify(v) + " (post-transfer)");
    });

    // SharedArrayBuffer обязателен в поддерживаемых Bun/Deno CI.
    if (typeof SharedArrayBuffer !== "undefined") {
        await check("loadsBytes: SharedArrayBuffer view snapshot, immediate overwrite invisible", async () => {
            const source = new TextEncoder().encode("k: 1\n");
            const sab = new SharedArrayBuffer(source.byteLength);
            new Uint8Array(sab).set(source);
            const view = new Uint8Array(sab);
            const p = ops.loadsBytes(view);
            view.fill(0);
            const v = await p;
            if (!same(v, { k: 1 })) throw new Error("got " + JSON.stringify(v));
        });
    } else {
        await check("SharedArrayBuffer required", async () => {
            throw new Error("SharedArrayBuffer unavailable in this CI runtime");
        });
    }

    // 9. Non-empty sanity control over the raw path.
    await check("loadsBytes non-empty control", async () => {
        const v = await ops.loadsBytes(new TextEncoder().encode("k: 1\n"));
        if (!same(v, { k: 1 })) throw new Error("got " + JSON.stringify(v));
    });

    const total = passed + failed;
    console.log(`\n[${label}] ${passed}/${total} passed`);
    return { passed, failed, total };
}
