"""Проверить точные per-role musl inputs и сохранить original Rust/LLVM/libm grants."""

import gzip
import hashlib
import importlib.util
import json
from pathlib import Path, PurePosixPath
import re
import sys

PROFILE = 'ci/musl-retained-runtime.json'
PROFILE_SHA = 'ed6146168bd64b5022037c7a4ff30e71a21da74b07c697aa848799520166c1b5'


def read(path, limit):
    if path.is_symlink() or not path.is_file():
        raise ValueError('missing or symlinked musl retained input')
    with path.open('rb') as source:
        raw = source.read(limit + 1)
    if len(raw) > limit:
        raise ValueError('musl retained input exceeds bound')
    return raw


def profile(root):
    raw = read(root / PROFILE, 1024 * 1024)
    if hashlib.sha256(raw).hexdigest() != PROFILE_SHA:
        raise ValueError('unreviewed per-role musl runtime profile')
    document = json.loads(raw)
    if len(document['materials']) != 13 or sum(item['legal_document'] for item in document['materials']) != 4:
        raise ValueError('musl Rust original source/legal roles differ')
    return document, raw


def originals(root, document):
    result = []
    total = 0
    for item in document['materials']:
        relative = PurePosixPath(item['path'])
        if relative.is_absolute() or '..' in relative.parts or '\\' in item['path']:
            raise ValueError('unsafe musl Rust material path')
        raw = read(root / item['path'], 4 * 1024 * 1024)
        total += len(raw)
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if total > 32 * 1024 * 1024 or len(raw) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256'] or blob != item['git_blob']:
            raise ValueError('original musl Rust/LLVM/libm bytes differ')
        comments = re.findall(r'/\*.*?\*/|(?:^[ \t]*//[^\n]*(?:\n|$))+', raw.decode('utf-8'), re.M | re.S)
        notices = [value for value in comments if re.search(r'copyright|licens|permission|SPDX|public domain|redistribution', value, re.I)]
        result.append({**item, **({'text': raw.decode('utf-8')} if item['legal_document'] else {'source_notices': notices})})
    return result


def runtime_record(document, materials):
    return {'name': 'Rust compiler-builtins, incorporated LLVM compiler-rt and libm', 'rust_version': document['rust_version'], 'rust_revision': document['rust_revision'], 'llvm_revision': document['llvm_revision'], 'compiler_builtins_license': 'MIT AND Apache-2.0 WITH LLVM-exception', 'profile_sha256': PROFILE_SHA, 'materials': materials, 'coverage': document['coverage']}


def plain_notice(materials):
    sections = ['Original Rust compiler-builtins/LLVM/libm permissions and source notices.\n']
    for item in materials:
        sections.extend(['\n===== ' + item['repository'] + '@' + item['revision'] + '/' + item['upstream_path'] + ' =====\n', item['text'] if item['legal_document'] else '\n'.join(item['source_notices'])])
    return '\n'.join(sections).encode('utf-8')


