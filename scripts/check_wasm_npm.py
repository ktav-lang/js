"""Сверить actual npm tarball без исполнения его payload."""

import base64
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
import tarfile

from check_embedded_notices import _extract


def verify(archive_path, evidence, root):
    expected = (evidence / 'NOTICE.json').read_bytes()
    with tarfile.open(archive_path, 'r:gz') as archive:
        files = {}
        for member in archive.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or '\\' in member.name or member.name in files or not member.isfile() or member.size > 64 * 1024 * 1024:
                raise ValueError('unsafe npm tar member')
            files[member.name] = archive.extractfile(member).read()
    wasm_names = {'package/dist/wasm/web/ktav_bg.wasm', 'package/dist/wasm/bundler/ktav_bg.wasm'}
    if {name for name in files if name.endswith('.wasm')} != wasm_names:
        raise ValueError('unexpected WASM payload inventory')
    for name, data in files.items():
        if name in wasm_names:
            if not data.startswith(b'\0asm') or _extract(data)[0] != expected or data != (root / name.removeprefix('package/')).read_bytes():
                raise ValueError('packed WASM differs from built bytes or notice evidence')
        elif data.startswith((b'\x7fELF', b'MZ', b'\0asm', b'!<arch>\n', b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf')) or name.endswith(('.node', '.dll', '.so', '.dylib')):
            raise ValueError('unexpected native payload in main npm package')
    if files['package/dist/wasm/NOTICE.json'] != expected:
        raise ValueError('packed notice sidecar differs')
    inline = files['package/dist/wasm/web/ktav.inline.js']
    matches = re.findall(rb'const __KTAV_INLINE_WASM_BASE64 = ("[A-Za-z0-9+/=]*");', inline)
    if len(matches) != 1 or base64.b64decode(json.loads(matches[0]), validate=True) != files['package/dist/wasm/web/ktav_bg.wasm']:
        raise ValueError('inline WASM differs from standalone packed payload')
    for name in ('LICENSE-MIT', 'LICENSE-APACHE'):
        if files['package/' + name] != (root / name).read_bytes():
            raise ValueError('packed own license differs from source')
    package = json.loads(files['package/package.json'])
    if package['name'] != '@ktav-lang/ktav' or package['version'] != '0.8.1':
        raise ValueError('unexpected npm package identity')
    return {'package_sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(), 'notice_sha256': hashlib.sha256(expected).hexdigest(), 'wasm': {name: hashlib.sha256(files[name]).hexdigest() for name in sorted(wasm_names)}, 'inline_matches_web': True, 'coverage': 'Cargo/std notice prototype; non-Cargo runtime and historical packages not covered.'}


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('usage: check_wasm_npm.py TARBALL EVIDENCE SOURCE_ROOT')
    print(json.dumps(verify(*map(Path, sys.argv[1:])), indent=2, sort_keys=True))
