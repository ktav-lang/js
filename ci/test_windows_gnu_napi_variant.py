"""Проверить fail-closed source/lock boundaries GNU NAPI variant без toolchain."""

import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('variant', ROOT / 'scripts/windows_gnu_napi_variant.py')
VARIANT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VARIANT)
FIXTURES = ROOT / 'ci/fixtures/windows-gnu-napi'


class VariantTests(unittest.TestCase):
    def locks(self):
        before = {'version': 3, 'package': [
            {'name': 'ktav', 'version': '0.8.1', 'source': 'registry+fixture', 'checksum': 'core'},
            {'name': 'napi', 'version': '3.15.0', 'source': 'registry+fixture', 'checksum': VARIANT.CRATE_SHA, 'dependencies': ['napi-sys']},
            {'name': 'napi-sys', 'version': '3.4.1', 'source': 'registry+fixture', 'checksum': 'sys'},
        ]}
        after = copy.deepcopy(before)
        after['version'] = 4
        after['package'][1].pop('source')
        after['package'][1].pop('checksum')
        return before, after

    def test_only_first_party_setup_call_changes(self):
        original = (FIXTURES / 'project-build.rs.txt').read_bytes()
        changed = VARIANT.patch_project(original)
        self.assertIn(b'CARGO_CFG_TARGET_OS', changed)
        self.assertIn(b'CARGO_CFG_TARGET_ENV', changed)
        self.assertEqual(changed.count(b'napi_build::setup();'), 1)
        self.assertNotEqual(VARIANT.sha(changed), VARIANT.sha(original))

    def test_only_existing_dependency_feature_is_activated(self):
        original = (FIXTURES / 'project-Cargo.toml.txt').read_bytes()
        changed = VARIANT.patch_manifest(original)
        self.assertEqual(changed.replace(b', "dyn-symbols"', b''), original)
        self.assertIn(b'default-features = false', changed)

    def test_unknown_first_party_inputs_are_rejected(self):
        for patch, name in [(VARIANT.patch_project, 'project-build.rs.txt'), (VARIANT.patch_manifest, 'project-Cargo.toml.txt')]:
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError, 'unreviewed first-party'):
                    patch((FIXTURES / name).read_bytes() + b'changed')

    def test_already_patched_manifest_is_rejected(self):
        changed = VARIANT.patch_manifest((FIXTURES / 'project-Cargo.toml.txt').read_bytes())
        with self.assertRaisesRegex(ValueError, 'unreviewed first-party'):
            VARIANT.patch_manifest(changed)

    def test_unknown_upstream_script_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unreviewed napi build script'):
            VARIANT.patch_upstream(b'if target_os == "windows" && target_env == "gnu" {')

    def test_missing_and_duplicate_anchors_are_rejected(self):
        for raw in [b'', b'anchor anchor']:
            with self.assertRaisesRegex(ValueError, 'anchor differs'):
                VARIANT.replace_once(raw, b'anchor', b'changed')

    def test_explicit_path_source_identity_is_accepted(self):
        VARIANT.verify_lock(*self.locks())

    def test_changed_other_package_version_or_checksum_is_rejected(self):
        for key in ['version', 'checksum', 'source']:
            before, after = self.locks()
            after['package'][0][key] = 'changed'
            with self.assertRaisesRegex(ValueError, 'changes packages beyond'):
                VARIANT.verify_lock(before, after)

    def test_added_or_removed_package_is_rejected(self):
        for add in [True, False]:
            before, after = self.locks()
            if add:
                after['package'].append({'name': 'foreign', 'version': '1'})
            else:
                after['package'].pop()
            with self.assertRaisesRegex(ValueError, 'changes packages beyond'):
                VARIANT.verify_lock(before, after)

    def test_registry_source_not_replaced_is_rejected(self):
        before, _ = self.locks()
        with self.assertRaisesRegex(ValueError, 'changes packages beyond'):
            VARIANT.verify_lock(before, before)

    def test_unknown_upstream_package_identity_is_rejected(self):
        before, after = self.locks()
        before['package'][1]['checksum'] = 'changed'
        with self.assertRaisesRegex(ValueError, 'registry identity differs'):
            VARIANT.verify_lock(before, after)

    def test_unknown_lock_format_is_rejected(self):
        before, after = self.locks()
        after['version'] = 99
        with self.assertRaisesRegex(ValueError, 'lock format'):
            VARIANT.verify_lock(before, after)

    def test_unknown_archive_does_not_create_vendor_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / 'foreign.crate'
            archive.write_bytes(b'foreign source')
            vendor = root / 'vendor'
            with self.assertRaisesRegex(ValueError, 'archive checksum'):
                VARIANT.unpack(archive, vendor)
            self.assertFalse(vendor.exists())


if __name__ == '__main__':
    unittest.main()