def prepare(evidence):
    root = Path(__file__).resolve().parents[1]
    document, raw_profile = profile(root)
    materials = originals(root, document)
    before = read(evidence / 'NOTICE.json', 64 * 1024 * 1024)
    bundle = json.loads(before)
    runtimes = bundle.get('non_cargo_runtimes', [])
    if len(runtimes) != 1 or (evidence / 'musl-retained-runtime.json').exists():
        raise ValueError('unexpected musl retained preparation state')
    bundle['non_cargo_runtimes'] = [*runtimes, runtime_record(document, materials)]
    raw = (json.dumps(bundle, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')
    compressed = gzip.compress(raw, mtime=0)
    if len(raw) > 64 * 1024 * 1024 or len(compressed) > 4 * 1024 * 1024:
        raise ValueError('full musl retained notice exceeds bound')
    (evidence / 'NOTICE.source-collection.json').write_bytes(before)
    (evidence / 'NOTICE.json').write_bytes(raw)
    (evidence / 'NOTICE.json.gz').write_bytes(compressed)
    (evidence / 'musl-retained-runtime.json').write_bytes(raw_profile)
    for item in document['materials']:
        data = read(root / item['path'], 4 * 1024 * 1024)
        destination = evidence / 'runtime-rust-originals' / (item['role'] + '.txt')
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    (evidence / 'NOTICE.rust-builtins.txt').write_bytes(plain_notice(materials))


def normalized_archives(items):
    result = []
    for item in items:
        value = {'origin': item['origin'], 'name': Path(item['path']).name, 'members': sorted(Path(member).name for member in item['members'])}
        if not item['available_after_link']:
            raise ValueError('actual retained archive bytes unavailable')
        if item['origin'] == 'rust-sysroot':
            value.update({'path': item['path'], 'bytes': item['bytes'], 'sha256': item['sha256']})
        elif item['origin'] != 'zig-cache' or value['name'] != 'libunwind.a':
            raise ValueError('unreviewed musl archive origin/role')
        result.append(value)
    return sorted(result, key=lambda item: (item['origin'], item['name']))


def verify_inputs(report, document, target, role):
    if target not in document['targets'] or role not in document['targets'][target]:
        raise ValueError('unreviewed musl target/role')
    expected = document['targets'][target][role]
    if report['target'] != target or report['role'] != role or report['imports'] != expected['dynamic_imports'] or normalized_archives(report['archive_inputs']) != expected['archives']:
        raise ValueError('actual retained musl source/archive members differ')
    cpu = 62 if target.startswith('x86_64') else 183
    for archive in report['archive_inputs']:
        if archive['origin'] == 'zig-cache':
            inputs = archive.get('object_inputs', [])
            if sorted(item['name'] for item in inputs) != sorted(Path(name).name for name in archive['members']) or any(item['machine'] != cpu or not 0 < item['bytes'] <= 16 * 1024 * 1024 or re.fullmatch('[0-9a-f]{64}', item['sha256']) is None for item in inputs):
                raise ValueError('actual Zig member byte/CPU fingerprints missing')
    objects = report['direct_objects']
    marker = '/target/' + target + '/release/deps/ktav_' + role + '.'
    if len(objects) != 1 or marker not in objects[0] or not objects[0].endswith('.rcgu.o'):
        raise ValueError('unreviewed direct musl runtime object')


def verify(evidence, target, role):
    root = Path(__file__).resolve().parents[1]
    document, raw_profile = profile(root)
    materials = originals(root, document)
    report = json.loads(read(evidence / role / 'native-verification.json', 4 * 1024 * 1024))
    verify_inputs(report, document, target, role)
    if read(evidence / 'musl-retained-runtime.json', 1024 * 1024) != raw_profile:
        raise ValueError('staged per-role musl profile differs')
    for item in document['materials']:
        if read(evidence / 'runtime-rust-originals' / (item['role'] + '.txt'), 4 * 1024 * 1024) != read(root / item['path'], 4 * 1024 * 1024):
            raise ValueError('actual staged Rust original differs')
    notice = read(evidence / 'NOTICE.json', 64 * 1024 * 1024)
    bundle = json.loads(notice)
    before = json.loads(read(evidence / 'NOTICE.source-collection.json', 64 * 1024 * 1024))
    expected_bundle = {**before, 'non_cargo_runtimes': [*before['non_cargo_runtimes'], runtime_record(document, materials)]}
    if bundle != expected_bundle:
        raise ValueError('required full musl Rust/Cargo/source/grant roles differ')
    if read(evidence / 'NOTICE.rust-builtins.txt', 64 * 1024 * 1024) != plain_notice(materials):
        raise ValueError('plain original Rust/LLVM/libm grant text differs')
    binary_name = 'libktav_cabi.so' if role == 'cabi' else ('ktav.linux-x64-musl.node' if target.startswith('x86_64') else 'ktav.linux-arm64-musl.node')
    binary = read(evidence / role / binary_name, 128 * 1024 * 1024)
    scanner_spec = importlib.util.spec_from_file_location('musl_scanner', Path(__file__).with_name('check_embedded_notices.py'))
    scanner = importlib.util.module_from_spec(scanner_spec)
    scanner_spec.loader.exec_module(scanner)
    if hashlib.sha256(binary).hexdigest() != report['binary_sha256'] or scanner._extract(binary)[0] != notice:
        raise ValueError('actual musl binary/resource identity differs')
    result = {'target': target, 'role': role, 'binary_sha256': report['binary_sha256'], 'notice_sha256': hashlib.sha256(notice).hexdigest(), 'retained_profile_sha256': PROFILE_SHA, 'retained_archives': normalized_archives(report['archive_inputs']), 'full_rust_original_materials': len(materials), 'scope': 'Exact musl role/target retained-source/input and full original Rust grant resource gate; not other toolchain versions or npm production assembly.'}
    (evidence / role / 'retained-runtime-verification.json').write_text(json.dumps(result, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'prepare':
        prepare(Path(sys.argv[2]))
    elif len(sys.argv) == 5 and sys.argv[1] == 'verify':
        verify(Path(sys.argv[2]), sys.argv[3], sys.argv[4])
    else:
        raise SystemExit('usage: musl_retained_runtime.py prepare EVIDENCE | verify EVIDENCE TARGET ROLE')
