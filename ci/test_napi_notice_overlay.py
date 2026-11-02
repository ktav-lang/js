"""Проверить перенос только retention без замены binding API."""

import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/patch_napi_notice_source.py'
SPEC = importlib.util.spec_from_file_location('overlay', SCRIPT)
OVERLAY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(OVERLAY)


class NoticeOverlayTests(unittest.TestCase):
    def source(self, extra=''):
        return OVERLAY.IMPORT + '\n' + extra + OVERLAY.FUNCTION + '    original_body(env, s)\n}\n'

    def test_original_binding_body_is_preserved(self):
        source = self.source()
        patched = OVERLAY.patch_source(source)
        self.assertEqual(patched.replace(OVERLAY.STATIC, '').replace(OVERLAY.CALL, ''), source)
        self.assertEqual(patched.count('static KTAV_NOTICES:'), 1)
        self.assertEqual(patched.count(OVERLAY.CALL), 1)

    def test_other_revision_api_is_not_copied_or_removed(self):
        extra = 'fn revision_specific_api() { distinct_body(); }\n'
        source = self.source(extra)
        patched = OVERLAY.patch_source(source)
        self.assertIn(extra, patched)
        self.assertEqual(patched.replace(OVERLAY.STATIC, '').replace(OVERLAY.CALL, ''), source)
        self.assertNotIn('revision_specific_api', OVERLAY.patch_source(self.source()))

    def test_missing_import_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unreviewed'):
            OVERLAY.patch_source(self.source().replace(OVERLAY.IMPORT, ''))

    def test_duplicate_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unreviewed'):
            OVERLAY.patch_source(self.source() + OVERLAY.FUNCTION)

    def test_missing_function_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unreviewed'):
            OVERLAY.patch_source(self.source().replace(OVERLAY.FUNCTION, ''))

    def test_repeated_overlay_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'already patched'):
            OVERLAY.patch_source(OVERLAY.patch_source(self.source()))


if __name__ == '__main__':
    unittest.main()
