"""Собрать и проверить девять source-bound npm tarballs без публикации."""

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_native_npm import DOCS, assemble
from check_native_npm import unpack, verify as verify_native
from check_wasm_npm import verify as verify_wasm
from native_npm_payload import LICENSES, LOCK, SOURCE, TARGETS, files, read, relative, sha

DOC_UNIT = 'root-docs/PLATFORM-README/overview/body-1.md'
DOC_SHA = '35f1387f0566eea501c65a7f378076afe1a6d9f17725fd8168bf5fc21fa58a58'


def apply_documentation(root, tooling):
    manifest = json.loads(read(root / 'platform-readme-manifest.json', 4 * 1024 * 1024))
    expected = {'npm/' + rid + '/' + name for rid in TARGETS for name in DOCS}
    rows = manifest['files']
    if manifest['source_ref'] != SOURCE or manifest['tooling_ref'] != tooling or manifest['unit'] != DOC_UNIT or manifest['unit_sha256'] != DOC_SHA or len(rows) != len(expected) or {item['path'] for item in rows} != expected:
        raise ValueError('generated platform documentation identity differs')
    if {item['path'] for item in files(root)} != expected | {'platform-readme-manifest.json'}:
        raise ValueError('generated platform documentation role set differs')
    for item in rows:
        relative(item['path'])
        raw = read(root / item['path'], 4 * 1024 * 1024)
        if len(raw) != item['bytes'] or sha(raw) != item['sha256']:
            raise ValueError('generated platform documentation bytes differ')
        destination = Path(item['path'])
        read(destination, 4 * 1024 * 1024)
        destination.write_bytes(raw)


def verify_main(root, tooling):
    manifest = json.loads(read(root / 'main-package-manifest.json', 4 * 1024 * 1024))
    name = manifest['archive']
    if Path(name).name != name or name != 'ktav-lang-ktav-0.8.1.tgz' or manifest['package'] != '@ktav-lang/ktav' or manifest['version'] != '0.8.1' or manifest['source_ref'] != SOURCE or manifest['tooling_ref'] != tooling:
        raise ValueError('main package producer identity differs')
    rows = manifest['files']
    expected = {name, 'NOTICE.json', 'Cargo.lock', 'COPYRIGHT-library.html', 'source-provenance.json', 'npm-verification.json'}
    if len(rows) != len(expected) or {item['path'] for item in rows} != expected or sorted(rows, key=lambda item: item['path']) != [item for item in files(root) if item['path'] != 'main-package-manifest.json']:
        raise ValueError('complete main package producer role set differs')
    lock = read(root / 'Cargo.lock', 4 * 1024 * 1024)
    provenance = json.loads(read(root / 'source-provenance.json'))
    if sha(lock) != LOCK or provenance['source_ref'] != SOURCE or provenance['tooling_ref'] != tooling or provenance['platform_documentation_overlay']['compiled_sha256'] != DOC_SHA:
        raise ValueError('main package source/lock/documentation binding differs')
    archive = root / name
    original = json.loads(read(root / 'npm-verification.json'))
    with tempfile.TemporaryDirectory(prefix='ktav-packed-main-') as temporary:
        package = Path(temporary) / 'package'
        unpack(archive, package)
        actual = verify_wasm(archive, root, package)
        for key in ['package_sha256', 'notice_sha256', 'wasm', 'inline_matches_web']:
            if actual[key] != original[key]:
                raise ValueError('packed main package differs from producer verification')
        for filename in ['NOTICE.json', 'Cargo.lock', 'COPYRIGHT-library.html', 'source-provenance.json']:
            if read(package / 'dist/wasm' / filename) != read(root / filename):
                raise ValueError('packed main source/legal role differs')
        for filename, expected_sha in LICENSES.items():
            if sha(read(package / filename, 64 * 1024)) != expected_sha:
                raise ValueError('packed main first-party license differs')
        metadata = json.loads(read(package / 'package.json', 1024 * 1024))
        expected_optional = {'@ktav-lang/js-' + rid: '0.8.1' for rid in TARGETS}
        if metadata['optionalDependencies'] != expected_optional or metadata['license'] != 'MIT OR Apache-2.0':
            raise ValueError('main optional dependency versions or license differ')
        notice = json.loads(read(package / 'dist/wasm/NOTICE.json'))
        if notice['cargo_lock_sha256'] != sha(lock):
            raise ValueError('packed main notice lock differs')
    return archive, actual


def pack(payloads, documentation, main, layout, output):
    if subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() != SOURCE:
        raise ValueError('npm assembly requires exact original project source')
    protected = subprocess.check_output(['git', 'diff', '--name-only', '--', 'Cargo.toml', 'crates', 'package.json', 'package-lock.json'], text=True).splitlines()
    if protected:
        raise ValueError('npm assembly changed protected original source')
    tooling = None
    for rid in TARGETS:
        for role in ['napi', 'cabi']:
            record = json.loads(read(payloads / (rid + '-' + role) / 'native-role-manifest.json', 4 * 1024 * 1024))
            if tooling is not None and record['tooling_ref'] != tooling:
                raise ValueError('native producer tooling identities differ')
            tooling = record['tooling_ref']
    apply_documentation(documentation, tooling)
    main_archive, main_verification = verify_main(main, tooling)
    assemble(payloads, Path('npm'), layout)
    output.mkdir()
    records = []
    npm = shutil.which('npm')
    if npm is None:
        raise ValueError('npm packing tool missing')
    for rid in TARGETS:
        result = subprocess.check_output([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', str(output.resolve()), str((layout / rid).resolve())])
        packed = json.loads(result)
        expected_name = 'ktav-lang-js-' + rid + '-0.8.1.tgz'
        if len(packed) != 1 or packed[0]['filename'] != expected_name:
            raise ValueError('unexpected native npm archive identity')
        archive = output / expected_name
        verification = verify_native(archive, rid)
        records.append({'package': verification['package'], 'version': '0.8.1', 'rid': rid, 'archive': archive.name, 'bytes': archive.stat().st_size, 'sha256': verification['package_sha256'], 'roles': verification['roles']})
    shutil.copyfile(main_archive, output / main_archive.name)
    if sha(read(output / main_archive.name, 128 * 1024 * 1024)) != main_verification['package_sha256']:
        raise ValueError('staged main archive bytes differ')
    records.append({'package': '@ktav-lang/ktav', 'version': '0.8.1', 'archive': main_archive.name, 'bytes': main_archive.stat().st_size, 'sha256': main_verification['package_sha256'], 'wasm': main_verification['wasm']})
    manifest = {'schema_version': 1, 'source_ref': SOURCE, 'tooling_ref': tooling, 'documentation_unit_sha256': DOC_SHA, 'packages': records, 'scope': 'Nine actual verified npm tarballs from the shared source-bound build and assembly path. No registry publication, historical immutable package repair or unexecuted native consumer claim.'}
    (output / 'native-npm-release-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'packages': len(records), 'source_ref': SOURCE, 'tooling_ref': tooling, 'version': '0.8.1'}))


if __name__ == '__main__':
    if len(sys.argv) != 6:
        raise SystemExit('usage: pack_native_npm.py PAYLOADS DOCUMENTATION MAIN NEW_LAYOUT NEW_OUTPUT')
    pack(*map(Path, sys.argv[1:]))
