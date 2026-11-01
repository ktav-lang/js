"""Собрать полный notice explicit GNU source variant без ослабления original guards."""

import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tomllib

sys.path.insert(0, str(Path(__file__).resolve().parent))

from cargo_notice_bundle import _build
from napi_gnullvm_notices import catalogue
from rust_compiler_notices import collect as compiler_notices
from source_license_supplements import supplement_fallbacks
from windows_gnu_napi_variant import CRATE_SHA, LOCK_SHA, SOURCE, verify_lock

CONFIG_SHA = 'a07d75d5baee5944ed39294edea0c6d7adab50fb3b0aa7dea7d31b672c83ce2e'
RESOURCE_SHA = '8ef48240113ac78b88b612ad044a1584ccd4b0050d155b05d0cfcd89f50518e9'
NAPI_VCS = 'd9cb526c15e63ba30e06b4d169068c9854180595'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def configure(original, vendor):
    if sha(original) != CONFIG_SHA or 'patch' in tomllib.loads(original.decode('utf-8')):
        raise ValueError('unreviewed original Cargo config')
    appended = '\n[patch.crates-io]\nnapi = { path = ' + json.dumps(vendor.as_posix()) + ' }\n'
    changed = original + appended.encode('utf-8')
    parsed = tomllib.loads(changed.decode('utf-8'))
    parsed.pop('patch')
    if parsed != tomllib.loads(original.decode('utf-8')):
        raise ValueError('variant changes unrelated Cargo config')
    return changed


def resource_hook(template):
    if sha(template) != RESOURCE_SHA or template.count(b'    napi_build::setup();') != 1:
        raise ValueError('unreviewed notice resource template')
    replacement = b'    if !(std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")\n        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("gnu")) {\n        napi_build::setup();\n    }'
    return template.replace(b'    napi_build::setup();', replacement)


