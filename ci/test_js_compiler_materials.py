"""Проверить exact compiler collection и полные originals без toolchain execution."""

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from prepare_js_notices import stage_compiler
from rust_compiler_notices import collect, RUST_REVISION, PROFILE_SHA256

RUSTC = 'rustc 1.99.1 (fixture)\ncommit-hash: ' + RUST_REVISION + '\nrelease: 1.99.1\nLLVM version: 23.1.1\n'


class CompilerMaterialsTests(unittest.TestCase):
    def test_complete_collection_and_source_sidecars_match(self):
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary)
            collection = stage_compiler(ROOT, evidence, RUSTC)
            self.assertEqual(collection, collect(evidence, RUSTC))
            self.assertEqual(collection['profile_sha256'], PROFILE_SHA256)
            self.assertEqual(collection['compiler_builtins_license'], 'MIT AND Apache-2.0 WITH LLVM-exception')
            self.assertEqual(collection['libm_license'], 'MIT')
            self.assertEqual(len(collection['materials']), 14)
            self.assertEqual(sum(item['legal_document'] for item in collection['materials']), 4)
            for item in collection['materials']:
                raw = (evidence / item['path']).read_bytes()
                self.assertEqual(raw, item['text'].encode('utf-8'))
                self.assertEqual(len(raw), item['bytes'])
                self.assertEqual(hashlib.sha256(raw).hexdigest(), item['sha256'])
                self.assertEqual(hashlib.sha1(b'blob ' + str(len(raw)).encode() + bytes([0]) + raw).hexdigest(), item['git_blob'])

    def test_unknown_compiler_cannot_reuse_the_reviewed_materials(self):
        for text in [RUSTC.replace('1.99.1', '1.88.0'), RUSTC.replace(RUST_REVISION, '0' * 40)]:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                with self.assertRaisesRegex(ValueError, 'unreviewed Rust compiler'):
                    stage_compiler(ROOT, root, text)
                self.assertFalse((root / 'ci').exists())

    def test_modified_original_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary)
            collection = stage_compiler(ROOT, evidence, RUSTC)
            original = evidence / collection['materials'][0]['path']
            original.write_bytes(original.read_bytes() + b'changed')
            with self.assertRaisesRegex(ValueError, 'original identity differs'):
                collect(evidence, RUSTC)

    def test_changed_or_missing_profile_is_rejected(self):
        for missing in [False, True]:
            with tempfile.TemporaryDirectory() as temporary:
                evidence = Path(temporary)
                stage_compiler(ROOT, evidence, RUSTC)
                path = evidence / 'ci/rust-compiler-notices.json'
                if missing:
                    path.unlink()
                else:
                    path.write_bytes(b'{}')
                with self.assertRaisesRegex(ValueError, 'missing or symlinked|profile differs'):
                    collect(evidence, RUSTC)

    def test_original_legal_documents_are_kept_unmodified(self):
        collection = collect(ROOT, RUSTC)
        documents = {item['role']: item['text'] for item in collection['materials'] if item['legal_document']}
        self.assertIn('Permission is hereby granted', documents['libm-LICENSE.txt'])
        self.assertIn('Jorge Aparicio', documents['libm-LICENSE.txt'])
        self.assertIn('musl', documents['libm-LICENSE.txt'])
        self.assertIn('LLVM', documents['compiler-builtins-LICENSE.txt'])
        self.assertIn('compiler-rt-CREDITS.TXT', documents)


if __name__ == '__main__':
    unittest.main()
