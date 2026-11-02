"""Проверить actual GNU C ABI ELF, runtime imports и callable/data exports."""

import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import sys

FUNCTIONS = {'ktav_loads', 'ktav_loads_strict', 'ktav_dumps', 'ktav_dumps_force_strings', 'ktav_emit_canonical', 'ktav_format', 'ktav_canonical_from_source', 'ktav_free', 'ktav_version', 'ktav_abi_version'}
OS_LIBRARIES = {'libc.so.6', 'libm.so.6', 'libpthread.so.0', 'libdl.so.2', 'librt.so.1', 'ld-linux-x86-64.so.2', 'ld-linux-aarch64.so.1'}


def machine(data, target):
    expected = {'x86_64-unknown-linux-gnu': 62, 'aarch64-unknown-linux-gnu': 183}
    if target not in expected or len(data) < 64 or data[:6] != b'\x7fELF\x02\x01' or struct.unpack_from('<H', data, 16)[0] != 3 or struct.unpack_from('<H', data, 18)[0] != expected[target]:
        raise ValueError('expected matching ELF64 little-endian shared library')
    return expected[target]


def dependencies(text):
    if re.search(r'\((?:RPATH|RUNPATH)\)', text):
        raise ValueError('unreviewed GNU C ABI loader search path')
    names = re.findall(r'\(NEEDED\).*Shared library: \[([^\]]+)\]', text)
    if not names or not set(names) <= OS_LIBRARIES:
        raise ValueError('unreviewed GNU C ABI dynamic runtime')
    return names


def glibc_versions(text):
    if 'GLIBC_PRIVATE' in text:
        raise ValueError('unreviewed private glibc ABI')
    versions = {tuple(map(int, value.split('.'))) for value in re.findall(r'GLIBC_([0-9]+(?:[.][0-9]+)+)', text)}
    if not versions or any(value + (0,) * max(0, 3 - len(value)) > (2, 17, 0) for value in versions):
        raise ValueError('GNU C ABI requires newer than glibc 2.17')
    return ['.'.join(map(str, value)) for value in sorted(versions)]


def exports(text):
    symbols = {}
    for line in text.splitlines():
        fields = line.split()
        if len(fields) >= 2:
            symbols[fields[0]] = fields[1]
    calls = {name for name in symbols if name.startswith('ktav_')}
    if calls != FUNCTIONS or any(symbols[name].upper() != 'T' for name in calls):
        raise ValueError('original callable GNU C ABI exports differ')
    if symbols.get('KTAV_THIRD_PARTY_NOTICES') not in {'R', 'D'}:
        raise ValueError('immutable C ABI resource export missing')
    return sorted(calls)


def main(binary, evidence, target):
    if binary.is_symlink() or not binary.is_file() or binary.stat().st_size > 128 * 1024 * 1024:
        raise ValueError('unreviewed actual GNU binary input')
    data = binary.read_bytes()
    cpu = machine(data, target)
    dynamic = subprocess.check_output(['readelf', '--dynamic', str(binary)], text=True)
    versions = subprocess.check_output(['readelf', '--version-info', str(binary)], text=True)
    symbols = subprocess.check_output(['nm', '-D', '--defined-only', '--format=posix', str(binary)], text=True)
    (evidence / 'elf-dynamic.txt').write_text(dynamic, encoding='utf-8')
    (evidence / 'elf-version-info.txt').write_text(versions, encoding='utf-8')
    (evidence / 'elf-exports.txt').write_text(symbols, encoding='utf-8')
    imports = dependencies(dynamic)
    other_loader = 'ld-linux-aarch64.so.1' if target.startswith('x86_64') else 'ld-linux-x86-64.so.2'
    if other_loader in imports:
        raise ValueError('GNU C ABI imports the other CPU loader')
    report = {'target': target, 'binary_sha256': hashlib.sha256(data).hexdigest(), 'machine': cpu, 'imports': imports, 'glibc_versions': glibc_versions(versions), 'callable_exports': exports(symbols), 'metadata_export': 'KTAV_THIRD_PARTY_NOTICES', 'scope': 'Actual GNU C ABI ELF/ABI/import metadata only; embedded source/runtime resource and archive members are checked separately.'}
    (evidence / 'native-gnu-verification.json').write_text(json.dumps(report, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, sort_keys=True))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('usage: check_gnu_cabi_evidence.py BINARY EVIDENCE TARGET')
    main(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3])
