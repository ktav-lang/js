"""CI-регрессии exact C ABI SDK/source/runtime boundary."""

import copy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('cabi_runtime', ROOT / 'scripts/cabi_gnullvm_notices.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
TARGET = 'x86_64-pc-windows-gnullvm'


class CabiRuntimeTests(unittest.TestCase):
    def profile(self):
        return MODULE.catalogue(ROOT)

    def link_fixture(self):
        document = self.profile()
        profile = document['targets'][TARGET]
        items = [{'path': 'link/llvm-mingw-20261020-ucrt-x86_64/' + value['path'], 'bytes': value['size'], 'sha256': value['sha256']} for value in profile['sdk_inputs']]
        mapping = ''.join('00001000 00000010    16         ' + value + ':(.text)\n' for value in profile['retained_objects']).encode()
        return document, items, mapping

    def test_exact_profile_has_dll_specific_targets_and_source_grants(self):
        document = self.profile()
        self.assertEqual(len(document['source_files']), 58)
        self.assertEqual(len(document['original_documents']), 6)
        self.assertEqual(len(document['targets'][TARGET]['retained_objects']), 28)
        self.assertEqual(len(document['targets']['aarch64-pc-windows-gnullvm']['retained_objects']), 21)
        self.assertIn('mingw-w64-crt/crt/crtdll.c', {item['path'] for item in document['source_files']})

    def test_profile_mutation_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / MODULE.CATALOG
            destination.parent.mkdir(parents=True)
            destination.write_bytes((ROOT / MODULE.CATALOG).read_bytes() + b'\n')
            with self.assertRaisesRegex(ValueError, 'unreviewed C ABI runtime catalogue'):
                MODULE.catalogue(root)

    def test_augmentation_preserves_original_cargo_bundle(self):
        before = {'schema_version': 1, 'coverage': 'Cargo/std fixture', 'packages': [{'name': 'fixture'}]}
        saved = copy.deepcopy(before)
        result = MODULE.augment(before, self.profile(), TARGET)
        self.assertEqual(before, saved)
        self.assertEqual(result['packages'], saved['packages'])
        self.assertEqual(result['non_cargo_runtimes'][0]['selected_inputs']['retained_objects'], self.profile()['targets'][TARGET]['retained_objects'])

    def test_unknown_target_and_repeated_augmentation_are_rejected(self):
        before = {'schema_version': 1, 'coverage': 'fixture'}
        for target, bundle in [('unknown', before), (TARGET, MODULE.augment(before, self.profile(), TARGET))]:
            with self.assertRaisesRegex(ValueError, 'unexpected C ABI runtime'):
                MODULE.augment(bundle, self.profile(), target)

    def test_source_hash_and_original_notice_changes_are_rejected(self):
        raw = b'/* Copyright fixture. Permission fixture. */\nint value;\n'
        item = {'source': 'fixture', 'path': 'fixture.c', 'sha256': hashlib.sha256(raw).hexdigest(), 'source_notices': ['/* Copyright fixture. Permission fixture. */']}
        document = {'source_files': [item], 'original_documents': []}
        MODULE.verify_sources(document, fetch=lambda _: raw)
        with self.assertRaisesRegex(ValueError, 'source/grant bytes differ'):
            MODULE.verify_sources(document, fetch=lambda _: raw + b'changed')
        changed = copy.deepcopy(document)
        changed['source_files'][0]['source_notices'] = []
        with self.assertRaisesRegex(ValueError, 'original notice differs'):
            MODULE.verify_sources(changed, fetch=lambda _: raw)

    def test_foreign_source_url_is_rejected_before_fetch(self):
        with self.assertRaisesRegex(ValueError, 'unreviewed C ABI runtime source URL'):
            MODULE.original('https://example.invalid/source.c')

    def test_exact_sdk_bytes_and_objects_are_accepted(self):
        document, items, mapping = self.link_fixture()
        MODULE.verify_inputs(items, mapping, document, TARGET)

    def test_changed_sdk_bytes_or_missing_retained_member_are_rejected(self):
        document, items, mapping = self.link_fixture()
        changed = copy.deepcopy(items)
        changed[0]['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'differ from reviewed profile'):
            MODULE.verify_inputs(changed, mapping, document, TARGET)
        with self.assertRaisesRegex(ValueError, 'differ from reviewed profile'):
            MODULE.verify_inputs(items, b'\n'.join(mapping.splitlines()[1:]), document, TARGET)

    def test_foreign_native_input_and_duplicate_sdk_input_are_rejected(self):
        document, items, mapping = self.link_fixture()
        foreign = {'path': 'external/foreign.a', 'bytes': 1, 'sha256': '0' * 64}
        with self.assertRaisesRegex(ValueError, 'outside reviewed SDK/Rust boundary'):
            MODULE.verify_inputs([*items, foreign], mapping, document, TARGET)
        with self.assertRaisesRegex(ValueError, 'duplicate or unsafe SDK'):
            MODULE.verify_inputs([*items, items[0]], mapping, document, TARGET)

    def test_legal_collection_does_not_drop_full_original_documents(self):
        document = self.profile()
        plain = MODULE.plain_notice(document)
        for item in document['original_documents']:
            self.assertIn(item['text'].encode('utf-8'), plain)


if __name__ == '__main__':
    unittest.main()
