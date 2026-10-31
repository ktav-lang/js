"""Проверить actual Mach-O и reviewed Cargo/system SDK map boundary."""

import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import sys

TARGETS = {'x86_64-apple-darwin': 0x01000007, 'aarch64-apple-darwin': 0x0100000C}
SYSTEM_STUBS = {
    'libiconv.tbd', 'libSystem.tbd', 'libc.tbd', 'libm.tbd',
    'system/libcommonCrypto.tbd', 'system/libdispatch.tbd',
    'system/libdyld.tbd', 'system/libsystem_c.tbd',
    'system/libsystem_kernel.tbd', 'system/libsystem_m.tbd',
    'system/libsystem_malloc.tbd', 'system/libsystem_platform.tbd',
    'system/libsystem_pthread.tbd', 'system/libunwind.tbd',
}


def read(path, bound):
    if path.is_symlink() or not path.is_file():
        raise ValueError('expected regular macOS evidence input')
    with path.open('rb') as source:
        data = source.read(bound + 1)
    if len(data) > bound:
        raise ValueError('macOS evidence exceeds bound')
    return data


def object_inputs(data, cargo_root, rustlib_root, sdk_root):
    if data.count(b'# Object files:') != 1:
        raise ValueError('missing or duplicate Darwin map object section')
    section = data.split(b'# Object files:', 1)[1].split(b'# Sections:', 1)
    if len(section) != 2:
        raise ValueError('missing Darwin map sections boundary')
    result = []
    ids = set()
    for line in section[0].splitlines():
        if not line.strip():
            continue
        match = re.fullmatch(rb'\[\s*(\d+)\]\s+(.+)', line)
        if not match or int(match[1]) in ids:
            raise ValueError('invalid Darwin map object row')
        ids.add(int(match[1]))
        name = match[2].decode('utf-8')
        if name == 'linker synthesized':
            result.append({'kind': 'linker-synthesized'})
            continue
        if name.endswith('.tbd'):
            path = Path(name)
            boundary = (sdk_root / 'usr/lib').resolve()
            public_path = path.parent.resolve() / path.name
            resolved = path.resolve()
            if not public_path.is_relative_to(boundary) or not resolved.is_relative_to(boundary):
                raise ValueError('Darwin SDK stub escapes selected SDK')
            relative = public_path.relative_to(boundary).as_posix()
            if relative not in SYSTEM_STUBS:
                raise ValueError('unreviewed Darwin SDK stub: ' + relative)
            result.append({'kind': 'system-stub', 'path': relative, 'resolved_path': resolved.relative_to(boundary).as_posix()})
            continue
        archive = name.split('.rlib(', 1)[0] + '.rlib' if '.rlib(' in name else None
        if archive:
            if not name.endswith('.rcgu.o)'):
                raise ValueError('non-Rust native member in Darwin rlib input')
            path = Path(archive).resolve()
        else:
            if not name.endswith('.rcgu.o'):
                raise ValueError('external static object in Darwin native library')
            path = Path(name).resolve()
        boundary = next((item for item in [cargo_root.resolve(), rustlib_root.resolve()] if path.is_relative_to(item)), None)
        if boundary is None:
            raise ValueError('Darwin Rust object outside reviewed Cargo/sysroot roots')
        result.append({'kind': 'rust-object', 'path': path.relative_to(boundary).as_posix(), 'origin': 'cargo' if boundary == cargo_root.resolve() else 'rust-sysroot'})
    if ids != set(range(len(result))) or sum(item['kind'] == 'linker-synthesized' for item in result) != 1 or not any(item['kind'] == 'rust-object' for item in result):
        raise ValueError('incomplete Darwin map input inventory')
    return result


