"""Сохранить actual linker fingerprints и полный проверенный native payload."""

import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
import tomllib


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def fingerprints(archive_path):
    if archive_path.is_symlink() or not archive_path.is_file() or archive_path.stat().st_size > 512 * 1024 * 1024:
        raise ValueError('missing or oversized linker reproduction')
    items = []
    seen = set()
    total = 0
    with tarfile.open(archive_path, 'r:') as archive:
        for item in archive:
            path = PurePosixPath(item.name)
            if path.is_absolute() or '..' in path.parts or '\\' in item.name or ':' in item.name or item.name.casefold() in seen:
                raise ValueError('unsafe or duplicate linker input')
            seen.add(item.name.casefold())
            if len(seen) > 8192:
                raise ValueError('link input count exceeds bound')
            if item.isdir():
                continue
            if not item.isfile() or item.size > 128 * 1024 * 1024:
                raise ValueError('invalid linker input type/size')
            total += item.size
            if total > 512 * 1024 * 1024:
                raise ValueError('link input bytes exceed bound')
            digest = hashlib.sha256()
            size = 0
            with archive.extractfile(item) as source:
                while chunk := source.read(1024 * 1024):
                    size += len(chunk)
                    digest.update(chunk)
            if size != item.size:
                raise ValueError('truncated linker input')
            items.append({'path': item.name, 'bytes': size, 'sha256': digest.hexdigest()})
    if not any(item['path'].endswith('/response.txt') for item in items):
        raise ValueError('actual linker response missing')
    return items


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8')


def stage(evidence, binary, target):
    evidence = evidence.resolve()
    identity = json.loads((evidence / 'binary-verification.json').read_text(encoding='utf-8'))
    verified = json.loads((evidence / 'native-runtime-verification.json').read_text(encoding='utf-8'))
    if identity['target'] != target or verified['target'] != target or sha(binary.read_bytes()) != identity['binary_sha256'] or verified['binary_sha256'] != identity['binary_sha256']:
        raise ValueError('native verification identities differ')
    if target == 'x86_64-pc-windows-gnullvm':
        consumer = json.loads((evidence / 'consumer-verification.json').read_text(encoding='utf-8'))
        if consumer['binary_sha256'] != identity['binary_sha256'] or consumer.get('loaded_built_addon') is not True or consumer.get('sdk_path_removed') is not True:
            raise ValueError('actual x64 consumer proof missing')
    elif target != 'aarch64-pc-windows-gnullvm':
        raise ValueError('unreviewed payload target')
    payload = evidence.parent / 'gnu-napi-native-payload'
    payload.mkdir()
    shutil.copyfile(binary, payload / 'ktav_napi.node')
    for name in ['LICENSE-MIT', 'LICENSE-APACHE']:
        shutil.copyfile(name, payload / name)
    for name in ['NOTICE.json', 'NOTICE.json.gz', 'NOTICE.cargo-std.json', 'NOTICE.windows-runtime.txt', 'COPYRIGHT-library.html', 'Cargo.original.lock', 'Cargo.variant.lock', 'Cargo.lock', 'napi-gnullvm-runtime.json', 'binary-verification.json', 'native-runtime-verification.json', 'link-input-fingerprints.json']:
        shutil.copyfile(evidence / name, payload / name)
    shutil.copytree(evidence / 'runtime-originals', payload / 'runtime-originals')
    shutil.copytree('ci/licenses/rust-compiler-originals', payload / 'rust-compiler-originals')
    shutil.copyfile('ci/rust-compiler-notices.json', payload / 'rust-compiler-notices.json')
    variant = json.loads((evidence / 'source-variant.json').read_text(encoding='utf-8'))
    config = variant.pop('config')
    notice = json.loads((evidence / 'NOTICE.json').read_text(encoding='utf-8'))
    if notice['source_variant'] != variant or sha((evidence / 'NOTICE.json').read_bytes()) != verified['notice_sha256']:
        raise ValueError('staged source/notice provenance differs')
    for name, expected in [('crates/napi/build.rs', variant['notice_overlay']['project_build']['compiled_sha256']), ('crates/napi/src/lib.rs', variant['notice_overlay']['binding_lib']['compiled_sha256']), ('crates/napi/Cargo.toml', next(item['compiled_sha256'] for item in variant['overlays'] if item['role'] == 'project-manifest'))]:
        if sha(Path(name).read_bytes()) != expected:
            raise ValueError('compiled first-party source changed before staging')
    write_json(payload / 'source-variant.json', variant)
    source = payload / 'source'
    source.mkdir()
    subprocess.run(['git', 'archive', '--format=tar', '--output=' + str(source / 'project-original.tar'), variant['source_ref']], check=True)
    for name in ['crates/napi/build.rs', 'crates/napi/Cargo.toml', 'crates/napi/src/lib.rs']:
        destination = source / 'overlays' / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(name, destination)
    vendor = Path(tomllib.loads(config)['patch']['crates-io']['napi']['path']).resolve()
    with tarfile.open(source / 'napi-3.15.0-source.tar.gz', 'w:gz') as archive:
        for path in sorted(vendor.rglob('*')):
            if path.is_symlink() or not (path.is_file() or path.is_dir()):
                raise ValueError('unexpected source entry')
            if path.is_file():
                archive.add(path, arcname='napi-3.15.0/' + path.relative_to(vendor).as_posix(), recursive=False)
    config_path = source / 'overlays/.cargo/config.toml'
    config_path.parent.mkdir(parents=True, exist_ok=True)
    original_config = Path('ci/fixtures/windows-gnu-napi/project-config.toml.txt').read_bytes()
    relocatable = original_config + b'\n[patch.crates-io]\nnapi = { path = "vendor/napi-3.15.0" }\n'
    tomllib.loads(relocatable.decode())
    config_path.write_bytes(relocatable)
    (source / 'README.txt').write_text(
        'Source materials for the explicit GNU NAPI candidate, not the historical registry graph.\n'
        'Extract project-original.tar into a new project directory. Apply overlays/ there.\n'
        'Extract napi-3.15.0-source.tar.gz under that project vendor/ directory.\n'
        'Use Cargo.variant.lock as Cargo.lock. Preserve the original MIT and Apache-2.0 licenses.\n'
        'NOTICE.json.gz is the exact build-time KTAV_NAPI_NOTICES_GZIP input.\n'
        'Compiler, target and LLVM MinGW identities are recorded in the notice and evidence.\n'
        'These are source/provenance materials, not a claim of bit-for-bit reproducibility.\n', encoding='utf-8')
    files = []
    for path in sorted(payload.rglob('*')):
        if path.is_file():
            raw = path.read_bytes()
            files.append({'path': path.relative_to(payload).as_posix(), 'bytes': len(raw), 'sha256': sha(raw)})
    write_json(payload / 'native-payload-manifest.json', {'schema_version': 1, 'target': target, 'source_ref': variant['source_ref'], 'binary_sha256': identity['binary_sha256'], 'notice_sha256': verified['notice_sha256'], 'files': files, 'scope': 'GNU source-bound native candidate with complete legal/source roles; not npm assembly or historical package clearance. ARM execution not claimed.'})
    print(str(payload))


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == 'capture':
        write_json(Path(sys.argv[3]), fingerprints(Path(sys.argv[2])))
    elif len(sys.argv) == 5 and sys.argv[1] == 'stage':
        stage(Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4])
    else:
        raise SystemExit('usage: stage_gnu_napi_variant.py capture REPRO OUTPUT | stage EVIDENCE BINARY TARGET')
