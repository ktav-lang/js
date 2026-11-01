"""Проверить узкие original-source URI overlays без выполнения runtime code."""

from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch as mock_patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import patch_ffi_package_urls as OVERLAY


class FfiUrlOverlayTests(unittest.TestCase):
    def original(self, runtime):
        return (ROOT / ('ci/fixtures/ffi-package-urls/ffi-' + runtime + '.ts.txt')).read_bytes()

    def test_only_standard_import_and_uri_conversion_change(self):
        for runtime in ['bun', 'deno']:
            raw = self.original(runtime)
            variable = b'resolved' if runtime == 'bun' else b'url'
            changed = OVERLAY.patch(raw, runtime)
            prefix = b'import { fileURLToPath } from "node:url";\n\n'
            expression = b'return fileURLToPath(' + variable + b');'
            self.assertEqual(changed.count(prefix), 1)
            self.assertEqual(changed.count(expression), 1)
            restored = changed.replace(prefix, b'').replace(expression, b'return new URL(' + variable + b').pathname;')
            self.assertEqual(restored, raw)

    def test_unknown_or_already_modified_source_is_rejected(self):
        for runtime in ['bun', 'deno']:
            raw = self.original(runtime)
            for wrong in [raw + b'changed', OVERLAY.patch(raw, runtime)]:
                with self.assertRaisesRegex(ValueError, 'unreviewed'):
                    OVERLAY.patch(wrong, runtime)
        with self.assertRaisesRegex(ValueError, 'unreviewed'):
            OVERLAY.patch(self.original('bun'), 'unknown-runtime')

    def test_complete_two_file_overlay_records_original_and_compiled_hashes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'ts').mkdir()
            for runtime in OVERLAY.PINS:
                (root / ('ts/ffi-' + runtime + '.ts')).write_bytes(self.original(runtime))
            with mock_patch.object(OVERLAY.subprocess, 'check_output', return_value=OVERLAY.SOURCE + '\n'):
                records = OVERLAY.apply(root)
            self.assertEqual({item['path'] for item in records}, {'ts/ffi-bun.ts', 'ts/ffi-deno.ts'})
            for item in records:
                runtime = Path(item['path']).stem.removeprefix('ffi-')
                self.assertEqual(item['original_sha256'], OVERLAY.PINS[runtime])
                self.assertEqual(item['compiled_sha256'], OVERLAY.sha((root / item['path']).read_bytes()))

    def test_bad_second_input_does_not_partially_change_first(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'ts').mkdir()
            before = self.original('bun')
            (root / 'ts/ffi-bun.ts').write_bytes(before)
            (root / 'ts/ffi-deno.ts').write_bytes(b'changed')
            with mock_patch.object(OVERLAY.subprocess, 'check_output', return_value=OVERLAY.SOURCE + '\n'), self.assertRaisesRegex(ValueError, 'unreviewed'):
                OVERLAY.apply(root)
            self.assertEqual((root / 'ts/ffi-bun.ts').read_bytes(), before)

    def test_overlay_provenance_drift_is_rejected(self):
        records = [{'path': 'ts/ffi-' + runtime + '.ts', 'original_sha256': OVERLAY.PINS[runtime], 'compiled_sha256': OVERLAY.COMPILED[runtime]} for runtime in OVERLAY.PINS]
        OVERLAY.verify_records(records)
        for key in ['path', 'original_sha256', 'compiled_sha256']:
            changed = [dict(item) for item in records]
            changed[0][key] = 'unknown'
            with self.assertRaisesRegex(ValueError, 'provenance differs'):
                OVERLAY.verify_records(changed)
        with self.assertRaisesRegex(ValueError, 'provenance differs'):
            OVERLAY.verify_records(records[:1])

    def test_wrong_project_revision_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            with mock_patch.object(OVERLAY.subprocess, 'check_output', return_value='0' * 40 + '\n'), self.assertRaisesRegex(ValueError, 'original 0.8.1'):
                OVERLAY.apply(Path(temporary))


if __name__ == '__main__':
    unittest.main()
