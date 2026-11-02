import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('supplement', Path(__file__).resolve().parents[1] / 'scripts/source_license_supplements.py')
SUPPLEMENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUPPLEMENT)


class FallbackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.catalog_path = self.root / 'catalog.json'
        catalog = json.loads((Path(__file__).resolve().parent / 'licenses/js-source-supplements.json').read_text())
        self.review = next(item for item in catalog['packages'] if item['name'] == 'windows-link')
        self.catalog = {'packages': [self.review]}
        (self.root / '.cargo_vcs_info.json').write_text(json.dumps(self.review['vcs']))
        (self.root / 'license-mit').write_bytes(self.review['license_text'].encode())
        self.package = {'id': 'windows-link', 'name': 'windows-link', 'version': self.review['version'], 'license': self.review['declared_license'], 'source': 'registry+https://github.com/rust-lang/crates.io-index', 'manifest_path': str(self.root / 'Cargo.toml')}
        self.metadata = {'packages': [self.package]}
        self.report = {'licenses': [{'id': 'MIT', 'source_path': None, 'text': 'generated fallback', 'used_by': [{'crate': self.package}]}]}
        self.lock = ('[[package]]\nname="windows-link"\nversion="' + self.review['version'] + '"\nchecksum="' + self.review['crate_checksum'] + '"\n').encode()

    def apply(self):
        self.catalog_path.write_text(json.dumps(self.catalog))
        return SUPPLEMENT.supplement_fallbacks(self.metadata, self.report, self.lock, self.catalog_path)

    def test_original_report_preserved_and_real_source_used(self):
        before = copy.deepcopy(self.report)
        result, provenance = self.apply()
        self.assertEqual(self.report, before)
        self.assertEqual(result['licenses'][0]['text'], self.review['license_text'])
        self.assertEqual(provenance[0]['crate_checksum'], self.review['crate_checksum'])
        self.assertNotIn('license_text', provenance[0])

    def test_unknown_package_rejected(self):
        self.package['version'] = '999'
        with self.assertRaisesRegex(ValueError, 'identity'):
            self.apply()

    def test_wrong_checksum_rejected(self):
        self.lock = self.lock.replace(self.review['crate_checksum'].encode(), b'0' * 64)
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.apply()

    def test_wrong_vcs_rejected(self):
        (self.root / '.cargo_vcs_info.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'VCS'):
            self.apply()

    def test_changed_published_license_rejected(self):
        (self.root / 'license-mit').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'differs'):
            self.apply()

    def test_changed_catalog_text_rejected(self):
        self.review['license_text'] = 'MIT'
        with self.assertRaisesRegex(ValueError, 'license changed'):
            self.apply()

    def test_non_mit_fallback_rejected(self):
        self.report['licenses'][0]['id'] = 'Apache-2.0'
        with self.assertRaisesRegex(ValueError, 'unreviewed license'):
            self.apply()


if __name__ == '__main__':
    unittest.main()
