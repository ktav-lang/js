"""CI-регрессии source-preserving C ABI metadata overlay."""

import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/patch_cabi_notice_source.py'
SPEC = importlib.util.spec_from_file_location('cabi_overlay', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CabiOverlayTests(unittest.TestCase):
    def test_original_body_is_preserved(self):
        source = '//! Original 0.8.1 source.\n\nktav::declare_cabi!();\n'
        result = MODULE.patch_source(source)
        self.assertEqual(result.replace(MODULE.INSERTION, '', 1), source)
        self.assertEqual(result.count('native_notices.rs'), 1)

    def test_unrelated_newer_api_text_is_neither_added_nor_removed(self):
        source = '//! Current ABI documentation.\nktav::declare_cabi!();\nfn extra_private_body() {}\n'
        result = MODULE.patch_source(source)
        self.assertEqual(result.replace(MODULE.INSERTION, '', 1), source)
        original = MODULE.patch_source('ktav::declare_cabi!();\n')
        self.assertNotIn('extra_private_body', original)

    def test_missing_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unreviewed'):
            MODULE.patch_source('different source\n')

    def test_duplicate_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unreviewed'):
            MODULE.patch_source('ktav::declare_cabi!();\nktav::declare_cabi!();\n')

    def test_repeated_overlay_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'already patched'):
            MODULE.patch_source(MODULE.patch_source('ktav::declare_cabi!();\n'))


if __name__ == '__main__':
    unittest.main()
