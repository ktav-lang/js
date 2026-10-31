"""Сохранить exact MSVC NAPI input и SDK legal evidence без SDK code payloads."""

import base64
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import sys


def read(path, limit):
    if path.is_symlink() or not path.is_file():
        raise ValueError('missing or symlinked MSVC evidence input')
    with path.open('rb') as source:
        data = source.read(limit + 1)
    if len(data) > limit:
        raise ValueError('MSVC input exceeds bound')
    return data


def fingerprint(path, limit):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
        raise ValueError('unreviewed MSVC fingerprint input')
    checksum = hashlib.sha256()
    total = 0
    with path.open('rb') as source:
        while chunk := source.read(1024 * 1024):
            total += len(chunk)
            if total > limit:
                raise ValueError('MSVC fingerprint exceeds bound')
            checksum.update(chunk)
    return {'bytes': total, 'sha256': checksum.hexdigest()}


def pe_machine(data):
    if len(data) < 64 or data[:2] != b'MZ':
        raise ValueError('expected MSVC PE library')
    offset = int.from_bytes(data[60:64], 'little')
    if offset + 24 > len(data) or data[offset:offset + 4] != b'PE\0\0' or not struct.unpack_from('<H', data, offset + 22)[0] & 0x2000:
        raise ValueError('expected MSVC DLL image')
    return struct.unpack_from('<H', data, offset + 4)[0]


def legal_read_limit(key, info, size):
    if size <= 4 * 1024 * 1024:
        return 4 * 1024 * 1024
    if (
        key == 'visual-studio/Licenses/1033/ThirdPartyNotices.txt'
        and info['visual_studio_version'] == '18.11.12315.225'
        and info['vctools_version'] == '14.51.36231'
        and info['windows_sdk_version'] == '10.0.26100.0'
        and size == 6167634
    ):
        return 6167634
    raise ValueError(f'SDK legal original exceeds 4 MiB: {key}; bytes={size}')


