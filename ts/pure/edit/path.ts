// Textual edit path parsing — edit.rs `parse_path` verbatim: '.' is
// the separator, `\.` a literal dot, `\\` a literal backslash; any
// other escape, a trailing lone backslash, or an empty segment is
// InvalidPath with the UTF-8 BYTE offset inside the path argument.
// Segments without escapes stay decoded slices of the input.

import { decodeRange } from "../bytes.js";
import { utf8, type EditError } from "./shared.js";

export function parsePath(
    path: string,
): { ok: true; segments: string[] } | { ok: false; err: EditError } {
    if (path.length === 0) return { ok: false, err: { k: "InvalidPath", offset: 0 } };
    const bytes = utf8(path);
    const segments: string[] = [];
    let segStart = 0;
    let cur: string | null = null;
    let i = 0;
    while (i < bytes.length) {
        const b = bytes[i]!;
        if (b === 0x2e) {
            if (segStart === i && cur === null) {
                return { ok: false, err: { k: "InvalidPath", offset: i } };
            }
            segments.push(cur ?? decodeRange(bytes, segStart, i));
            cur = null;
            segStart = i + 1;
            i += 1;
        } else if (b === 0x5c) {
            const next = bytes[i + 1];
            if (next === 0x2e || next === 0x5c) {
                cur ??= decodeRange(bytes, segStart, i);
                cur += next === 0x2e ? "." : "\\";
                i += 2;
            } else {
                return { ok: false, err: { k: "InvalidPath", offset: i } };
            }
        } else {
            let len = 1;
            if (b >= 0xc0 && b <= 0xdf) len = 2;
            else if (b >= 0xe0 && b <= 0xef) len = 3;
            else if (b >= 0xf0 && b <= 0xf7) len = 4;
            if (cur !== null) cur += decodeRange(bytes, i, Math.min(i + len, bytes.length));
            i += len;
        }
    }
    if (segStart === bytes.length && cur === null) {
        return { ok: false, err: { k: "InvalidPath", offset: bytes.length } };
    }
    segments.push(cur ?? decodeRange(bytes, segStart, bytes.length));
    return { ok: true, segments };
}
