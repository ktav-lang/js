// JSON wire codec shared by the FFI subexports (Deno, Bun). The
// cabi side speaks JSON with `{"$i":"<digits>"}` / `{"$f":"<text>"}`
// tagged wrappers around typed integers / floats — the same wire
// format used by the Java / Go / .NET bindings.
//
// On the read path: cabi → JSON bytes → JS value. Tagged wrappers
// become `bigint` (when the digits exceed `Number.MAX_SAFE_INTEGER`)
// or `number`; bare JSON values pass through untouched.
//
// On the write path: JS value → JSON bytes → cabi. `bigint` and
// integer `number` get the `$i` envelope; finite `number` floats get
// `$f` with a forced decimal point so the renderer's grammar check
// is satisfied.

const TEXT_DECODER = new TextDecoder();
const TEXT_ENCODER = new TextEncoder();

export function decode(jsonBytes: Uint8Array): unknown {
    const text = TEXT_DECODER.decode(jsonBytes);
    return revive(JSON.parse(text));
}

export function encode(value: unknown): Uint8Array {
    return TEXT_ENCODER.encode(JSON.stringify(wrap(value)));
}

function revive(v: unknown): unknown {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) v[i] = revive(v[i]);
        return v;
    }
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1) {
        if (keys[0] === "$i" && typeof obj.$i === "string") {
            const s = obj.$i;
            // Number first; fall back to BigInt on overflow or
            // round-trip mismatch (e.g. "9007199254740993").
            const n = Number(s);
            if (Number.isSafeInteger(n) && String(n) === s) return n;
            return BigInt(s);
        }
        if (keys[0] === "$f" && typeof obj.$f === "string") {
            return Number(obj.$f);
        }
    }
    for (const k of keys) obj[k] = revive(obj[k]);
    return obj;
}

function wrap(v: unknown): unknown {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number") {
        if (!Number.isFinite(v)) {
            throw new Error("Ktav floats must be finite (got " + v + ")");
        }
        if (Number.isInteger(v)) {
            return { $i: String(v) };
        }
        let s = String(v);
        if (s.indexOf(".") < 0 && s.indexOf("e") < 0 && s.indexOf("E") < 0) {
            s += ".0";
        }
        return { $f: s };
    }
    if (typeof v === "bigint") {
        return { $i: v.toString() };
    }
    if (Array.isArray(v)) {
        return v.map(wrap);
    }
    if (typeof v === "object") {
        const src = v as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(src)) out[k] = wrap(src[k]);
        return out;
    }
    throw new Error("unsupported value type for Ktav.dumps: " + typeof v);
}
