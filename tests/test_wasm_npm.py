"""Проверить actual tarball guard на подмене notice и WASM payload."""

import base64
import gzip
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
for name in ('check_embedded_notices', 'check_wasm_npm'):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
CHECK = sys.modules['check_wasm_npm']


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.evidence = self.root / 'evidence'
        self.evidence.mkdir()
        self.notice = b'{"schema_version":1,"packages":[{"name":"fixture"}]}'
        (self.evidence / 'NOTICE.json').write_bytes(self.notice)
        payload = gzip.compress(self.notice, mtime=0)
        self.wasm = b'\0asm' + b'KTAV-NOTICES-GZIP-v1\0' + len(payload).to_bytes(8, 'little') + payload
        self.files = {'package/package.json': b'{"name":"@ktav-lang/ktav","version":"0.8.1"}', 'package/dist/wasm/NOTICE.json': self.notice}
        for target in ('web', 'bundler'):
            path = 'dist/wasm/' + target + '/ktav_bg.wasm'
            (self.root / path).parent.mkdir(parents=True, exist_ok=True)
            (self.root / path).write_bytes(self.wasm)
            self.files['package/' + path] = self.wasm
        self.files['package/dist/wasm/web/ktav.inline.js'] = b'const __KTAV_INLINE_WASM_BASE64 = ' + json.dumps(base64.b64encode(self.wasm).decode()).encode() + b';'
        for name in ('LICENSE-MIT', 'LICENSE-APACHE'):
            (self.root / name).write_text(name)
            self.files['package/' + name] = name.encode()

    def verify(self):
        path = self.root / 'package.tgz'
        with tarfile.open(path, 'w:gz') as archive:
            for name, data in self.files.items():
                member = tarfile.TarInfo(name)
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
        return CHECK.verify(path, self.evidence, self.root)

    def test_matching_container(self):
        self.assertTrue(self.verify()['inline_matches_web'])

    def test_changed_sidecar_rejected(self):
        self.files['package/dist/wasm/NOTICE.json'] = b'{}'
        with self.assertRaisesRegex(ValueError, 'sidecar'):
            self.verify()

    def test_foreign_wasm_with_same_notice_rejected(self):
        self.files['package/dist/wasm/bundler/ktav_bg.wasm'] += b'changed'
        with self.assertRaisesRegex(ValueError, 'built bytes'):
            self.verify()

    def test_changed_inline_rejected(self):
        self.files['package/dist/wasm/web/ktav.inline.js'] = b'const __KTAV_INLINE_WASM_BASE64 = "AA==";'
        with self.assertRaisesRegex(ValueError, 'inline WASM'):
            self.verify()

    def test_hidden_native_rejected(self):
        self.files['package/hidden.bin'] = b'\x7fELF'
        with self.assertRaisesRegex(ValueError, 'native payload'):
            self.verify()

    def test_unexpected_wasm_rejected(self):
        self.files['package/other.wasm'] = self.wasm
        with self.assertRaisesRegex(ValueError, 'inventory'):
            self.verify()

    def test_changed_own_license_rejected(self):
        self.files['package/LICENSE-MIT'] = b'changed'
        with self.assertRaisesRegex(ValueError, 'own license'):
            self.verify()

    def test_traversal_rejected(self):
        self.files['package/../escape'] = b'data'
        with self.assertRaisesRegex(ValueError, 'unsafe'):
            self.verify()


if __name__ == '__main__':
    unittest.main()