def macho(data):
    if len(data) < 32 or len(data) > 128 * 1024 * 1024 or data[:4] != b'\xcf\xfa\xed\xfe':
        raise ValueError('expected bounded thin Mach-O64')
    cpu, _, kind, count, size = struct.unpack_from('<5I', data, 4)
    if cpu not in TARGETS.values() or kind not in {6, 8} or count > 65535 or size > 4 * 1024 * 1024 or 32 + size > len(data):
        raise ValueError('unreviewed Mach-O library header')
    position = 32
    libraries = []
    identities = []
    symbols = None
    for _ in range(count):
        if position + 8 > 32 + size:
            raise ValueError('truncated Mach-O commands')
        command, length = struct.unpack_from('<II', data, position)
        if length < 8 or length % 8 or position + length > 32 + size:
            raise ValueError('invalid Mach-O command bounds')
        command &= 0x7fffffff
        if command in {0xC, 0xD, 0x18, 0x1F, 0x20, 0x23}:
            if length < 24:
                raise ValueError('truncated Mach-O dylib command')
            offset = struct.unpack_from('<I', data, position + 8)[0]
            if not 24 <= offset < length:
                raise ValueError('invalid Mach-O dylib name offset')
            raw = data[position + offset:position + length]
            if b'\0' not in raw or len(raw) > 4096:
                raise ValueError('invalid Mach-O dylib name')
            name = raw.split(b'\0', 1)[0].decode('utf-8')
            (identities if command == 0xD else libraries).append(name)
        elif command == 2:
            if length < 24 or symbols is not None:
                raise ValueError('invalid Mach-O symbol command')
            symbols = struct.unpack_from('<4I', data, position + 8)
        position += length
    if position != 32 + size or symbols is None or len(identities) != (1 if kind == 6 else 0):
        raise ValueError('incomplete Mach-O load/symbol metadata')
    offset, count, strings, string_size = symbols
    if count > 1024 * 1024 or offset + count * 16 > len(data) or strings + string_size > len(data) or string_size > 64 * 1024 * 1024:
        raise ValueError('invalid Mach-O symbol bounds')
    imported = []
    for index in range(count):
        name_offset, symbol_type, section, _, _ = struct.unpack_from('<IBBHQ', data, offset + index * 16)
        if symbol_type & 0xE0 or symbol_type & 0xE or not symbol_type & 1 or section != 0:
            continue
        if name_offset >= string_size:
            raise ValueError('Mach-O symbol escapes strings')
        end = data.find(b'\0', strings + name_offset, strings + string_size)
        if end < 0:
            raise ValueError('unterminated Mach-O symbol')
        name = data[strings + name_offset:end]
        if b'iconv' in name.lower() or b'charset' in name.lower():
            imported.append(name.decode('utf-8'))
    return {'cpu': cpu, 'mach_o_filetype': kind, 'install_name': identities[0] if identities else None, 'dynamic_libraries': libraries, 'iconv_charset_undefined_symbols': imported, 'symbol_table_present': True}


def collect(binary, original, link_map, evidence, target, role):
    if target not in TARGETS or role not in {'napi', 'cabi'}:
        raise ValueError('unreviewed macOS target or role')
    data = read(binary, 128 * 1024 * 1024)
    if data != read(original, 128 * 1024 * 1024):
        raise ValueError('staged macOS library differs from mapped original')
    machine = macho(data)
    if machine['cpu'] != TARGETS[target]:
        raise ValueError('macOS CPU differs from target')
    if not machine['dynamic_libraries'] or set(machine['dynamic_libraries']) - {'/usr/lib/libSystem.B.dylib', '/usr/lib/libiconv.2.dylib'}:
        raise ValueError('unreviewed macOS system dynamic dependency')
    contents = read(link_map, 32 * 1024 * 1024)
    paths = re.findall(rb'^# Path:\s*(.+)$', contents, re.M)
    if len(paths) != 1:
        raise ValueError('missing or duplicate macOS map output')
    mapped = Path(paths[0].decode('utf-8')).resolve()
    if mapped not in {original.resolve(), (original.parent / 'deps' / original.name).resolve()} or read(mapped, 128 * 1024 * 1024) != data:
        raise ValueError('macOS map output differs from actual original library')
    sysroot = Path(subprocess.check_output(['rustc', '--print', 'sysroot'], text=True).strip())
    sdk = Path(subprocess.check_output(['xcrun', '--show-sdk-path'], text=True).strip())
    inputs = object_inputs(contents, original.parent / 'deps', sysroot / 'lib/rustlib' / target / 'lib', sdk)
    result = {'target': target, 'role': role, 'binary': binary.name, 'binary_sha256': hashlib.sha256(data).hexdigest(), 'map_sha256': hashlib.sha256(contents).hexdigest(), **machine, 'objects': inputs, 'scope': 'Actual Cargo/std versus system-SDK static-input boundary and dynamic imports; not blanket SDK terms or completed npm package clearance.'}
    (evidence / (role + '-macos-verification.json')).write_text(json.dumps(result, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    if len(sys.argv) != 7:
        raise SystemExit('usage: macos_native_evidence.py BINARY ORIGINAL MAP EVIDENCE TARGET ROLE')
    collect(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]), sys.argv[5], sys.argv[6])
