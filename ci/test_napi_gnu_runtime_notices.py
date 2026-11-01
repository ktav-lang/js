"""Проверить fail-closed GNU runtime profile без запуска toolchain."""

import base64
import copy
import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('gnu_runtime', ROOT / 'scripts/napi_gnu_runtime_notices.py')
RUNTIME = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNTIME)
TARGET = 'x86_64-unknown-linux-gnu'


class RuntimeNoticeTests(unittest.TestCase):
    def fixture(self, target=TARGET):
        notice = RUNTIME.runtime_notice(ROOT, target)
        selected = notice['sdk_inputs']
        inputs = []
        for role, entries in [('compiler', [selected['compiler']]), ('configuration', [selected['configuration']]), ('runtime', selected['runtime_inputs'])]:
            inputs.extend({'role': role, 'path': item['path'], 'bytes': item['bytes'], 'sha256': item['sha256']} for item in entries)
        own = 'ktav_napi.ktav_napi.abcdef-cgu.0.rcgu.o'
        report = {'target': target, 'sdk_input_profile': {'repository_revision': notice['sdk_revision'], 'inputs': inputs}, 'sdk_input_catalog_sha256': RUNTIME.CATALOG_SHA256, 'compiler_sha256': selected['compiler']['sha256'], 'cross_toolchain_version': '1.0.3', 'archive_members': copy.deepcopy(RUNTIME.MEMBERS), 'loaded_objects': sorted(RUNTIME.CRT | {own})}
        documents = [{'path': item['id'], 'sha256': item['sha256'], 'raw_bytes_base64': base64.b64encode(item['text'].encode('utf-8')).decode('ascii')} for item in notice['materials'] if item['id'] in RUNTIME.DOCUMENTS]
        command = {'target': target, 'compiler': '/sdk/' + target + '/bin/' + target + '-gcc', 'output': '/build/libktav_napi.so', 'arguments': ['/build/' + own, '-Wl,-Bstatic', '/rust/libcompiler_builtins-abcdef.rlib', '-Wl,-Bdynamic', '-lc', '-L', '/rust', '-o', '/build/libktav_napi.so', '-shared', '-nodefaultlibs']}
        rustc = 'rustc 1.99.1 (fixture)\nrelease: 1.99.1\nLLVM version: 23.0.0\n'
        compiler = target + '-gcc (GCC) 4.8.5\n'
        if target == 'aarch64-unknown-linux-gnu':
            command['arguments'].append('-Wl,--fix-cortex-a53-843419')
        return notice, report, documents, command, rustc, compiler

    def test_both_exact_target_profiles_pass(self):
        for target in RUNTIME.TARGETS:
            with self.subTest(target=target):
                RUNTIME.verify_link(*self.fixture(target))

    def test_target_specific_sources_and_full_documents_are_present(self):
        for target, architecture in RUNTIME.TARGETS.items():
            notice = RUNTIME.runtime_notice(ROOT, target)
            ids = {item['id'] for item in notice['materials']}
            self.assertEqual(len(ids), 8)
            self.assertIn('glibc/' + architecture + '/crti.S', ids)
            self.assertIn('glibc/' + architecture + '/crtn.S', ids)
            self.assertTrue(set(RUNTIME.DOCUMENTS) <= ids)
            data, plain = RUNTIME.notice_bytes(notice)
            self.assertEqual(json.loads(data), notice)
            for item in notice['materials']:
                self.assertIn(item['text'].encode('utf-8'), plain)

    def test_unknown_target_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unreviewed GNU runtime target'):
            RUNTIME.runtime_notice(ROOT, 'unknown')

    def test_target_mismatch_is_rejected(self):
        args = list(self.fixture())
        args[1]['target'] = 'aarch64-unknown-linux-gnu'
        with self.assertRaisesRegex(ValueError, 'target differs'):
            RUNTIME.verify_link(*args)

    def test_changed_sdk_input_is_rejected(self):
        args = list(self.fixture())
        args[1]['sdk_input_profile']['inputs'][-1]['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'actual SDK inputs differ'):
            RUNTIME.verify_link(*args)

    def test_unreviewed_archive_member_is_rejected(self):
        args = list(self.fixture())
        args[1]['archive_members'].append(['libpthread_nonshared.a', 'unknown.oS'])
        with self.assertRaisesRegex(ValueError, 'archive members differ'):
            RUNTIME.verify_link(*args)

    def test_missing_crt_is_rejected(self):
        args = list(self.fixture())
        args[1]['loaded_objects'].remove('crti.o')
        with self.assertRaisesRegex(ValueError, 'loaded objects differ'):
            RUNTIME.verify_link(*args)

    def test_missing_gpl3_document_is_rejected(self):
        args = list(self.fixture())
        args[2] = [item for item in args[2] if item['path'] != 'share/licenses/gcc/COPYING3']
        with self.assertRaisesRegex(ValueError, 'actual SDK legal document differs'):
            RUNTIME.verify_link(*args)

    def test_changed_exception_document_is_rejected(self):
        args = list(self.fixture())
        args[2][1]['raw_bytes_base64'] = base64.b64encode(b'changed').decode('ascii')
        with self.assertRaisesRegex(ValueError, 'actual SDK legal document differs'):
            RUNTIME.verify_link(*args)

    def test_external_compiler_extensions_are_rejected(self):
        for argument in ['-fplugin=foreign.so', '-specs=/foreign', '@response', '-flto', '-Wl,-plugin,foreign.so', '-B/foreign']:
            with self.subTest(argument=argument):
                args = list(self.fixture())
                args[3]['arguments'].append(argument)
                with self.assertRaisesRegex(ValueError, 'unreviewed final NAPI link argument'):
                    RUNTIME.verify_link(*args)

    def test_changed_rust_toolchain_is_rejected(self):
        args = list(self.fixture())
        args[4] = args[4].replace('1.99.1', '1.99.2')
        with self.assertRaisesRegex(ValueError, 'unreviewed Rust compilation process'):
            RUNTIME.verify_link(*args)

    def test_prepare_preserves_cargo_bundle_and_compressed_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary)
            (evidence / 'NOTICE.json').write_text(json.dumps({'cargo_fixture': ['unchanged'], 'rustc': 'rustc 1.99.1\ncommit-hash: ' + RUNTIME.RUST_REVISION + '\nrelease: 1.99.1\n'}), encoding='utf-8')
            RUNTIME.prepare(ROOT, evidence, TARGET)
            raw = (evidence / 'NOTICE.json').read_bytes()
            bundle = json.loads(raw)
            self.assertEqual(bundle['cargo_fixture'], ['unchanged'])
            self.assertEqual(bundle['napi_gnu_runtime'], RUNTIME.runtime_notice(ROOT, TARGET))
            self.assertEqual(gzip.decompress((evidence / 'NOTICE.json.gz').read_bytes()), raw)
            with self.assertRaisesRegex(ValueError, 'already exists'):
                RUNTIME.prepare(ROOT, evidence, TARGET)

    def builtins_fixture(self, target=TARGET):
        notice = RUNTIME.runtime_notice(ROOT, target)
        retained = notice['rust_compiler_builtins']['retained']
        archive = '/rust/lib/rustlib/' + target + '/lib/' + retained['archive']
        mapping = '\n'.join(archive + '(' + member + ')' for member in retained['members'])
        rustc = 'rustc 1.99.1\ncommit-hash: ' + RUNTIME.RUST_REVISION + '\nrelease: 1.99.1\n'
        return notice, mapping, rustc

    def test_exact_builtins_members_for_both_gnu_targets(self):
        for target in RUNTIME.TARGETS:
            with self.subTest(target=target):
                notice, mapping, rustc = self.builtins_fixture(target)
                self.assertTrue(RUNTIME.verify_builtins(notice, mapping, rustc).endswith(notice['rust_compiler_builtins']['retained']['archive']))

    def test_full_original_grants_and_credits_are_delivered(self):
        for target in RUNTIME.TARGETS:
            notice = RUNTIME.runtime_notice(ROOT, target)
            builtins = notice['rust_compiler_builtins']
            self.assertEqual(builtins['compiler_builtins_license'], 'MIT AND Apache-2.0 WITH LLVM-exception')
            self.assertEqual(len(builtins['materials']), 13)
            data, plain = RUNTIME.notice_bytes(notice)
            self.assertIn(b'Copyright (c) 2018 Jorge Aparicio', plain)
            self.assertIn('Copyright © 2005-2020 Rich Felker, et al.'.encode(), plain)
            self.assertIn(b'Copyright (c) 2009-2016', plain)
            for item in builtins['materials']:
                original = (ROOT / item['path']).read_bytes()
                self.assertEqual(item['text'].encode(), original)
                if item['legal_document']:
                    self.assertIn(original, plain)
            self.assertEqual(json.loads(data)['rust_compiler_builtins'], builtins)

    def test_unknown_or_missing_builtins_member_is_rejected(self):
        for target in RUNTIME.TARGETS:
            notice, mapping, rustc = self.builtins_fixture(target)
            for changed in ['', mapping + '\n' + mapping.split('(')[0] + '(unknown.o)', '\n'.join(mapping.splitlines()[1:])]:
                with self.subTest(target=target, mapping=changed):
                    with self.assertRaisesRegex(ValueError, 'builtins (archive set|retained inputs) differs?'):
                        RUNTIME.verify_builtins(notice, changed, rustc)

    def test_foreign_target_and_archive_are_rejected(self):
        notice, mapping, rustc = self.builtins_fixture()
        for changed in [mapping.replace(TARGET, 'x86_64-unknown-linux-musl'), mapping.replace('2d9557d6e902a200.rlib', 'abcdef.rlib'), mapping + '\n' + mapping.replace('/rust/', '/other/')]:
            with self.subTest(mapping=changed):
                with self.assertRaises(ValueError):
                    RUNTIME.verify_builtins(notice, changed, rustc)

    def test_same_version_unknown_rust_commit_is_rejected(self):
        notice, mapping, rustc = self.builtins_fixture()
        with self.assertRaisesRegex(ValueError, 'compiler identity differs'):
            RUNTIME.verify_builtins(notice, mapping, rustc.replace(RUNTIME.RUST_REVISION, '0' * 40))

    def test_changed_rust_material_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'ci').mkdir()
            (root / 'ci/napi-gnu-rust-builtins.json').write_bytes((ROOT / 'ci/napi-gnu-rust-builtins.json').read_bytes())
            first = json.loads((ROOT / 'ci/napi-gnu-rust-builtins.json').read_text())['materials'][0]
            path = root / first['path']
            path.parent.mkdir(parents=True)
            path.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'material identity differs'):
                RUNTIME.builtins_notice(root, TARGET)
            path.unlink()
            with self.assertRaisesRegex(ValueError, 'missing or symlinked'):
                RUNTIME.builtins_notice(root, TARGET)

    def test_changed_rust_profile_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'ci').mkdir()
            (root / 'ci/napi-gnu-rust-builtins.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'profile differs from review'):
                RUNTIME.builtins_notice(root, TARGET)

    def test_prepare_rejects_unknown_rust_before_writing(self):
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary)
            original = b'{"cargo_fixture": true, "rustc": "rustc 1.99.1"}'
            (evidence / 'NOTICE.json').write_bytes(original)
            with self.assertRaisesRegex(ValueError, 'compiler identity differs'):
                RUNTIME.prepare(ROOT, evidence, TARGET)
            self.assertEqual((evidence / 'NOTICE.json').read_bytes(), original)
            self.assertFalse((evidence / 'GNU-RUNTIME-NOTICE.json').exists())

    def test_modified_or_missing_material_profile_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'ci/licenses').mkdir(parents=True)
            (root / 'ci/licenses/napi-gnu-runtime.json').write_text('{}', encoding='utf-8')
            (root / 'ci/napi-gnu-sdk-inputs.json').write_bytes((ROOT / 'ci/napi-gnu-sdk-inputs.json').read_bytes())
            with self.assertRaisesRegex(ValueError, 'differs from review'):
                RUNTIME.runtime_notice(root, TARGET)
            (root / 'ci/licenses/napi-gnu-runtime.json').unlink()
            with self.assertRaisesRegex(ValueError, 'missing or symlinked'):
                RUNTIME.runtime_notice(root, TARGET)


if __name__ == '__main__':
    unittest.main()