def prepare(evidence, target):
    root = Path.cwd().resolve()
    evidence = evidence.resolve()
    if evidence.is_relative_to(root) or (evidence / 'NOTICE.json').exists():
        raise ValueError('variant evidence must be outside source and not already prepared')
    document = catalogue(root)
    if target not in document['targets']:
        raise ValueError('unreviewed GNU NAPI target')
    variant = json.loads((evidence / 'source-variant.json').read_text(encoding='utf-8'))
    if variant['source_ref'] != SOURCE or variant['original_lock_sha256'] != LOCK_SHA or variant['upstream_archive_sha256'] != CRATE_SHA:
        raise ValueError('unreviewed source variant identity')
    original_lock = (evidence / 'Cargo.original.lock').read_bytes()
    locked = Path('Cargo.lock').read_bytes()
    if sha(original_lock) != LOCK_SHA or sha(locked) != variant['variant_lock_sha256']:
        raise ValueError('source variant lock identity differs')
    verify_lock(tomllib.loads(original_lock.decode()), tomllib.loads(locked.decode()))
    core = [item for item in tomllib.loads(locked.decode())['package'] if item['name'] == 'ktav']
    if len(core) != 1 or core[0]['version'] != '0.8.1' or core[0].get('checksum') != '7140dfe2fa6c320e74768cd6a637828c2d26f81746254f4fcd805f3993bd3fd5':
        raise ValueError('variant registry core changed')
    patch = tomllib.loads(variant['config'])['patch']['crates-io']['napi']
    vendor = Path(patch['path']).resolve()
    vcs = json.loads((vendor / '.cargo_vcs_info.json').read_text(encoding='utf-8'))
    if vcs != {'git': {'sha1': NAPI_VCS}, 'path_in_vcs': 'crates/napi'}:
        raise ValueError('upstream source VCS identity differs')
    grant = [item for item in document['original_documents'] if item['source'] == 'https://raw.githubusercontent.com/napi-rs/napi-rs/' + NAPI_VCS + '/LICENSE']
    if len(grant) != 1 or sha(grant[0]['text'].encode()) != grant[0]['sha256']:
        raise ValueError('complete original upstream NAPI grant missing')
    license_path = vendor / 'LICENSE'
    if license_path.exists() or license_path.is_symlink():
        raise ValueError('upstream license attachment already exists')
    license_path.write_bytes(grant[0]['text'].encode('utf-8'))
    config_path = Path('.cargo/config.toml')
    before_config = config_path.read_bytes()
    changed_config = configure(before_config, vendor)
    config_path.write_bytes(changed_config)
    project_hook = Path('crates/napi/build.rs')
    previous_hook = project_hook.read_bytes()
    expected_hook = [item for item in variant['overlays'] if item['role'] == 'project-build']
    if len(expected_hook) != 1 or sha(previous_hook) != expected_hook[0]['compiled_sha256']:
        raise ValueError('variant project hook differs before resource overlay')
    template = (root / 'ci/fixtures/windows-gnu-napi/resource-build.rs.txt').read_bytes()
    changed_hook = resource_hook(template)
    project_hook.write_bytes(changed_hook)
    lib = Path('crates/napi/src/lib.rs')
    before_lib = lib.read_bytes()
    if sha(before_lib) != variant['binding_lib_sha256']:
        raise ValueError('original binding source differs before notice overlay')
    subprocess.run([sys.executable, '-I', 'scripts/patch_napi_notice_source.py', str(lib)], check=True)
    raw = subprocess.check_output(['cargo', 'metadata', '--locked', '--all-features', '--format-version', '1'])
    metadata = json.loads(raw)
    local = [item for item in metadata['packages'] if item.get('source') is None]
    if {item['name'] for item in local} != {'ktav-cabi', 'ktav-napi', 'ktav-wasm', 'napi'}:
        raise ValueError('unreviewed local package in variant graph')
    for item in local:
        package_root = Path(item['manifest_path']).resolve().parent
        if item['name'] == 'napi':
            if item['version'] != '3.15.0' or item.get('license') != 'MIT' or package_root != vendor:
                raise ValueError('patched NAPI source/license identity differs')
            continue
        if item.get('license') != 'MIT OR Apache-2.0' or not package_root.is_relative_to(root):
            raise ValueError('first-party variant license changed')
        for name in ('LICENSE-MIT', 'LICENSE-APACHE'):
            source, destination = root / name, package_root / name
            if destination.is_symlink() or destination.exists() and destination.read_bytes() != source.read_bytes():
                raise ValueError('first-party license copy differs')
            if not destination.exists():
                shutil.copyfile(source, destination)
    (evidence / 'metadata.json').write_bytes(raw)
    (evidence / 'Cargo.lock').write_bytes(locked)
    rustc = subprocess.check_output(['rustc', '--version', '--verbose'])
    (evidence / 'rustc.txt').write_bytes(rustc)
    sysroot = subprocess.check_output(['rustc', '--print', 'sysroot'], text=True).strip()
    shutil.copyfile(Path(sysroot) / 'share/doc/rust/COPYRIGHT-library.html', evidence / 'COPYRIGHT-library.html')
    report = subprocess.check_output(['cargo', 'about', 'generate', '--locked', '--all-features', '--fail', '--config', 'ci/about.toml', '--format', 'json'])
    (evidence / 'licenses-cargo-about.json').write_bytes(report)
    combined, provenance = supplement_fallbacks(metadata, json.loads(report), locked, root / 'ci/licenses/js-source-supplements.json')
    combined['source_license_supplements'] = provenance
    (evidence / 'licenses.json').write_text(json.dumps(combined, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    bundle = json.loads(_build(evidence))
    bundle['rust_compiler_builtins'] = compiler_notices(root, bundle['rustc'])
    variant['notice_overlay'] = {'resource_template_sha256': RESOURCE_SHA, 'project_build': {'before_sha256': sha(previous_hook), 'compiled_sha256': sha(changed_hook)}, 'binding_lib': {'before_sha256': sha(before_lib), 'compiled_sha256': sha(lib.read_bytes())}, 'cargo_config': {'before_sha256': sha(before_config), 'compiled_sha256': sha(changed_config)}, 'upstream_license_sha256': grant[0]['sha256']}
    bundle['source_variant'] = {key: value for key, value in variant.items() if key != 'config'}
    bundle['source_license_supplements'] = provenance
    bundle['resolution_origin'] = 'Explicit checksum-bound patched NAPI source and feature variant; not the original registry graph or historical published dependency evidence.'
    data = (json.dumps(bundle, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')
    compressed = gzip.compress(data, mtime=0)
    if len(data) > 64 * 1024 * 1024 or len(compressed) > 4 * 1024 * 1024 or Path('Cargo.lock').read_bytes() != locked:
        raise ValueError('variant notice bounds exceeded or compiled lock changed')
    (evidence / 'NOTICE.json').write_bytes(data)
    (evidence / 'NOTICE.json.gz').write_bytes(compressed)
    (evidence / 'source-variant.json').write_text(json.dumps(variant, sort_keys=True, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: prepare_gnu_napi_variant_notices.py EVIDENCE TARGET')
    prepare(Path(sys.argv[1]), sys.argv[2])
