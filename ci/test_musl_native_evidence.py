"""CI-регрессии musl-only ABI и conservative source collection."""

import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('musl_evidence', ROOT / 'scripts/musl_native_evidence.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MuslEvidenceTests(unittest.TestCase):
    def test_catalogue_is_pinned_and_excludes_gnu_glibc_roles(self):
        raw = (ROOT / 'ci/musl-runtime-catalog.json').read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), MODULE.CATALOG_SHA)
        profile = json.loads(raw)
        self.assertEqual(len(profile['files']), 35)
        self.assertFalse(any('glibc' in item['path'] for item in profile['files']))
        self.assertIn('lib/libc/musl/COPYRIGHT', {item['path'] for item in profile['files']})

    def test_matching_little_endian_musl_cpu_is_required(self):
        data = bytearray(64)
        data[:6] = b'\x7fELF\x02\x01'
        struct.pack_into('<HH', data, 16, 3, 62)
        self.assertEqual(MODULE.machine(data, 'x86_64-unknown-linux-musl'), 62)
        with self.assertRaisesRegex(ValueError, 'matching musl ELF64'):
            MODULE.machine(data, 'aarch64-unknown-linux-musl')

    def test_only_matching_musl_libc_import_is_accepted(self):
        self.assertEqual(MODULE.dependencies(' (NEEDED) Shared library: [libc.so]', '', 'x86_64-unknown-linux-musl'), ['libc.so'])
        self.assertEqual(MODULE.dependencies(' (NEEDED) Shared library: [libc.musl-aarch64.so.1]', '', 'aarch64-unknown-linux-musl'), ['libc.musl-aarch64.so.1'])
        for name in ['libc.so.6', 'libc.musl-aarch64.so.1', 'libgcc_s.so.1', 'libunwind.so.1']:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'unreviewed musl'):
                MODULE.dependencies(' (NEEDED) Shared library: [' + name + ']', '', 'x86_64-unknown-linux-musl')

    def test_glibc_versions_and_sdk_loader_paths_are_rejected(self):
        valid = ' (NEEDED) Shared library: [libc.so]'
        for text in ['Name: GLIBC_2.17', 'Name: GLIBC_PRIVATE']:
            with self.assertRaisesRegex(ValueError, 'unreviewed musl'):
                MODULE.dependencies(valid, text, 'x86_64-unknown-linux-musl')
        with self.assertRaisesRegex(ValueError, 'unreviewed musl'):
            MODULE.dependencies(valid + '\n (RUNPATH) Library runpath: [/sdk/lib]', '', 'x86_64-unknown-linux-musl')

    def test_full_original_legal_texts_match_their_source_hashes(self):
        profile = json.loads((ROOT / 'ci/musl-runtime-catalog.json').read_bytes())
        legal = [item for item in profile['files'] if 'license_text' in item]
        self.assertEqual(len(legal), 3)
        for item in legal:
            self.assertEqual(hashlib.sha256(item['license_text'].encode()).hexdigest(), item['sha256'])


if __name__ == '__main__':
    unittest.main()
