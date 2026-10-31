"""Связать actual addon с GNU map и compiler/sysroot evidence."""

import base64
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import sys

TARGETS = {'x86_64-unknown-linux-gnu': 62, 'aarch64-unknown-linux-gnu': 183}
LEGAL = re.compile(r'^(?:license|licence|copying[0-9]*|copyright|notice)(?:[._-].*)?$', re.I)


def sha(path):
    checksum = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            checksum.update(chunk)
    return checksum.hexdigest()


def notice_record(name, data):
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError:
        text = None
    return {'path': name, 'sha256': hashlib.sha256(data).hexdigest(),
            'raw_bytes_base64': base64.b64encode(data).decode('ascii'),
            'utf8_text': text, 'requires_encoding_review': text is None}


def sdk_inputs(sdk, link_map, target, catalog):
    boundary = sdk.resolve()
    selected = catalog['targets'][target]
    records = []
    for role, entries in [('compiler', [selected['compiler']]), ('configuration', [selected['configuration']]), ('runtime', selected['runtime_inputs'])]:
        for entry in entries:
            relative = PurePosixPath(entry['path'])
            if relative.is_absolute() or '..' in relative.parts or '\\' in entry['path']:
                raise ValueError('unsafe reviewed SDK input path')
            path = sdk / entry['path']
            if not path.resolve().is_relative_to(boundary) or not path.is_file():
                raise ValueError('SDK input escapes selected SDK or is missing')
            with path.open('rb') as source:
                data = source.read(4 * 1024 * 1024 + 1)
            if len(data) > 4 * 1024 * 1024 or len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError('SDK input differs from pinned repository bytes')
            records.append({'role': role, 'path': path.resolve().relative_to(boundary).as_posix(), 'bytes': len(data), 'sha256': entry['sha256']})
    expected = {item['path'] for item in records if item['role'] == 'runtime'}
    observed = set()
    for value in re.findall(r'^LOAD\s+([^\n]+\.(?:o|a))\s*$', link_map, re.M):
        public_path = Path(value)
        path = public_path.resolve()
        if public_path.is_relative_to(sdk.absolute()) and not path.is_relative_to(boundary):
            raise ValueError('mapped SDK static input escapes selected SDK')
        if path.is_relative_to(boundary):
            observed.add(path.relative_to(boundary).as_posix())
    if observed != expected:
        raise ValueError('actual SDK static input inventory differs from reviewed profile')
    return {'repository_revision': catalog['repository_revision'], 'inputs': records, 'coverage': 'Exact SDK compiler/configuration and loaded static-input bytes; not a claim of reproducible GNU source compilation or complete runtime license clearance.'}


def collect(binary, evidence, target):
    if target not in TARGETS or not binary.is_file() or binary.stat().st_size > 128 * 1024 * 1024:
        raise ValueError('invalid NAPI target or binary')
    with binary.open('rb') as source:
        header = source.read(64)
    if len(header) != 64 or header[:6] != b'\x7fELF\x02\x01' or struct.unpack_from('<H', header, 18)[0] != TARGETS[target]:
        raise ValueError('NAPI ELF CPU differs from matrix target')
    binary_sha = sha(binary)
    records = []
    workspace = Path.cwd().resolve()
    for path in sorted((evidence / 'link-maps').glob('*.json')):
        entry = json.loads(path.read_text(encoding='utf-8'))
        output = Path(entry['output'])
        if entry['target'] != target or not output.resolve().is_relative_to(workspace):
            raise ValueError('unreviewed native link capture')
        if output.is_file() and sha(output) == binary_sha:
            records.append(entry)
    if len(records) != 1:
        raise ValueError('actual addon must match exactly one captured shared link')
    record = records[0]
    if PurePosixPath(record['map']).name != record['map']:
        raise ValueError('unsafe captured native map name')
    link_map = evidence / 'link-maps' / record['map']
    if not link_map.is_file() or not 0 < link_map.stat().st_size <= 32 * 1024 * 1024:
        raise ValueError('missing or oversized actual native map')
    text = link_map.read_text(encoding='utf-8')
    shutil.copyfile(link_map, evidence / 'native-link.map')
    sdk = Path.home() / '.napi-rs/cross-toolchain/1.0.3' / target
    compiler = sdk / 'bin' / (target + '-gcc')
    if Path(record['compiler']) != compiler or not compiler.resolve().is_relative_to(sdk.resolve()):
        raise ValueError('captured compiler differs from selected SDK')
    catalog_path = Path(__file__).resolve().parents[1] / 'ci/napi-gnu-sdk-inputs.json'
    with catalog_path.open('rb') as source:
        catalog_bytes = source.read(1024 * 1024 + 1)
    if len(catalog_bytes) > 1024 * 1024:
        raise ValueError('SDK input catalogue exceeds bound')
    catalog = json.loads(catalog_bytes)
    if catalog.get('schema_version') != 1 or catalog.get('sdk_version') != '1.0.3' or set(catalog['targets']) != set(TARGETS):
        raise ValueError('unreviewed SDK input catalogue')
    input_profile = sdk_inputs(sdk, text, target, catalog)
    for name, args in [('compiler-version.txt', [str(compiler), '--version']), ('elf-header.txt', ['readelf', '-h', str(binary)]), ('elf-dynamic.txt', ['readelf', '-d', str(binary)]), ('elf-versions.txt', ['readelf', '--version-info', str(binary)])]:
        (evidence / name).write_bytes(subprocess.check_output(args))
    configuration = sdk / 'bin' / (target + '-ct-ng.config')
    if configuration.is_file():
        shutil.copyfile(configuration, evidence / 'cross-toolchain.config')
    notices = []
    total = 0
    for path in sorted(sdk.rglob('*')):
        if not LEGAL.fullmatch(path.name) or not path.is_file():
            continue
        if path.is_symlink() and not path.resolve().is_relative_to(sdk.resolve()):
            raise ValueError('SDK notice symlink escapes source SDK')
        size = path.stat().st_size
        if size > 4 * 1024 * 1024 or total + size > 32 * 1024 * 1024:
            raise ValueError('SDK notice size limit exceeded')
        data = path.read_bytes()
        total += len(data)
        notices.append(notice_record(path.relative_to(sdk).as_posix(), data))
    (evidence / 'sdk-notice-files.json').write_text(json.dumps(notices, ensure_ascii=False, indent=2), encoding='utf-8')
    members = sorted({(PurePosixPath(archive).name, PurePosixPath(member).name) for archive, member in re.findall(r'([^\s()]+[.]a)\(([^()\n]+)\)', text)})
    objects = sorted({PurePosixPath(path).name for path in re.findall(r'^LOAD\s+([^\n]+[.]o)\s*$', text, re.M)})
    result = {'target': target, 'binary_sha256': binary_sha, 'compiler_sha256': sha(compiler), 'cross_toolchain_version': '1.0.3', 'sdk_input_profile': input_profile, 'sdk_input_catalog_sha256': hashlib.sha256(catalog_bytes).hexdigest(), 'archive_members': members, 'loaded_objects': objects, 'sdk_notice_files': len(notices), 'notice_files_requiring_encoding_review': [item['path'] for item in notices if item['requires_encoding_review']], 'coverage': 'Observed GNU link inputs only; package MIT metadata is not a license conclusion for GNU runtime objects.'}
    (evidence / 'native-link-inputs.json').write_text(json.dumps(result, sort_keys=True, indent=2), encoding='utf-8')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('usage: collect_napi_link_evidence.py BINARY EVIDENCE TARGET')
    collect(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3])
