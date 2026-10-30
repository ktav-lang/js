"""Подготовить notices свежего CI lock, не выдавая его за historical graph."""

import gzip
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tomllib

from cargo_notice_bundle import _build


def prepare(evidence):
    root = Path.cwd().resolve()
    evidence = evidence.resolve()
    if evidence.is_relative_to(root) or evidence.exists():
        raise ValueError('JS evidence must be new and outside source')
    lock = root / 'Cargo.lock'
    if lock.exists():
        raise ValueError('published JS source unexpectedly has Cargo.lock')
    subprocess.run(['cargo', 'generate-lockfile'], check=True)
    subprocess.run(['cargo', 'update', '-p', 'ktav', '--precise', '0.8.1'], check=True)
    original = lock.read_bytes()
    core = [item for item in tomllib.loads(original.decode())['package'] if item['name'] == 'ktav']
    if len(core) != 1 or core[0]['version'] != '0.8.1' or core[0].get('checksum') != '7140dfe2fa6c320e74768cd6a637828c2d26f81746254f4fcd805f3993bd3fd5' or core[0].get('source') != 'registry+https://github.com/rust-lang/crates.io-index':
        raise ValueError('unexpected JS registry core source')
    raw = subprocess.check_output(['cargo', 'metadata', '--locked', '--all-features', '--format-version', '1'])
    metadata = json.loads(raw)
    own = [item for item in metadata['packages'] if item.get('source') is None]
    if {item['name'] for item in own} != {'ktav-cabi', 'ktav-napi', 'ktav-wasm'}:
        raise ValueError('unexpected JS workspace packages')
    for package in own:
        package_root = Path(package['manifest_path']).resolve().parent
        if not package_root.is_relative_to(root) or package.get('license') != 'MIT OR Apache-2.0':
            raise ValueError('unexpected own JS source license')
        for name in ('LICENSE-MIT', 'LICENSE-APACHE'):
            source, target = root / name, package_root / name
            if target.is_symlink() or (target.exists() and target.read_bytes() != source.read_bytes()):
                raise ValueError('own JS crate license differs')
            if not target.exists():
                shutil.copyfile(source, target)
    evidence.mkdir()
    (evidence / 'metadata.json').write_bytes(raw)
    (evidence / 'Cargo.lock').write_bytes(original)
    (evidence / 'rustc.txt').write_bytes(subprocess.check_output(['rustc', '--version', '--verbose']))
    sysroot = subprocess.check_output(['rustc', '--print', 'sysroot'], text=True).strip()
    shutil.copyfile(Path(sysroot) / 'share/doc/rust/COPYRIGHT-library.html', evidence / 'COPYRIGHT-library.html')
    report = subprocess.check_output(['cargo', 'about', 'generate', '--locked', '--all-features', '--fail', '--config', 'ci/about.toml', '--format', 'json'])
    (evidence / 'licenses.json').write_bytes(report)
    bundle = json.loads(_build(evidence))
    bundle['resolution_origin'] = 'Fresh CI resolution for published JS source 0.8.1; not historical published dependency evidence.'
    data = (json.dumps(bundle, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()
    payload = gzip.compress(data, mtime=0)
    if len(data) > 64 * 1024 * 1024 or len(payload) > 4 * 1024 * 1024 or lock.read_bytes() != original:
        raise ValueError('JS notice bounds exceeded or lock changed')
    (evidence / 'NOTICE.json').write_bytes(data)
    (evidence / 'NOTICE.json.gz').write_bytes(payload)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: prepare_js_notices.py NEW_EVIDENCE_DIRECTORY')
    prepare(Path(sys.argv[1]))
