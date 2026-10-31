"""Проверить explicit source-backed license supplements."""

import copy
import hashlib
import json
from pathlib import Path
import tomllib


def supplement_fallbacks(metadata, report, lock_bytes, catalog_path):
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    reviewed = {item['name']: item for item in catalog['packages']}
    if len(reviewed) != len(catalog['packages']):
        raise ValueError('duplicate source supplement review')
    packages = {item['id']: item for item in metadata['packages']}
    locks = tomllib.loads(lock_bytes.decode('utf-8'))['package']
    combined = copy.deepcopy(report)
    verified = []
    licenses = []
    for entry in combined['licenses']:
        if entry.get('source_path'):
            licenses.append(entry)
            continue
        if entry.get('id') != 'MIT' or not entry.get('used_by'):
            raise ValueError('unreviewed license fallback')
        for use in entry['used_by']:
            package = packages[use['crate']['id']]
            review = reviewed.get(package['name'])
            if review is None or package['version'] != review['version'] or package.get('license') != review['declared_license'] or package.get('source') != 'registry+https://github.com/rust-lang/crates.io-index':
                raise ValueError('unreviewed fallback package identity')
            locked = [item for item in locks if item['name'] == review['name'] and item['version'] == review['version']]
            if len(locked) != 1 or locked[0].get('checksum') != review['crate_checksum']:
                raise ValueError('fallback source checksum changed')
            root = Path(package['manifest_path']).parent
            vcs = json.loads((root / '.cargo_vcs_info.json').read_text(encoding='utf-8'))
            if vcs != review['vcs']:
                raise ValueError('fallback source VCS changed')
            text = review['license_text']
            if hashlib.sha256(text.encode('utf-8')).hexdigest() != review['license_sha256']:
                raise ValueError('fallback source license changed')
            if review.get('crate_license_path'):
                source = root / review['crate_license_path']
                if source.is_symlink() or not source.resolve().is_relative_to(root.resolve()) or source.read_bytes() != text.encode('utf-8'):
                    raise ValueError('published fallback license differs from review')
            licenses.append({'name': 'MIT', 'id': 'MIT', 'first_of_kind': False, 'text': text,
                             'source_path': str(catalog_path), 'used_by': [use],
                             'origin': 'reviewed-source-supplement'})
            verified.append({key: value for key, value in review.items() if key != 'license_text'})
    combined['licenses'] = licenses
    return combined, verified
