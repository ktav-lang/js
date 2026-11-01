"""Собрать восемь npm platform packages из полных проверенных native ролей."""

import json
from pathlib import Path
import shutil
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from native_npm_payload import LICENSES, SOURCE, TARGETS, contract, files, identity, read, relative, sha


DOCS = ['README.md', 'README.ru.md', 'README.zh.md']


def package_identity(metadata, rid):
    target, binary = identity(rid, 'napi')
    os_name = 'win32' if rid.startswith('win32-') else 'darwin' if rid.startswith('darwin-') else 'linux'
    arch = 'arm64' if target.startswith('aarch64-') else 'x64'
    if metadata['name'] != '@ktav-lang/js-' + rid or metadata['version'] != '0.8.1' or metadata.get('license') != 'MIT OR Apache-2.0' or metadata.get('main') != binary or metadata.get('cpu') != [arch] or metadata.get('os') != [os_name]:
        raise ValueError('original platform package identity differs')
    if any(metadata.get(name) for name in ['scripts', 'dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies']):
        raise ValueError('native platform package must not fetch runtime dependencies or run lifecycle scripts')
    if not isinstance(metadata.get('files'), list) or any(not isinstance(name, str) for name in metadata['files']):
        raise ValueError('original platform package files allowlist missing')
    for name in metadata['files']:
        relative(name)


