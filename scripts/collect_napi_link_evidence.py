"""Связать actual addon с GNU map и compiler/sysroot evidence."""

import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import sys

TARGETS = {'x86_64-unknown-linux-gnu': 62, 'aarch64-unknown-linux-gnu': 183}
LEGAL = re.compile(r'^(?:license|licence|copying|copyright|notice)(?:[._-].*)?$', re.I)


def sha(path):
    checksum = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            checksum.update(chunk)
    return checksum.hexdigest()


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
        notices.append({'path': path.relative_to(sdk).as_posix(), 'sha256': hashlib.sha256(data).hexdigest(), 'text': data.decode('utf-8')})
    (evidence / 'sdk-notice-files.json').write_text(json.dumps(notices, ensure_ascii=False, indent=2), encoding='utf-8')
    members = sorted({(PurePosixPath(archive).name, PurePosixPath(member).name) for archive, member in re.findall(r'([^\s()]+[.]a)\(([^()\n]+)\)', text)})
    objects = sorted({PurePosixPath(path).name for path in re.findall(r'^LOAD\s+([^\n]+[.]o)\s*$', text, re.M)})
    result = {'target': target, 'binary_sha256': binary_sha, 'compiler_sha256': sha(compiler), 'cross_toolchain_version': '1.0.3', 'archive_members': members, 'loaded_objects': objects, 'sdk_notice_files': len(notices), 'coverage': 'Observed GNU link inputs only; package MIT metadata is not a license conclusion for GNU runtime objects.'}
    (evidence / 'native-link-inputs.json').write_text(json.dumps(result, sort_keys=True, indent=2), encoding='utf-8')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('usage: collect_napi_link_evidence.py BINARY EVIDENCE TARGET')
    collect(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3])
