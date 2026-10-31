"""Проверить reviewed lock без запуска Cargo и автоматического resolution."""

import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location('js_notices', SCRIPTS / 'prepare_js_notices.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class ReviewedBuildLockTests(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        data = b'version = 4\n'
        (root / 'Cargo.lock').write_bytes(data)
        (root / 'ci').mkdir()
        provenance = {'schema_version': 1, 'cargo_lock_sha256': hashlib.sha256(data).hexdigest()}
        (root / 'ci/js-build-lock.json').write_text(json.dumps(provenance), encoding='utf-8')
        return root, data, provenance

    def test_existing_reviewed_lock_is_returned_without_rewriting(self):
        root, data, provenance = self.fixture()
        original, record = helper.reviewed_lock(root)
        self.assertEqual(original, data)
        self.assertEqual(record, provenance)
        self.assertEqual((root / 'Cargo.lock').read_bytes(), data)

    def test_missing_lock_is_not_regenerated(self):
        root, _, _ = self.fixture()
        (root / 'Cargo.lock').unlink()
        with self.assertRaisesRegex(ValueError, 'missing'):
            helper.reviewed_lock(root)
        self.assertFalse((root / 'Cargo.lock').exists())

    def test_missing_provenance_is_rejected(self):
        root, _, _ = self.fixture()
        (root / 'ci/js-build-lock.json').unlink()
        with self.assertRaisesRegex(ValueError, 'missing'):
            helper.reviewed_lock(root)

    def test_changed_lock_is_not_silently_resolved(self):
        root, _, _ = self.fixture()
        (root / 'Cargo.lock').write_bytes(b'version = 3\n')
        with self.assertRaisesRegex(ValueError, 'differs from reviewed graph'):
            helper.reviewed_lock(root)
        self.assertEqual((root / 'Cargo.lock').read_bytes(), b'version = 3\n')

    def test_unknown_review_record_schema_is_rejected(self):
        root, _, provenance = self.fixture()
        provenance['schema_version'] = 2
        (root / 'ci/js-build-lock.json').write_text(json.dumps(provenance), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'differs from reviewed graph'):
            helper.reviewed_lock(root)

    def test_unbound_hash_is_rejected(self):
        root, _, provenance = self.fixture()
        provenance['cargo_lock_sha256'] = '0' * 64
        (root / 'ci/js-build-lock.json').write_text(json.dumps(provenance), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'differs from reviewed graph'):
            helper.reviewed_lock(root)

    def test_symlinked_lock_is_rejected(self):
        root, data, _ = self.fixture()
        alternate = root / 'alternate.lock'
        alternate.write_bytes(data)
        (root / 'Cargo.lock').unlink()
        (root / 'Cargo.lock').symlink_to(alternate)
        with self.assertRaisesRegex(ValueError, 'missing'):
            helper.reviewed_lock(root)


if __name__ == '__main__':
    unittest.main()
