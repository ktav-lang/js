import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const MAGIC = Buffer.from("KTAV-NOTICES-GZIP-v1\0");
const SECTION = "ktav.third-party-notices.v1";
const MAX_WASM = 64 * 1024 * 1024;
const MAX_GZIP = 4 * 1024 * 1024;

function readLength(bytes, cursor) {
    let value = 0;
    for (let index = 0; index < 5; index++) {
        if (cursor.offset >= bytes.length) throw new Error("truncated WASM length");
        const byte = bytes[cursor.offset++];
        if (index === 4 && byte > 15) throw new Error("WASM length overflow");
        value += (byte & 127) * 2 ** (index * 7);
        if ((byte & 128) === 0) return value;
    }
    throw new Error("invalid WASM length");
}

function lengthBytes(value) {
    const result = [];
    do {
        const byte = value % 128;
        value = Math.floor(value / 128);
        result.push(byte | (value === 0 ? 0 : 128));
    } while (value !== 0);
    return Buffer.from(result);
}

function sections(bytes) {
    if (bytes.length > MAX_WASM || !WebAssembly.validate(bytes)) throw new Error("invalid bounded WASM module");
    const found = [];
    const cursor = { offset: 8 };
    while (cursor.offset < bytes.length) {
        const kind = bytes[cursor.offset++];
        const size = readLength(bytes, cursor);
        const end = cursor.offset + size;
        if (end > bytes.length) throw new Error("truncated WASM section");
        if (kind === 0) {
            const nameLength = readLength(bytes, cursor);
            const nameEnd = cursor.offset + nameLength;
            if (nameEnd > end) throw new Error("truncated WASM custom name");
            if (bytes.subarray(cursor.offset, nameEnd).equals(Buffer.from(SECTION))) found.push(bytes.subarray(nameEnd, end));
        }
        cursor.offset = end;
    }
    return found;
}

function resource(payload) {
    if (payload.length > MAX_GZIP || payload.length < 2 || payload[0] !== 31 || payload[1] !== 139) throw new Error("invalid bounded notice gzip");
    const decoded = gunzipSync(payload, { maxOutputLength: MAX_WASM });
    const notice = JSON.parse(decoded.toString("utf8"));
    if (notice.schema_version !== 1 || !Array.isArray(notice.packages) || !notice.packages.length) throw new Error("incomplete notice JSON");
    const size = Buffer.alloc(8);
    size.writeBigUInt64LE(BigInt(payload.length));
    return Buffer.concat([MAGIC, size, payload]);
}

export function addNotice(bytes, payload) {
    bytes = Buffer.from(bytes);
    if (sections(bytes).length !== 0) throw new Error("WASM notice section already exists");
    const name = Buffer.from(SECTION);
    const body = Buffer.concat([lengthBytes(name.length), name, resource(payload)]);
    const result = Buffer.concat([bytes, Buffer.from([0]), lengthBytes(body.length), body]);
    verifyNotice(result, payload);
    return result;
}

export function verifyNotice(bytes, payload) {
    const found = sections(Buffer.from(bytes));
    if (found.length !== 1 || !found[0].equals(resource(payload))) throw new Error("WASM notice section differs from evidence");
}

export function addNoticeFile(path, payloadPath) {
    const result = addNotice(readFileSync(path), readFileSync(payloadPath));
    writeFileSync(path, result);
}
