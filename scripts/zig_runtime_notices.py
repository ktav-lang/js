"""Сохранить проверенные Zig runtime notices и проверить actual link inputs."""

import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

REVISION = '5ad91a646a753cc3eecd8751e61cf458dadd9ac4'
CATALOG_SHA = 'baad05bad75045fe31853320a35d8c533068586c194ce5c81ab6adeda10fe435'
EXPECTED_MEMBERS = {
    ('libunwind.a', 'UnwindLevel1.o'),
    ('libunwind.a', 'UnwindLevel1-gcc-ext.o'),
    ('libunwind.a', 'UnwindRegistersSave.o'),
    ('libunwind.a', 'UnwindRegistersRestore.o'),
    ('libunwind.a', 'libunwind.o'),
    ('libc_nonshared.a', 'stat64-2.32.o'),
    ('libc_nonshared.a', 'fstat64-2.32.o'),
}


def _read(path, limit=4 * 1024 * 1024):
    with path.open('rb') as source:
        data = source.read(limit + 1)
    if len(data) > limit:
        raise ValueError('runtime evidence file exceeds limit')
    return data


def _catalogue():
    path = Path(__file__).resolve().parents[1] / 'ci/zig-runtime-catalog.json'
    if path.is_symlink() or not path.is_file():
        raise ValueError('missing or symlinked Zig runtime catalogue')
    raw = _read(path)
    if hashlib.sha256(raw).hexdigest() != CATALOG_SHA:
        raise ValueError('unreviewed Zig runtime catalogue')
    catalog = json.loads(raw)
    if len(catalog['files']) != 37:
        raise ValueError('required Zig runtime source/legal roles differ')
    return catalog, raw


def _sources(lib, catalog):
    if catalog.get('source_revision') != REVISION or catalog.get('zig_version') != '0.14.0':
        raise ValueError('unreviewed Zig runtime source revision')
    lib = lib.resolve()
    for item in catalog['files']:
        relative = PurePosixPath(item['path'])
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('invalid runtime source path')
        if item['path'] == 'LICENSE':
            source = lib.parent / 'LICENSE'
            boundary = lib.parent
        elif relative.parts[0] == 'lib':
            source = lib.joinpath(*relative.parts[1:])
            boundary = lib
        else:
            raise ValueError('unexpected runtime source path')
        if not source.resolve().is_relative_to(boundary):
            raise ValueError('runtime source escapes Zig installation')
        data = _read(source)
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError(f"Zig runtime source changed: {item['path']}")
        if 'license_text' in item and item['license_text'].encode('utf-8') != data:
            raise ValueError('Zig full legal original differs')
        if any(notice.encode('utf-8') not in data for notice in item.get('source_notices', [])):
            raise ValueError('Zig file-level copyright/grant text differs')
    return catalog['files']


def _runtime(catalog):
    return {
        'name': 'Zig vendored LLVM libunwind and glibc nonshared runtime',
        'zig_version': '0.14.0',
        'source_revision': REVISION,
        'coverage': 'Conservative source notices; actual archive members are checked after linking.',
        'catalog_sha256': CATALOG_SHA,
        'files': catalog['files'],
        'credits': catalog['credits'],
    }


def _augment(bundle, catalog):
    if bundle.get('schema_version') != 1 or 'non_cargo_runtimes' in bundle:
        raise ValueError('unexpected native notice bundle state')
    return {**bundle, 'non_cargo_runtimes': [_runtime(catalog)], 'coverage': bundle['coverage'] + ' Includes verified Zig runtime source notices; linked archive members require the post-build map gate.'}


def _plain_notice(catalog):
    sections = ['Ktav C ABI Linux GNU Zig runtime notices.\nComplete original legal text and source-file notices follow unchanged.\n']
    for item in catalog['files']:
        sections.append('\n===== ' + item['path'] + ' =====\n')
        sections.append(item['license_text'] if 'license_text' in item else '\n'.join(item['source_notices']))
    sections.append('\n' + catalog['credits'] + '\n')
    return '\n'.join(sections).encode('utf-8')


