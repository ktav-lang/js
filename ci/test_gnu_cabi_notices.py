"""CI-регрессии source-bound Zig notices и actual ELF boundaries."""

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


RUNTIME = load('zig_runtime', 'zig_runtime_notices.py')
ELF = load('gnu_elf', 'check_gnu_cabi_evidence.py')


def mapping(members=None):
    pairs = RUNTIME.EXPECTED_MEMBERS if members is None else members
    return '\n'.join('/cache/' + archive + '(' + member + '):(.text)' for archive, member in pairs) + '\n/build/ktav_cabi.unit.rcgu.o:(.text)\n'


class GnuCabiTests(unittest.TestCase):
    def test_exact_profile_preserves_all_source_legal_roles(self):
        catalog, raw = RUNTIME._catalogue()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), RUNTIME.CATALOG_SHA)
        self.assertEqual(len(catalog['files']), 37)
        self.assertEqual(catalog['zig_version'], '0.14.0')

    def test_profile_permission_text_cannot_change(self):
        catalog, _ = RUNTIME._catalogue()
        catalog['credits'] += 'changed attribution'
        with mock.patch.object(RUNTIME, '_read', return_value=json.dumps(catalog).encode()):
            with self.assertRaisesRegex(ValueError, 'unreviewed Zig runtime catalogue'):
                RUNTIME._catalogue()

    def test_exact_members_are_accepted(self):
        self.assertEqual(RUNTIME._members(mapping()), sorted(RUNTIME.EXPECTED_MEMBERS))

    def test_missing_or_extra_static_member_is_rejected(self):
        pairs = set(RUNTIME.EXPECTED_MEMBERS)
        pairs.pop()
        for changed in [pairs, RUNTIME.EXPECTED_MEMBERS | {('foreign.a', 'foreign.o')}]:
            with self.subTest(members=changed), self.assertRaisesRegex(ValueError, 'unreviewed archive membership'):
                RUNTIME._members(mapping(changed))

    def test_foreign_direct_object_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unreviewed direct object'):
            RUNTIME._members(mapping() + '/foreign/startup.o:(.text)\n')

    def test_cargo_materials_are_preserved_without_mutation(self):
        before = {'schema_version': 1, 'coverage': 'fixture', 'licenses': ['original']}
        saved = copy.deepcopy(before)
        result = RUNTIME._augment(before, RUNTIME._catalogue()[0])
        self.assertEqual(before, saved)
        self.assertEqual(result['licenses'], ['original'])
        with self.assertRaisesRegex(ValueError, 'unexpected native notice'):
            RUNTIME._augment(result, RUNTIME._catalogue()[0])

    def test_plain_notice_retains_complete_original_grants(self):
        catalog, _ = RUNTIME._catalogue()
        plain = RUNTIME._plain_notice(catalog)
        for item in catalog['files']:
            texts = [item['license_text']] if 'license_text' in item else item['source_notices']
            for text in texts:
                self.assertIn(text.encode('utf-8'), plain)

    def test_matching_elf64_cpu_is_required(self):
        data = bytearray(64)
        data[:6] = b'\x7fELF\x02\x01'
        struct.pack_into('<HH', data, 16, 3, 62)
        self.assertEqual(ELF.machine(data, 'x86_64-unknown-linux-gnu'), 62)
        with self.assertRaisesRegex(ValueError, 'matching ELF64'):
            ELF.machine(data, 'aarch64-unknown-linux-gnu')

    def test_only_host_os_runtime_imports_are_accepted(self):
        self.assertEqual(ELF.dependencies(' (NEEDED) Shared library: [libc.so.6]\n'), ['libc.so.6'])
        for text in [' (NEEDED) Shared library: [libgcc_s.so.1]\n', ' (NEEDED) Shared library: [libunwind.so.1]\n', '']:
            with self.assertRaisesRegex(ValueError, 'unreviewed GNU C ABI dynamic'):
                ELF.dependencies(text)
        with self.assertRaisesRegex(ValueError, 'loader search path'):
            ELF.dependencies(' (NEEDED) Shared library: [libc.so.6]\n (RUNPATH) Library runpath: [/sdk/lib]\n')

    def test_glibc_abi_must_remain_at_2_17_or_older(self):
        self.assertEqual(ELF.glibc_versions('Name: GLIBC_2.2.5 Name: GLIBC_2.17.0'), ['2.2.5', '2.17.0'])
        for value in ['Name: GLIBC_2.18', 'Name: GLIBC_PRIVATE', '']:
            with self.assertRaises(ValueError):
                ELF.glibc_versions(value)

    def test_callable_and_metadata_export_roles_are_separate(self):
        symbols = ''.join(name + ' T 100 10\n' for name in ELF.FUNCTIONS) + 'KTAV_THIRD_PARTY_NOTICES R 200 20\n'
        self.assertEqual(ELF.exports(symbols), sorted(ELF.FUNCTIONS))
        with self.assertRaisesRegex(ValueError, 'immutable C ABI resource'):
            ELF.exports(symbols.replace('NOTICES R', 'NOTICES T'))
        with self.assertRaisesRegex(ValueError, 'callable GNU C ABI exports differ'):
            ELF.exports(symbols + 'ktav_unreviewed_api T 300 10\n')


if __name__ == '__main__':
    unittest.main()
