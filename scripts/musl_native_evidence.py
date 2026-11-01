"""Собрать source-bound musl candidate notices и actual input evidence без clearance claims."""

import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import sys

CATALOG_SHA = '0891c8f6a1d88679b1fbcc00505b32e0d92a11d0a8ea9f78c4b0e63ab27db7e1'
REVISION = '5ad91a646a753cc3eecd8751e61cf458dadd9ac4'


def read(path, limit):
    if path.is_symlink() or not path.is_file():
        raise ValueError('missing or symlinked musl evidence input')
    with path.open('rb') as source:
        raw = source.read(limit + 1)
    if len(raw) > limit:
        raise ValueError('musl evidence input exceeds bound')
    return raw


def machine(data, target):
    expected = {'x86_64-unknown-linux-musl': 62, 'aarch64-unknown-linux-musl': 183}
    if target not in expected or len(data) < 64 or data[:6] != b'\x7fELF\x02\x01' or struct.unpack_from('<HH', data, 16) != (3, expected[target]):
        raise ValueError('expected matching musl ELF64 shared library')
    return expected[target]


def dependencies(dynamic, versions, target):
    needed = re.findall(r'\(NEEDED\).*Shared library: \[([^\]]+)\]', dynamic)
    alternate = 'libc.musl-x86_64.so.1' if target.startswith('x86_64') else 'libc.musl-aarch64.so.1'
    if needed not in [['libc.so'], [alternate]] or re.search(r'GLIBC_[0-9]|GLIBC_PRIVATE', versions) or re.search(r'\((?:RPATH|RUNPATH)\)', dynamic):
        raise ValueError('unreviewed musl dynamic dependency or glibc/loader ABI')
    return needed


