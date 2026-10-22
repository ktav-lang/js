// JavaScript value → internal value tree — ported from the N-API write
// path `js_to_value` (js/crates/napi/src/lib.rs) so the pure backend
// encodes `dumps` / `stringifyForceStrings` / `emitCanonical` inputs
// byte-identically to the native binding.

import { ryuFormat } from "./numbers.js";
import type { V, VCompound } from "./values.js";
import { KtavError } from "../internal/api.js";

/** Rust `Error::Message` envelope: `body` and `message` both carry the
 *  text; every location field is null (envelope.rs `from_error`). */
export function messageError(text: string): never {
    throw new KtavError(
        {
            error: "Message",
            reason: null,
            line: null,
            line_text: null,
            span: null,
            path: null,
            body: text,
            canonical: null,
            spec_section: null,
            message: text,
        },
        text,
    );
}

const I64_MIN = -9223372036854775808n;
const I64_MAX = 9223372036854775807n;

/**
 * Map a native JavaScript value to the internal value tree —
 * `js_to_value` exactly. Order matters: BigInt before generic object
 * branches; `Number.isInteger(x)` decides Integer vs Float.
 *
 * The traversal is an EXPLICIT STACK (enter/leave tasks, no
 * recursion), so a deeply nested input cannot overflow the JS call
 * stack, and cycles among arrays/objects on the current path are
 * REJECTED with a `Message` error instead of looping forever.
 */
export function jsToV(obj: unknown): V {
    interface Slot {
        v: V;
    }
    interface Rec {
        src: object;
        container: VCompound;
        keys: string[] | null; // null → array (index order)
        slots: Slot[];
    }
    type Task = { t: "enter"; src: unknown; slot: Slot } | { t: "leave"; rec: Rec };
    const rootSlot: Slot = { v: { t: "null" } };
    // Ancestors on the CURRENT path only — the same reference may
    // appear as a sibling (DAG) without triggering a cycle.
    const path = new Set<object>();
    const stack: Task[] = [{ t: "enter", src: obj, slot: rootSlot }];
    while (stack.length > 0) {
        const task = stack.pop()!;
        if (task.t === "leave") {
            path.delete(task.rec.src);
            if (task.rec.container.t === "array") {
                task.rec.container.v = task.rec.slots.map((s) => s.v);
            } else {
                const map = task.rec.container.v;
                task.rec.keys!.forEach((k, i) => map.set(k, task.rec.slots[i]!.v));
            }
            continue;
        }
        const src = task.src;
        if (src === null || src === undefined) {
            task.slot.v = { t: "null" };
            continue;
        }
        switch (typeof src) {
            case "boolean":
                task.slot.v = { t: "bool", v: src };
                continue;
            case "bigint":
                task.slot.v = { t: "int", v: src.toString(10) };
                continue;
            case "number":
                task.slot.v = numberToV(src);
                continue;
            case "string":
                task.slot.v = { t: "string", v: src };
                continue;
            case "object":
                break;
            default:
                // ValueType debug spellings (napi `Unsupported ... {other:?}`).
                messageError(
                    `Unsupported JavaScript value type for Ktav: ${typeof src === "function" ? "Function" : "Symbol"}`,
                );
        }
        if (Array.isArray(src)) {
            // Divergence note: the native napi path recurses through
            // serde and simply aborts/overflows the stack on a cyclic
            // value — no error envelope is defined for it. The pure
            // backend rejects the cycle deterministically instead of
            // hanging or crashing.
            if (path.has(src)) {
                messageError("cyclic value cannot be represented in Ktav");
            }
            path.add(src);
            const slots: Slot[] = new Array(src.length);
            for (let i = 0; i < src.length; i++) {
                if (!(i in src)) messageError("Array element missing");
                slots[i] = { v: { t: "null" } };
            }
            const container: VCompound = { t: "array", v: [] };
            task.slot.v = container;
            stack.push({ t: "leave", rec: { src, container, keys: null, slots } });
            for (let i = src.length - 1; i >= 0; i--) {
                stack.push({ t: "enter", src: src[i], slot: slots[i]! });
            }
            continue;
        }
        const keys = Object.keys(src as Record<string, unknown>);
        if (path.has(src)) {
            messageError("cyclic value cannot be represented in Ktav");
        }
        path.add(src);
        const slots: Slot[] = keys.map((): Slot => ({ v: { t: "null" } }));
        const container: VCompound = { t: "object", v: new Map<string, V>() };
        task.slot.v = container;
        stack.push({ t: "leave", rec: { src, container, keys, slots } });
        for (let i = keys.length - 1; i >= 0; i--) {
            stack.push({
                t: "enter",
                src: (src as Record<string, unknown>)[keys[i]!],
                slot: slots[i]!,
            });
        }
    }
    return rootSlot.v;
}

function numberToV(n: number): V {
    if (!Number.isFinite(n)) {
        messageError("NaN / Infinity is not representable in Ktav");
    }
    if (
        Number.isInteger(n) &&
        BigInt(n) >= I64_MIN &&
        BigInt(n) <= I64_MAX
    ) {
        // itoa of `n as i64` — String() of an in-range integer is exact.
        return { t: "int", v: String(n) };
    }
    return { t: "float", v: formatFloat(n) };
}

/** ryu pretty format with a mandatory `.0` in the mantissa (napi
 *  `format_float`): Ktav's Float grammar requires `N.N` at a minimum,
 *  but ryu emits `1e100` without one. Inserts `.0` before the `e`. */
export function formatFloat(v: number): string {
    const s = ryuFormat(v);
    if (s.includes(".")) return s;
    const ePos = s.indexOf("e");
    if (ePos !== -1) return s.slice(0, ePos) + ".0" + s.slice(ePos);
    return s + ".0";
}

/** The textual form a leaf takes under force-strings (render.rs
 *  `forced_string_text`); null for compounds. */
export function forcedStringText(v: V): string | null {
    switch (v.t) {
        case "null":
            return "null";
        case "bool":
            return v.v ? "true" : "false";
        case "int":
        case "float":
        case "string":
            return v.v;
        default:
            return null;
    }
}
