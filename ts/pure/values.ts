// The parser's internal value model and its conversion to JavaScript
// values, matching `rust/src/document/value/value.rs` and the N-API
// read path in `js/crates/napi/src/lib.rs` (`value_to_js` /
// `integer_to_js`).

import type { KtavValue } from "../internal/api.js";

/**
 * Internal value. Integers and Floats keep their canonical DECIMAL
 * STRING forms (as the Rust `Value::Integer(String)` /
 * `Value::Float(String)` do) so the writer task can emit them
 * byte-exactly; conversion to JS numbers happens only in `toJs`.
 */
/**
 * Compound variants carry distinct interfaces so narrowing on the `t`
 * discriminant yields exactly `Map<string, V>` / `V[]` — no casts.
 */
export interface VObject {
    t: "object";
    v: Map<string, V>;
}
export interface VArray {
    t: "array";
    v: V[];
}
export type VCompound = VObject | VArray;

export type V =
    | { t: "null" }
    | { t: "bool"; v: boolean }
    | { t: "int"; v: string }
    | { t: "float"; v: string }
    | { t: "string"; v: string }
    | VCompound;

/** Kind labels used verbatim in `KeyPathConflict` diagnostics
 *  (`build/insert.rs InsertShape for Value`). */
export function kindLabel(v: V): string {
    switch (v.t) {
        case "null":
            return "null";
        case "bool":
            return "bool";
        case "int":
            return "integer";
        case "float":
            return "float";
        case "string":
            return "string";
        case "array":
            return "array";
        case "object":
            return "object";
    }
}

export function isObjectV(v: V): boolean {
    return v.t === "object";
}

export function newObjectV(): VObject {
    return { t: "object", v: new Map() };
}

/** Empty-string String scalar (`Value::String("")`). */
export function emptyStringV(): V {
    return { t: "string", v: "" };
}

/**
 * Integer decimal string → JS value, `integer_to_js` exactly:
 * - fits in i64 AND within ±(1 << 53) inclusive → `number`;
 * - anything else the parser can produce (i64-bounded) → `BigInt`.
 * (The i128 / `BigInt(str)` branches of the Rust helper are defensive
 * — the owned parser never stores wider integers — and BigInt handles
 * them identically should the writer task widen the domain.)
 */
function integerToJs(dec: string): number | bigint {
    const v = BigInt(dec);
    const lim = 1n << 53n;
    if (v >= -lim && v <= lim) return Number(v);
    return v;
}

/**
 * Convert to the public `KtavValue` shape. Objects are plain objects
 * (with `Object.prototype`, matching napi `Object::new`) whose own
 * properties are DEFINED in insertion order — `defineProperty` (like
 * napi `set_property`) never triggers the `__proto__` setter, so a
 * key literally named `__proto__` stays an own data property.
 *
 * The traversal is an EXPLICIT STACK (no recursion): a deeply nested
 * block tree has no depth limit, so recursive conversion could
 * overflow the JS call stack. Children tasks are pushed in REVERSE
 * order, so each `defineProperty` runs in document order and the own-
 * property insertion order matches the recursive version byte-for-
 * byte.
 */
export function toJs(v: V): KtavValue {
    type Slot = { value: KtavValue };
    type Task =
        | { t: "emit"; v: V; out: KtavValue[] | Record<string, KtavValue>; key: number | string }
        | { t: "emitRoot"; v: V; slot: Slot };
    const rootSlot: Slot = { value: null };
    const stack: Task[] = [{ t: "emitRoot", v, slot: rootSlot }];
    while (stack.length > 0) {
        const task = stack.pop()!;
        const cur = task.v;
        let converted: KtavValue;
        switch (cur.t) {
            case "null":
                converted = null;
                break;
            case "bool":
                converted = cur.v;
                break;
            case "int":
                converted = integerToJs(cur.v);
                break;
            case "float":
                converted = Number(cur.v);
                break;
            case "string":
                converted = cur.v;
                break;
            case "array": {
                const arr: KtavValue[] = new Array(cur.v.length);
                for (let i = cur.v.length - 1; i >= 0; i--) {
                    stack.push({ t: "emit", v: cur.v[i]!, out: arr, key: i });
                }
                converted = arr;
                break;
            }
            case "object": {
                const out: Record<string, KtavValue> = {};
                for (const [k] of cur.v) {
                    // Pre-define every key to FIX the own-property
                    // insertion order before the (reversed) children
                    // run; the emit tasks overwrite the values.
                    Object.defineProperty(out, k, {
                        value: null,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                }
                const entries = Array.from(cur.v.entries());
                for (let i = entries.length - 1; i >= 0; i--) {
                    stack.push({ t: "emit", v: entries[i]![1], out, key: entries[i]![0] });
                }
                converted = out;
                break;
            }
        }
        if (task.t === "emitRoot") {
            task.slot.value = converted;
        } else if (Array.isArray(task.out)) {
            task.out[task.key as number] = converted;
        } else {
            // Plain data-property write on a pre-defined key: never the
            // `__proto__` setter, own-property order preserved.
            task.out[task.key as string] = converted;
        }
    }
    return rootSlot.value;
}