def collect(evidence, binary, original, sdk_info, reproduction, target):
    machines = {'x86_64-pc-windows-msvc': 0x8664, 'aarch64-pc-windows-msvc': 0xAA64}
    if target not in machines:
        raise ValueError('unreviewed NAPI MSVC target')
    data = read(binary, 128 * 1024 * 1024)
    if data != read(original, 128 * 1024 * 1024) or pe_machine(data) != machines[target]:
        raise ValueError('MSVC staged/original bytes or CPU differ')
    info = json.loads(read(sdk_info, 1024 * 1024))
    if info['target'] != target:
        raise ValueError('selected SDK target differs')
    sysroot = Path(subprocess.check_output(['rustc', '--print', 'sysroot'], text=True).strip())
    rustc = subprocess.check_output(['rustc', '--version', '--verbose'], text=True)
    host = re.search(r'^host: (.+)$', rustc, re.M)
    if host is None:
        raise ValueError('missing selected Rust host')
    tool = sysroot / 'lib/rustlib' / host[1].strip() / 'bin/llvm-readobj.exe'
    pe = subprocess.check_output([str(tool), '--file-headers', '--coff-imports', '--coff-exports', str(binary)])
    (evidence / 'pe-inputs.txt').write_bytes(pe)
    inputs = []
    responses = []
    total = 0
    for path in sorted(reproduction.rglob('*')):
        if path.is_dir():
            continue
        if not path.resolve().is_relative_to(reproduction.resolve()):
            raise ValueError('MSVC reproduction input escapes root')
        record = fingerprint(path, 128 * 1024 * 1024)
        total += record['bytes']
        if total > 512 * 1024 * 1024 or len(inputs) >= 8192:
            raise ValueError('MSVC reproduction exceeds bounds')
        relative = path.relative_to(reproduction).as_posix()
        inputs.append({'path': relative, **record})
        if path.suffix.lower() == '.rsp' and 'environment' not in path.name.lower():
            raw = read(path, 4 * 1024 * 1024)
            responses.append({'path': relative, 'raw_bytes_base64': base64.b64encode(raw).decode('ascii'), **record})
    if not inputs or not responses:
        raise ValueError('actual final MSVC link reproduction/response missing')
    (evidence / 'link-input-fingerprints.json').write_text(json.dumps(inputs, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    (evidence / 'link-responses.json').write_text(json.dumps(responses, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    roots = {'visual-studio': Path(info['visual_studio_root']), 'windows-sdk': Path(info['windows_sdk_root'])}
    candidates = []
    for role, root in roots.items():
        candidates.extend((role, root, path) for path in root.iterdir() if path.is_file())
        folders = ['Licenses', 'License', 'license', 'Redist']
        if role == 'visual-studio':
            folders += ['VC/Redist', 'VC/Auxiliary/Build']
        for folder in folders:
            parent = root / folder
            if not parent.is_dir():
                continue
            for index, path in enumerate(parent.rglob('*')):
                if index >= 32768:
                    raise ValueError('SDK legal path enumeration exceeds bound')
                if path.is_file() and len(path.relative_to(parent).parts) <= 5:
                    candidates.append((role, root, path))
    legal_index = []
    indexed = set()
    for role, root, path in candidates:
        if path.suffix.lower() not in {'.txt', '.html', '.htm', '.rtf', '.md'} or not re.search(r'license|licence|eula|notice|copyright|redist', path.name, re.I):
            continue
        key = role + '/' + path.relative_to(root).as_posix()
        if key.casefold() in indexed:
            continue
        indexed.add(key.casefold())
        legal_index.append({'path': key, 'bytes': path.lstat().st_size, 'symlink': path.is_symlink()})
    (evidence / 'sdk-legal-index.json').write_text(json.dumps(legal_index, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    legal = []
    seen = set()
    total = 0
    for role, root, path in candidates:
        if path.suffix.lower() not in {'.txt', '.html', '.htm', '.rtf', '.md'} or not re.search(r'license|licence|eula|notice|copyright|redist', path.name, re.I):
            continue
        key = role + '/' + path.relative_to(root).as_posix()
        if key.casefold() in seen:
            continue
        seen.add(key.casefold())
        if not path.resolve().is_relative_to(root.resolve()):
            raise ValueError('SDK legal document escapes selected installation')
        raw = read(path, legal_read_limit(key, info, path.stat().st_size))
        total += len(raw)
        if total > 32 * 1024 * 1024 or len(legal) >= 1024:
            raise ValueError('MSVC SDK legal inventory exceeds bound')
        try:
            text = raw.decode('utf-16') if raw.startswith((b'\xff\xfe', b'\xfe\xff')) else raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = None
        legal.append({'path': key, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'raw_bytes_base64': base64.b64encode(raw).decode('ascii'), 'decoded_text': text, 'requires_encoding_review': text is None})
    (evidence / 'sdk-legal.json').write_text(json.dumps(legal, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    imports = re.findall(rb'^\s*Name: ([^\r\n]+[.](?:dll|exe))\s*$', pe, re.M | re.I)
    link_map = read(evidence / 'native-link.map', 32 * 1024 * 1024)
    result = {'target': target, 'binary_sha256': hashlib.sha256(data).hexdigest(), 'map_sha256': hashlib.sha256(link_map).hexdigest(), 'machine': machines[target], 'imports': [name.decode('ascii') for name in imports], 'input_count': len(inputs), 'sdk_legal_files': len(legal), 'selected_sdk': info, 'scope': 'Actual selected MSVC NAPI build inputs and available original SDK documents only. Host imports are not included code; no redistribution-rights approval or historical build claim.'}
    (evidence / 'native-msvc-verification.json').write_text(json.dumps(result, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    if len(sys.argv) != 7:
        raise SystemExit('usage: collect_msvc_napi_evidence.py EVIDENCE BINARY ORIGINAL SDK_INFO REPRODUCTION TARGET')
    collect(*map(Path, sys.argv[1:6]), sys.argv[6])
