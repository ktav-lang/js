"""Подготовить отдельный checksum-bound GNU NAPI source variant для CI probe."""

import copy
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile
import tomllib

SOURCE = '562deb3fde092d63a78f359be095e5079929d0d1'
LOCK_SHA = 'c09c21c421fda8a5411f756f5df5718de41d4cf92ad237150592011f9f785932'
CRATE_SHA = '6a746ad50efbfb632ade1de4025519a477decbbd798cea1a6ac41d7c44f80083'
UPSTREAM_BUILD_SHA = 'd3f2246f3b089952ed196dbaccb8e0eb0ef76158d00b1b555bf98b1900b89896'
PROJECT_BUILD_SHA = '344b64fc51ed77a113276f54c25273d41cabac6ab3c2aedfdb88e540f6d4c19d'
MANIFEST_SHA = '8e5b0dad0bf4ae7de4084b867be68275e5c08b51ed9aadfa10a89a43d9b672f0'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path, limit):
    if path.is_symlink() or not path.is_file():
        raise ValueError('missing or symlinked variant input')
    with path.open('rb') as source:
        raw = source.read(limit + 1)
    if len(raw) > limit:
        raise ValueError('variant input exceeds bound')
    return raw


def replace_once(raw, old, new):
    if raw.count(old) != 1:
        raise ValueError('variant source anchor differs')
    return raw.replace(old, new)


def patch_upstream(raw):
    if sha(raw) != UPSTREAM_BUILD_SHA:
        raise ValueError('unreviewed napi build script')
    old = b'if target_os == "windows" && target_env == "gnu" {'
    new = b'if target_os == "windows" && target_env == "gnu"\n    && std::env::var_os("CARGO_FEATURE_DYN_SYMBOLS").is_none() {'
    return replace_once(raw, old, new)


def patch_project(raw):
    if sha(raw) != PROJECT_BUILD_SHA:
        raise ValueError('unreviewed first-party NAPI build script')
    old = b'    napi_build::setup();'
    new = b'    if !(std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")\n        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("gnu")) {\n        napi_build::setup();\n    }'
    return replace_once(raw, old, new)


def patch_manifest(raw):
    if sha(raw) != MANIFEST_SHA:
        raise ValueError('unreviewed first-party NAPI manifest')
    return replace_once(raw, b'features = ["napi8", "compat-mode"]', b'features = ["napi8", "compat-mode", "dyn-symbols"]')


def verify_lock(before, after):
    if before.get('version') not in {3, 4} or after.get('version') not in {3, 4}:
        raise ValueError('unreviewed variant lock format')
    expected = copy.deepcopy(before['package'])
    original = [item for item in expected if item['name'] == 'napi']
    if len(original) != 1 or original[0]['version'] != '3.15.0' or original[0].get('checksum') != CRATE_SHA:
        raise ValueError('original napi registry identity differs')
    original[0].pop('source')
    original[0].pop('checksum')
    order = lambda item: (item['name'], item['version'], item.get('source', ''))
    if sorted(expected, key=order) != sorted(after['package'], key=order):
        raise ValueError('variant changes packages beyond the explicit napi source identity')


def unpack(archive_path, destination):
    raw = read(archive_path, 8 * 1024 * 1024)
    if sha(raw) != CRATE_SHA:
        raise ValueError('original napi archive checksum differs')
    destination.mkdir()
    with tarfile.open(archive_path, 'r:gz') as archive:
        entries = archive.getmembers()
        if len(entries) > 4096 or sum(item.size for item in entries) > 64 * 1024 * 1024:
            raise ValueError('napi source archive exceeds bounds')
        seen = set()
        for item in entries:
            path = PurePosixPath(item.name)
            if path.is_absolute() or '..' in path.parts or '\\' in item.name or ':' in item.name or not path.parts or path.parts[0] != 'napi-3.15.0' or item.name.casefold() in seen or not (item.isdir() or item.isfile()):
                raise ValueError('unsafe or duplicate napi source entry')
            seen.add(item.name.casefold())
            target = destination.joinpath(*path.parts)
            if item.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                if item.size > 4 * 1024 * 1024:
                    raise ValueError('napi source member exceeds bound')
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(item) as source, target.open('xb') as output:
                    content = source.read(4 * 1024 * 1024 + 1)
                    if len(content) != item.size:
                        raise ValueError('napi source member size differs')
                    output.write(content)
    return destination / 'napi-3.15.0'