def prepare(evidence):
    root = Path(__file__).resolve().parents[1]
    profile_raw = read(root / 'ci/musl-runtime-catalog.json', 4 * 1024 * 1024)
    if hashlib.sha256(profile_raw).hexdigest() != CATALOG_SHA:
        raise ValueError('unreviewed conservative musl notice catalogue')
    profile = json.loads(profile_raw)
    if profile['source_revision'] != REVISION or profile['zig_version'] != '0.14.0' or len(profile['files']) != 35:
        raise ValueError('musl source/legal roles differ')
    if subprocess.check_output(['zig', 'version'], text=True).strip() != '0.14.0':
        raise ValueError('unreviewed musl Zig version')
    lib = Path(json.loads(subprocess.check_output(['zig', 'env']))['lib_dir']).resolve()
    sections = ['Ktav musl candidate runtime notice collection.\nActual retained inputs still require review before production delivery.\n']
    for item in profile['files']:
        relative = PurePosixPath(item['path'])
        if relative.is_absolute() or '..' in relative.parts or '\\' in item['path']:
            raise ValueError('unsafe musl SDK source path')
        source = lib.parent / 'LICENSE' if item['path'] == 'LICENSE' else lib.joinpath(*relative.parts[1:])
        if not source.resolve().is_relative_to(lib.parent if item['path'] == 'LICENSE' else lib):
            raise ValueError('musl SDK source escapes selected installation')
        raw = read(source, 4 * 1024 * 1024)
        if hashlib.sha256(raw).hexdigest() != item['sha256'] or hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() != item['git_blob']:
            raise ValueError('actual musl SDK source bytes differ')
        if 'license_text' in item and item['license_text'].encode('utf-8') != raw or any(value.encode('utf-8') not in raw for value in item.get('source_notices', [])):
            raise ValueError('original musl copyright/grant bytes differ')
        sections.extend(['\n===== ' + item['path'] + ' =====\n', item['license_text'] if 'license_text' in item else '\n'.join(item['source_notices'])])
    before = read(evidence / 'NOTICE.json', 64 * 1024 * 1024)
    bundle = json.loads(before)
    if 'non_cargo_runtimes' in bundle or (evidence / 'NOTICE.cargo-std.json').exists():
        raise ValueError('musl candidate notices already augmented')
    bundle['non_cargo_runtimes'] = [{'name': 'Conservative Zig libunwind/musl source-notice collection', 'source_revision': REVISION, 'catalog_sha256': CATALOG_SHA, 'files': profile['files'], 'credits': profile['credits'], 'coverage': profile['coverage']}]
    bundle['coverage'] += ' Candidate musl source notice collection only; retained runtime input review remains required.'
    raw = (json.dumps(bundle, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')
    compressed = gzip.compress(raw, mtime=0)
    if len(raw) > 64 * 1024 * 1024 or len(compressed) > 4 * 1024 * 1024:
        raise ValueError('musl candidate notice resource exceeds bound')
    (evidence / 'NOTICE.cargo-std.json').write_bytes(before)
    (evidence / 'NOTICE.json').write_bytes(raw)
    (evidence / 'NOTICE.json.gz').write_bytes(compressed)
    (evidence / 'musl-runtime-catalog.json').write_bytes(profile_raw)
    (evidence / 'NOTICE.musl-runtime.txt').write_bytes('\n'.join(sections).encode('utf-8'))


def capture(binary, evidence, target, role, cache, sysroot):
    data = read(binary, 128 * 1024 * 1024)
    cpu = machine(data, target)
    dynamic = subprocess.check_output(['readelf', '--dynamic', str(binary)], text=True)
    versions = subprocess.check_output(['readelf', '--version-info', str(binary)], text=True)
    symbols = subprocess.check_output(['nm', '-D', '--defined-only', '--format=posix', str(binary)], text=True)
    needed = dependencies(dynamic, versions, target)
    for name, text in [('elf-dynamic.txt', dynamic), ('elf-versions.txt', versions), ('elf-exports.txt', symbols)]:
        (evidence / name).write_text(text, encoding='utf-8')
    mapping = read(evidence / 'native-link.map', 32 * 1024 * 1024)
    command = json.loads(read(evidence / 'native-link-command.json', 4 * 1024 * 1024))
    if not command or not any('--print-map' in value for value in command):
        raise ValueError('actual musl final linker command missing')
    archives = {}
    for archive, member in re.findall(r'([^\s()]+[.](?:a|rlib))\(([^()\n]+)\)', mapping.decode('utf-8')):
        archives.setdefault(archive, set()).add(member)
    records = []
    roots = {'zig-cache': cache.resolve(), 'rust-sysroot': sysroot.resolve(), 'cargo-target': (Path.cwd() / 'target').resolve()}
    for name, members in sorted(archives.items()):
        path = Path(name)
        resolved = path.resolve()
        origin = next((key for key, base in roots.items() if resolved.is_relative_to(base)), None)
        if origin is None:
            raise ValueError('native musl archive escapes selected SDK/Rust/source roots')
        record = {'path': resolved.relative_to(roots[origin]).as_posix(), 'origin': origin, 'members': sorted(members), 'available_after_link': path.is_file()}
        if path.is_file():
            raw = read(path, 128 * 1024 * 1024)
            record.update({'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
        records.append(record)
    direct = sorted(set(re.findall(r'[^\s()]+[.]o(?=:\()', mapping.decode('utf-8'))))
    for name in ['NOTICE.json', 'NOTICE.json.gz', 'NOTICE.cargo-std.json', 'musl-runtime-catalog.json', 'NOTICE.musl-runtime.txt', 'Cargo.lock', 'source-provenance.json']:
        shutil.copyfile(evidence.parent / name, evidence / name)
    destination = evidence / binary.name
    if destination.resolve() != binary.resolve():
        shutil.copyfile(binary, destination)
    report = {'target': target, 'role': role, 'machine': cpu, 'binary_sha256': hashlib.sha256(data).hexdigest(), 'map_sha256': hashlib.sha256(mapping).hexdigest(), 'imports': needed, 'archive_inputs': records, 'direct_objects': direct, 'scope': 'Actual musl candidate binary/resource/input collection only. Retained-source grant review still required; no production npm delivery approval.'}
    (evidence / 'native-verification.json').write_text(json.dumps(report, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, sort_keys=True))


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'prepare':
        prepare(Path(sys.argv[2]))
    elif len(sys.argv) == 8 and sys.argv[1] == 'capture':
        capture(Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4], sys.argv[5], Path(sys.argv[6]), Path(sys.argv[7]))
    else:
        raise SystemExit('usage: musl_native_evidence.py prepare EVIDENCE | capture BINARY ROLE_EVIDENCE TARGET ROLE CACHE SYSROOT')