def assemble_platform(rid, inputs, template, output):
    if set(inputs) != {'napi', 'cabi'}:
        raise ValueError('exact NAPI/CABI role pair required')
    records = {role: contract(inputs[role], rid, role) for role in ['napi', 'cabi']}
    if records['napi']['tooling_ref'] != records['cabi']['tooling_ref']:
        raise ValueError('NAPI/CABI producer tooling identities differ')
    metadata = json.loads(read(template / 'package.json', 1024 * 1024))
    package_identity(metadata, rid)
    documents = {name: read(template / name, 4 * 1024 * 1024) for name in DOCS}
    output.mkdir()
    for name, raw in documents.items():
        (output / name).write_bytes(raw)
    for name, expected in LICENSES.items():
        raw = read(inputs['napi'] / name, 64 * 1024)
        if sha(raw) != expected or read(inputs['cabi'] / name, 64 * 1024) != raw:
            raise ValueError('platform first-party license differs across roles')
        (output / name).write_bytes(raw)
    roles = {}
    for role, record in records.items():
        filename = record['package_binary']
        shutil.copyfile(inputs[role] / 'binary', output / filename)
        destination = output / 'third_party' / role
        shutil.copytree(inputs[role] / 'legal', destination)
        original_manifest = read(inputs[role] / 'native-role-manifest.json', 4 * 1024 * 1024)
        (destination / 'producer-role-manifest.json').write_bytes(original_manifest)
        roles[role] = {'actual_target': record['actual_target'], 'package_binary': filename, 'notice': 'third_party/' + role + '/NOTICE.json', 'binary_sha256': record['binary_sha256'], 'notice_sha256': record['notice_sha256'], 'producer_manifest': 'third_party/' + role + '/producer-role-manifest.json', 'producer_manifest_sha256': sha(original_manifest), 'relocation': {'binary': filename, 'legal/': 'third_party/' + role + '/', 'LICENSE-MIT': 'LICENSE-MIT', 'LICENSE-APACHE': 'LICENSE-APACHE'}}
    required = [identity(rid, role)[1] for role in ['napi', 'cabi']] + list(LICENSES) + DOCS + ['third_party/', 'native-package-manifest.json']
    metadata['files'] = list(dict.fromkeys([*metadata['files'], *required]))
    (output / 'package.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    manifest = {'schema_version': 1, 'package': metadata['name'], 'version': '0.8.1', 'rid': rid, 'source_ref': SOURCE, 'tooling_ref': records['napi']['tooling_ref'], 'roles': roles, 'files': files(output), 'scope': 'Actual npm platform layout with distinct complete NAPI/CABI legal and source roles. Windows msvc package names remain compatibility identifiers, not compiler-target claims.'}
    (output / 'native-package-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    verify_platform(output, rid)
    return manifest


def verify_platform(root, rid):
    document = json.loads(read(root / 'native-package-manifest.json', 4 * 1024 * 1024))
    metadata = json.loads(read(root / 'package.json', 1024 * 1024))
    package_identity(metadata, rid)
    if document['schema_version'] != 1 or document['rid'] != rid or document['package'] != metadata['name'] or document['version'] != '0.8.1' or document['source_ref'] != SOURCE or set(document['roles']) != {'napi', 'cabi'}:
        raise ValueError('assembled platform manifest identity differs')
    rows = document['files']
    if len(rows) != len({item['path'] for item in rows}) or sorted(rows, key=lambda item: item['path']) != [item for item in files(root) if item['path'] != 'native-package-manifest.json']:
        raise ValueError('assembled platform file bytes or role coverage differ')
    expected_paths = {'package.json', *DOCS, *LICENSES}
    for role in ['napi', 'cabi']:
        record = document['roles'][role]
        target, filename = identity(rid, role)
        if record['actual_target'] != target or record['package_binary'] != filename or record['notice'] != 'third_party/' + role + '/NOTICE.json' or record['producer_manifest'] != 'third_party/' + role + '/producer-role-manifest.json':
            raise ValueError('assembled native role identity differs')
        raw_manifest = read(root / record['producer_manifest'], 4 * 1024 * 1024)
        source = json.loads(raw_manifest)
        if sha(raw_manifest) != record['producer_manifest_sha256'] or source['rid'] != rid or source['role'] != role or source['actual_target'] != target or source['source_ref'] != SOURCE or source['tooling_ref'] != document['tooling_ref'] or source['binary_sha256'] != record['binary_sha256'] or source['notice_sha256'] != record['notice_sha256']:
            raise ValueError('producer manifest identity changed during assembly')
        expected_paths.add(record['producer_manifest'])
        names = set()
        for item in source['files']:
            relative(item['path'])
            if item['path'] in names:
                raise ValueError('duplicate original producer role')
            names.add(item['path'])
            if item['path'] == 'binary':
                destination = filename
            elif item['path'] in LICENSES:
                destination = item['path']
            elif item['path'].startswith('legal/'):
                destination = 'third_party/' + role + '/' + item['path'].removeprefix('legal/')
            else:
                raise ValueError('unknown source payload role')
            content = read(root / destination, 128 * 1024 * 1024)
            if len(content) != item['bytes'] or sha(content) != item['sha256']:
                raise ValueError('relocated legal/source/native bytes differ')
            expected_paths.add(destination)
        if 'binary' not in names or 'legal/NOTICE.json' not in names or 'legal/NOTICE.json.gz' not in names:
            raise ValueError('mandatory source producer roles missing')
        with tempfile.TemporaryDirectory(prefix='ktav-native-role-') as temporary:
            restored = Path(temporary)
            for item in source['files']:
                name = item['path']
                destination = filename if name == 'binary' else name if name in LICENSES else 'third_party/' + role + '/' + name.removeprefix('legal/')
                path = restored / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(read(root / destination, 128 * 1024 * 1024))
            (restored / 'native-role-manifest.json').write_bytes(raw_manifest)
            contract(restored, rid, role)
    actual_paths = {item['path'] for item in rows}
    if actual_paths != expected_paths:
        raise ValueError('extra or missing assembled source/legal role')
    for name, expected in LICENSES.items():
        if sha(read(root / name, 64 * 1024)) != expected:
            raise ValueError('assembled first-party license differs')
    return document


def assemble(payloads, templates, output):
    expected = {rid + '-' + role for rid in TARGETS for role in ['napi', 'cabi']}
    entries = list(payloads.iterdir())
    if {path.name for path in entries} != expected or any(path.is_symlink() or not path.is_dir() for path in entries):
        raise ValueError('exact sixteen native role payloads required')
    output.mkdir()
    records = []
    for rid in TARGETS:
        inputs = {role: payloads / (rid + '-' + role) for role in ['napi', 'cabi']}
        records.append(assemble_platform(rid, inputs, templates / rid, output / rid))
    if len({item['tooling_ref'] for item in records}) != 1:
        raise ValueError('platform producer tooling identities differ')
    print(json.dumps({'packages': len(records), 'source_ref': SOURCE, 'tooling_ref': records[0]['tooling_ref'], 'version': '0.8.1'}))


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == 'verify':
        print(json.dumps(verify_platform(Path(sys.argv[2]), sys.argv[3]), ensure_ascii=False))
    elif len(sys.argv) == 5 and sys.argv[1] == 'assemble':
        assemble(Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]))
    else:
        raise SystemExit('usage: assemble_native_npm.py assemble PAYLOADS TEMPLATES NEW_OUTPUT | verify PACKAGE RID')
