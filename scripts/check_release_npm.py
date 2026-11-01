"""Повторно проверить exact nine-package release set перед передачей publisher job."""

import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_native_npm import unpack, verify as verify_native
from check_wasm_npm import verify as verify_wasm
from native_npm_payload import LICENSES, LOCK, SOURCE, TARGETS, read, sha
from pack_native_npm import DOC_SHA
from patch_ffi_package_urls import verify_records as verify_ffi_overlays


def verify(root):
    manifest = json.loads(read(root / 'native-npm-release-manifest.json', 4 * 1024 * 1024))
    expected = {'@ktav-lang/js-' + rid: 'ktav-lang-js-' + rid + '-0.8.1.tgz' for rid in TARGETS}
    expected['@ktav-lang/ktav'] = 'ktav-lang-ktav-0.8.1.tgz'
    records = manifest['packages']
    if manifest['schema_version'] != 1 or manifest['source_ref'] != SOURCE or manifest['documentation_unit_sha256'] != DOC_SHA or len(records) != 9 or {item['package'] for item in records} != set(expected):
        raise ValueError('complete reviewed npm release set differs')
    if any(path.is_symlink() or not path.is_file() for path in root.iterdir()) or {path.name for path in root.iterdir()} != set(expected.values()) | {'native-npm-release-manifest.json'}:
        raise ValueError('release archive inventory differs')
    for item in records:
        if item['version'] != '0.8.1' or item['archive'] != expected[item['package']]:
            raise ValueError('release package version/archive identity differs')
        archive = root / item['archive']
        raw = read(archive, 128 * 1024 * 1024)
        if len(raw) != item['bytes'] or sha(raw) != item['sha256']:
            raise ValueError('release tarball bytes differ')
        if item['package'] != '@ktav-lang/ktav':
            report = verify_native(archive, item['rid'])
            if report['package'] != item['package'] or report['tooling_ref'] != manifest['tooling_ref'] or report['roles'] != item['roles']:
                raise ValueError('packed native role/provenance differs from release index')
            continue
        with tempfile.TemporaryDirectory(prefix='ktav-release-main-') as temporary:
            package = Path(temporary) / 'package'
            unpack(archive, package)
            evidence = package / 'dist/wasm'
            report = verify_wasm(archive, evidence, package)
            provenance = json.loads(read(evidence / 'source-provenance.json'))
            notice = json.loads(read(evidence / 'NOTICE.json'))
            verify_ffi_overlays(provenance['ffi_url_overlays'])
            if report['wasm'] != item['wasm'] or report['package_sha256'] != item['sha256'] or provenance['source_ref'] != SOURCE or provenance['tooling_ref'] != manifest['tooling_ref'] or provenance['platform_documentation_overlay']['compiled_sha256'] != DOC_SHA or sha(read(evidence / 'Cargo.lock', 4 * 1024 * 1024)) != LOCK or notice['cargo_lock_sha256'] != LOCK:
                raise ValueError('main package actual source/resource/lock identity differs')
            copyright_report = read(evidence / 'COPYRIGHT-library.html')
            if not copyright_report.strip() or notice['rust_standard_library']['text'].encode('utf-8') != copyright_report or notice['rust_standard_library']['sha256'] != sha(copyright_report):
                raise ValueError('main package full compiler grant report differs')
            for name, expected_sha in LICENSES.items():
                if sha(read(package / name, 64 * 1024)) != expected_sha:
                    raise ValueError('main package original first-party license differs')
            metadata = json.loads(read(package / 'package.json', 1024 * 1024))
            if metadata['optionalDependencies'] != {'@ktav-lang/js-' + rid: '0.8.1' for rid in TARGETS} or metadata['license'] != 'MIT OR Apache-2.0':
                raise ValueError('main package optional dependency/license metadata differs')
    return {'packages': 9, 'source_ref': SOURCE, 'tooling_ref': manifest['tooling_ref'], 'version': '0.8.1', 'scope': 'Exact actual archive/resource/source/legal release contract. This check does not publish or repair existing registry assets.'}


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: check_release_npm.py PACKED_RELEASE_DIRECTORY')
    print(json.dumps(verify(Path(sys.argv[1])), sort_keys=True, indent=2))
