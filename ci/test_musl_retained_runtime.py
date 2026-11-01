"""CI-регрессии точных target/role/member и полных original Rust grants."""

import copy
import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('musl_retained', ROOT / 'scripts/musl_retained_runtime.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MuslRetainedTests(unittest.TestCase):
    def fixture(self, target, role):
        document, _ = MODULE.profile(ROOT)
        archives = []
        cpu = 62 if target.startswith('x86_64') else 183
        for item in document['targets'][target][role]['archives']:
            archive = copy.deepcopy(item)
            archive.setdefault('path', 'o/fixture/' + archive['name'])
            archive['available_after_link'] = True
            if archive['origin'] == 'zig-cache':
                archive['object_inputs'] = [{'name': name, 'machine': cpu, 'bytes': 64, 'sha256': 'a' * 64} for name in archive['members']]
            archives.append(archive)
        report = {'target': target, 'role': role, 'imports': ['libc.so'], 'archive_inputs': archives, 'direct_objects': ['/project/target/' + target + '/release/deps/ktav_' + role + '.fixture.rcgu.o']}
        return document, report

    def test_profile_preserves_all_original_material_roles(self):
        document, _ = MODULE.profile(ROOT)
        materials = MODULE.originals(ROOT, document)
        self.assertEqual(len(materials), 13)
        self.assertEqual(sum(item['legal_document'] for item in materials), 4)
        self.assertTrue(any('MIT AND Apache-2.0 WITH' in item.get('text', '') for item in materials))

    def test_all_four_actual_role_policies_are_distinct_and_accepted(self):
        for target in ['x86_64-unknown-linux-musl', 'aarch64-unknown-linux-musl']:
            for role in ['napi', 'cabi']:
                document, report = self.fixture(target, role)
                MODULE.verify_inputs(report, document, target, role)

    def test_missing_or_changed_builtin_member_is_rejected(self):
        target = 'aarch64-unknown-linux-musl'
        document, report = self.fixture(target, 'napi')
        rust = next(item for item in report['archive_inputs'] if item['origin'] == 'rust-sysroot')
        rust['members'].pop()
        with self.assertRaisesRegex(ValueError, 'retained musl source/archive members differ'):
            MODULE.verify_inputs(report, document, target, 'napi')

    def test_changed_rust_archive_bytes_are_rejected(self):
        target = 'aarch64-unknown-linux-musl'
        document, report = self.fixture(target, 'napi')
        next(item for item in report['archive_inputs'] if item['origin'] == 'rust-sysroot')['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'retained musl source/archive members differ'):
            MODULE.verify_inputs(report, document, target, 'napi')

    def test_role_swap_and_extra_direct_object_are_rejected(self):
        target = 'x86_64-unknown-linux-musl'
        document, report = self.fixture(target, 'napi')
        with self.assertRaisesRegex(ValueError, 'retained musl source/archive members differ'):
            MODULE.verify_inputs(report, document, target, 'cabi')
        report['direct_objects'].append('/foreign/crt.o')
        with self.assertRaisesRegex(ValueError, 'unreviewed direct musl'):
            MODULE.verify_inputs(report, document, target, 'napi')

    def test_actual_member_cpu_fingerprints_are_required(self):
        target = 'x86_64-unknown-linux-musl'
        document, report = self.fixture(target, 'cabi')
        next(item for item in report['archive_inputs'] if item['origin'] == 'zig-cache')['object_inputs'][0]['machine'] = 183
        with self.assertRaisesRegex(ValueError, 'actual Zig member'):
            MODULE.verify_inputs(report, document, target, 'cabi')

    def test_original_copyright_material_cannot_be_truncated(self):
        document, _ = MODULE.profile(ROOT)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for item in document['materials']:
                destination = root / item['path']
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / item['path'], destination)
            selected = document['materials'][0]
            (root / selected['path']).write_bytes(b'truncated grant')
            with self.assertRaisesRegex(ValueError, 'original musl Rust/LLVM/libm bytes differ'):
                MODULE.originals(root, document)


if __name__ == '__main__':
    unittest.main()