def prepare(archive_path, vendor_directory, evidence):
    if subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() != SOURCE:
        raise ValueError('variant requires exact original 0.8.1 source')
    lock = read(Path('Cargo.lock'), 4 * 1024 * 1024)
    if sha(lock) != LOCK_SHA:
        raise ValueError('variant requires exact reviewed original lock')
    evidence.mkdir()
    (evidence / 'Cargo.original.lock').write_bytes(lock)
    before_source = read(Path('crates/napi/src/lib.rs'), 1024 * 1024)
    vendor = unpack(archive_path, vendor_directory)
    overlays = []
    for role, path, patch in [('upstream-build', vendor / 'build.rs', patch_upstream), ('project-build', Path('crates/napi/build.rs'), patch_project), ('project-manifest', Path('crates/napi/Cargo.toml'), patch_manifest)]:
        original = read(path, 1024 * 1024)
        changed = patch(original)
        path.write_bytes(changed)
        overlays.append({'role': role, 'original_sha256': sha(original), 'compiled_sha256': sha(changed)})
    config = 'patch.crates-io.napi.path=' + json.dumps(str(vendor.resolve()))
    command = ['cargo', 'metadata', '--offline', '--format-version', '1', '--manifest-path', 'crates/napi/Cargo.toml', '--config', config]
    metadata_raw = subprocess.check_output(command)
    metadata = json.loads(metadata_raw)
    after_lock = read(Path('Cargo.lock'), 4 * 1024 * 1024)
    verify_lock(tomllib.loads(lock.decode()), tomllib.loads(after_lock.decode()))
    for name, version in [('napi', '3.15.0'), ('napi-sys', '3.4.1')]:
        packages = [item for item in metadata['packages'] if item['name'] == name and item['version'] == version]
        if len(packages) != 1:
            raise ValueError('expected exact dynamic NAPI package identity')
        if name == 'napi' and (packages[0].get('source') is not None or Path(packages[0]['manifest_path']).resolve() != (vendor / 'Cargo.toml').resolve()):
            raise ValueError('variant did not select the explicit patched source')
        nodes = [item for item in metadata['resolve']['nodes'] if item['id'] == packages[0]['id']]
        if len(nodes) != 1 or 'dyn-symbols' not in nodes[0]['features']:
            raise ValueError('GNU probe requires actual resolved dyn-symbols')
    if read(Path('crates/napi/src/lib.rs'), 1024 * 1024) != before_source:
        raise ValueError('variant changed parser binding source')
    changed = subprocess.check_output(['git', 'diff', '--name-only', '--', 'Cargo.toml', '.cargo', 'crates', 'ts', 'tests', 'package.json', 'package-lock.json'], text=True).splitlines()
    if set(changed) != {'crates/napi/build.rs', 'crates/napi/Cargo.toml'}:
        raise ValueError('variant changed unreviewed first-party source files')
    (evidence / 'Cargo.variant.lock').write_bytes(after_lock)
    (evidence / 'metadata.variant.json').write_bytes(metadata_raw)
    record = {'source_ref': SOURCE, 'upstream_archive_sha256': CRATE_SHA, 'original_lock_sha256': LOCK_SHA, 'variant_lock_sha256': sha(after_lock), 'binding_lib_sha256': sha(before_source), 'overlays': overlays, 'config': config, 'scope': 'Explicit experimental source/feature variant, not the original registry graph, production build or historical package. Other locked packages unchanged.'}
    (evidence / 'source-variant.json').write_text(json.dumps(record, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    return config


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('usage: windows_gnu_napi_variant.py ARCHIVE NEW_VENDOR_DIRECTORY NEW_EVIDENCE_DIRECTORY')
    print(prepare(*map(Path, sys.argv[1:])))
