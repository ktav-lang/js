"""Применить только checksum-bound filesystem URL fix к original 0.8.1 FFI adapters."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys

SOURCE = '562deb3fde092d63a78f359be095e5079929d0d1'
PINS = {'bun': '7ebb12ce7ccd4a9b3ccfc54783527354377405bf8ff1ce82e04d22f70f0ee77e', 'deno': '2defa121c8623a89b97805f4c2d9711d0cbe2f7a4e5a96729d84ce8cd5358cef'}
IMPORT = b'import { ktavMessageError, toKtavError } from "./internal/api.js";'
COMPILED = {'bun': '39c08412abcc4710f3db9578bd39e0a323e2e8c6bc718b824cc908eaf40334a9', 'deno': '6e7c0013ad64e85ce7a46e479fd6cddec0ec3bd1ffb0a51c901b00581e96bd0e'}


def verify_records(records):
    expected = {('ts/ffi-' + runtime + '.ts', PINS[runtime], COMPILED[runtime]) for runtime in PINS}
    if len(records) != 2 or {(item['path'], item['original_sha256'], item['compiled_sha256']) for item in records} != expected:
        raise ValueError('FFI URL source overlay provenance differs')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def patch(raw, runtime):
    if runtime not in PINS or sha(raw) != PINS[runtime]:
        raise ValueError('unreviewed original FFI adapter')
    expression = b'return new URL(' + (b'resolved' if runtime == 'bun' else b'url') + b').pathname;'
    replacement = b'return fileURLToPath(' + (b'resolved' if runtime == 'bun' else b'url') + b');'
    if raw.count(IMPORT) != 1 or raw.count(expression) != 1 or b'fileURLToPath' in raw:
        raise ValueError('original FFI URL anchors differ')
    return raw.replace(IMPORT, b'import { fileURLToPath } from "node:url";\n\n' + IMPORT).replace(expression, replacement)


def apply(root):
    if subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() != SOURCE:
        raise ValueError('FFI compatibility overlay requires original 0.8.1 source')
    rows = []
    prepared = []
    for runtime in PINS:
        path = root / ('ts/ffi-' + runtime + '.ts')
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 1024 * 1024:
            raise ValueError('invalid FFI overlay source file')
        raw = path.read_bytes()
        changed = patch(raw, runtime)
        prepared.append((path, changed))
        rows.append({'path': path.relative_to(root).as_posix(), 'original_sha256': sha(raw), 'compiled_sha256': sha(changed), 'scope': 'Standard fileURLToPath conversion only; no parser, public API or dependency change.'})
    verify_records(rows)
    for path, changed in prepared:
        path.write_bytes(changed)
    return rows


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: patch_ffi_package_urls.py ORIGINAL_SOURCE_ROOT')
    print(json.dumps(apply(Path(sys.argv[1]).resolve()), sort_keys=True))