def _prepare(evidence):
    version = subprocess.check_output(['zig', 'version'], text=True).strip()
    if version != '0.14.0':
        raise ValueError('unreviewed Zig version')
    environment = json.loads(subprocess.check_output(['zig', 'env']))
    lib = Path(environment['lib_dir'])
    catalog, catalog_bytes = _catalogue()
    files = _sources(lib, catalog)
    notice_path = evidence / 'NOTICE.json'
    original = _read(notice_path, 64 * 1024 * 1024)
    bundle = _augment(json.loads(original), catalog)
    data = (json.dumps(bundle, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')
    compressed = gzip.compress(data, mtime=0)
    if len(data) > 64 * 1024 * 1024 or len(compressed) > 4 * 1024 * 1024:
        raise ValueError('combined runtime notices exceed resource limit')
    with (evidence / 'NOTICE.cargo-std.json').open('xb') as out:
        out.write(original)
    with (evidence / 'zig-runtime-catalog.json').open('xb') as out:
        out.write(catalog_bytes)
    notice_path.write_bytes(data)
    (evidence / 'NOTICE.json.gz').write_bytes(compressed)
    (evidence / 'NOTICE.zig-runtime.txt').write_bytes(_plain_notice(catalog))
    print(f'Included {len(files)} exact Zig runtime source records')


def _members(text):
    matches = re.findall(r'([^\s()]+[.]a)\(([^()\n]+)\)', text)
    members = {(PurePosixPath(archive).name, PurePosixPath(member).name) for archive, member in matches}
    if members != EXPECTED_MEMBERS:
        raise ValueError(f'unreviewed archive membership: {sorted(members ^ EXPECTED_MEMBERS)}')
    objects = set(re.findall(r'[^\s()]+[.]o(?=:\()', text))
    if not objects or any(not path.endswith('.rcgu.o') for path in objects):
        raise ValueError('unreviewed direct object input')
    return sorted(members)


def _verify(evidence):
    bundle = json.loads(_read(evidence / 'NOTICE.json', 64 * 1024 * 1024))
    catalog, raw = _catalogue()
    before = json.loads(_read(evidence / 'NOTICE.cargo-std.json', 64 * 1024 * 1024))
    if bundle != _augment(before, catalog) or _read(evidence / 'zig-runtime-catalog.json') != raw:
        raise ValueError('Zig runtime source/notice roles differ from reviewed originals')
    if _read(evidence / 'NOTICE.zig-runtime.txt', 64 * 1024 * 1024) != _plain_notice(catalog):
        raise ValueError('plain Zig runtime legal originals differ')
    if subprocess.check_output(['zig', 'version'], text=True).strip() != '0.14.0':
        raise ValueError('unreviewed post-build Zig version')
    _sources(Path(json.loads(subprocess.check_output(['zig', 'env']))['lib_dir']), catalog)
    mapping = _read(evidence / 'native-link.map', 16 * 1024 * 1024).decode('utf-8')
    members = _members(mapping)
    cache = Path(os.environ['ZIG_GLOBAL_CACHE_DIR']).resolve()
    paths = sorted(set(re.findall(r'([^\s()]+[.]a)\([^()\n]+\)', mapping)))
    fingerprints = []
    seen = set()
    for name in paths:
        path = Path(name)
        if not path.resolve().is_relative_to(cache) or path.name in seen:
            raise ValueError('unreviewed or duplicate Zig archive origin')
        seen.add(path.name)
        data = _read(path, 64 * 1024 * 1024)
        fingerprints.append({'path': path.resolve().relative_to(cache).as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    if seen != {'libunwind.a', 'libc_nonshared.a'}:
        raise ValueError('selected Zig archive roles differ')
    with (evidence / 'zig-runtime-members.json').open('x', encoding='utf-8') as out:
        json.dump({'source_revision': REVISION, 'archive_members': members, 'archive_fingerprints': fingerprints}, out, sort_keys=True, indent=2)
    print('Verified all seven static Zig runtime archive members')


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ('prepare', 'verify'):
        raise SystemExit('usage: zig_runtime_notices.py prepare|verify EVIDENCE_DIRECTORY')
    try:
        (_prepare if sys.argv[1] == 'prepare' else _verify)(Path(sys.argv[2]))
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error


if __name__ == '__main__':
    main()
