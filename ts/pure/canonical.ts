// Canonical entry points — lib.rs `emit_canonical` /
// `canonical_from_source` (text→text keeps the parse's canonical
// decimal scalar spellings byte-exactly; the object-based entry cannot,
// because a JS number cannot carry the Ktav Integer/Float distinction —
// `1.0` arrives as `1`, `1e9` as `1000000000`).

import { parseValue } from "./parse.js";
import { jsToV } from "./ktavvalue.js";
import { emitCanonicalV } from "./writer.js";
import type { V } from "./values.js";

/** `ktav::emit_canonical` over the internal value tree. */
export function emitCanonicalTree(value: V): string {
    return emitCanonicalV(value);
}

/** Emit the canonical text of a JavaScript value. */
export function emitCanonicalJs(obj: unknown): string {
    return emitCanonicalV(jsToV(obj));
}

/** Parse Ktav source and emit the canonical text of its parse —
 *  scalar spellings survive byte-exactly (no JS value in between). */
export function canonicalFromSourceText(text: string): string {
    const bytes = new TextEncoder().encode(text);
    return emitCanonicalV(parseValue(bytes));
}
