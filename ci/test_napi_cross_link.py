"""Проверить прозрачность и границы NAPI GNU map capture."""

import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/capture_napi_cross_link.py'
SPEC = importlib.util.spec_from_file_location('capture', SCRIPT)
CAPTURE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CAPTURE)


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.workspace = self.root / 'workspace'
        self.workspace.mkdir()
        self.evidence = self.root / 'evidence'
        self.evidence.mkdir()
        self.environment = {'KTAV_NAPI_TARGET': 'x86_64-unknown-linux-gnu', 'GITHUB_WORKSPACE': str(self.workspace), 'KTAV_NAPI_LINK_EVIDENCE': str(self.evidence)}

    def test_probe_arguments_are_unchanged(self):
        compiler, args, record = CAPTURE.command(['--version', 'with space'], self.environment, self.root)
        self.assertEqual(args, [str(compiler), '--version', 'with space'])
        self.assertIsNone(record)
        self.assertEqual(list(self.evidence.iterdir()), [])

    def test_shared_link_preserves_arguments_and_adds_map(self):
        original = ['-shared', '-o', str(self.workspace / 'libktav_napi.so'), 'with space']
        compiler, args, record = CAPTURE.command(original, self.environment, self.root)
        self.assertEqual(args[:-1], [str(compiler), *original])
        self.assertTrue(args[-1].startswith('-Wl,-Map='))
        self.assertEqual(record['arguments'], original)
        files = list(self.evidence.glob('*.json'))
        self.assertEqual(len(files), 1)
        self.assertEqual(json.loads(files[0].read_text()), record)

    def test_foreign_output_rejected(self):
        with self.assertRaisesRegex(ValueError, 'belong to this build'):
            CAPTURE.command(['-shared', '-o', str(self.root / 'foreign.so')], self.environment, self.root)

    def test_unknown_target_rejected(self):
        self.environment['KTAV_NAPI_TARGET'] = 'unknown'
        with self.assertRaisesRegex(ValueError, 'unreviewed'):
            CAPTURE.command(['--version'], self.environment, self.root)

    def test_compiler_failure_status_is_not_masked(self):
        compiler = self.root / '.napi-rs/cross-toolchain/1.0.3/x86_64-unknown-linux-gnu/bin/x86_64-unknown-linux-gnu-gcc'
        compiler.parent.mkdir(parents=True)
        compiler.write_text('#!/bin/sh\nexit 23\n')
        compiler.chmod(0o755)
        result = subprocess.run([sys.executable, str(SCRIPT), '--version'], env={**os.environ, **self.environment, 'HOME': str(self.root)}, capture_output=True)
        self.assertEqual(result.returncode, 23)


COLLECT_SPEC = importlib.util.spec_from_file_location('collector', SCRIPT.with_name('collect_napi_link_evidence.py'))
COLLECT = importlib.util.module_from_spec(COLLECT_SPEC)
COLLECT_SPEC.loader.exec_module(COLLECT)


class NoticeByteTests(unittest.TestCase):
    def test_utf8_notice_is_preserved_exactly(self):
        data = 'Copyright © fixture'.encode('utf-8')
        record = COLLECT.notice_record('LICENSE', data)
        self.assertEqual(record['utf8_text'].encode('utf-8'), data)
        self.assertEqual(base64.b64decode(record['raw_bytes_base64']), data)
        self.assertFalse(record['requires_encoding_review'])

    def test_non_utf8_notice_is_not_lossily_decoded(self):
        data = b'Copyright \xa9 fixture'
        record = COLLECT.notice_record('COPYING', data)
        self.assertIsNone(record['utf8_text'])
        self.assertTrue(record['requires_encoding_review'])
        self.assertEqual(base64.b64decode(record['raw_bytes_base64']), data)
        self.assertEqual(record['sha256'], hashlib.sha256(data).hexdigest())

    def test_binary_notice_bytes_remain_uninterpreted(self):
        data = bytes([31, 139, 255, 0])
        record = COLLECT.notice_record('COPYING.gz', data)
        self.assertEqual(base64.b64decode(record['raw_bytes_base64']), data)
        self.assertTrue(record['requires_encoding_review'])


class SdkInputTests(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        sdk = root / 'sdk'
        entries = {}
        for name, data in [('bin/compiler', b'compiler'), ('bin/config', b'config'), ('lib/runtime.o', b'runtime')]:
            path = sdk / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            entries[name] = {'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        catalog = {'repository_revision': 'a' * 40, 'targets': {'x86_64-unknown-linux-gnu': {'compiler': entries['bin/compiler'], 'configuration': entries['bin/config'], 'runtime_inputs': [entries['lib/runtime.o']]}}}
        return sdk, catalog, 'LOAD ' + (sdk / 'lib/runtime.o').as_posix() + '\n'

    def test_exact_compiler_config_and_loaded_runtime_are_bound(self):
        sdk, catalog, link_map = self.fixture()
        report = COLLECT.sdk_inputs(sdk, link_map, 'x86_64-unknown-linux-gnu', catalog)
        self.assertEqual(len(report['inputs']), 3)
        self.assertEqual([item['path'] for item in report['inputs'] if item['role'] == 'runtime'], ['lib/runtime.o'])

    def test_changed_runtime_bytes_are_rejected(self):
        sdk, catalog, link_map = self.fixture()
        (sdk / 'lib/runtime.o').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'pinned repository bytes'):
            COLLECT.sdk_inputs(sdk, link_map, 'x86_64-unknown-linux-gnu', catalog)

    def test_changed_compiler_bytes_are_rejected(self):
        sdk, catalog, link_map = self.fixture()
        (sdk / 'bin/compiler').write_bytes(b'altered!')
        with self.assertRaisesRegex(ValueError, 'pinned repository bytes'):
            COLLECT.sdk_inputs(sdk, link_map, 'x86_64-unknown-linux-gnu', catalog)

    def test_missing_loaded_runtime_is_rejected(self):
        sdk, catalog, _ = self.fixture()
        with self.assertRaisesRegex(ValueError, 'static input inventory'):
            COLLECT.sdk_inputs(sdk, '', 'x86_64-unknown-linux-gnu', catalog)

    def test_unknown_loaded_sdk_archive_is_rejected(self):
        sdk, catalog, link_map = self.fixture()
        (sdk / 'lib/unknown.a').write_bytes(b'archive')
        link_map += 'LOAD ' + (sdk / 'lib/unknown.a').as_posix() + '\n'
        with self.assertRaisesRegex(ValueError, 'static input inventory'):
            COLLECT.sdk_inputs(sdk, link_map, 'x86_64-unknown-linux-gnu', catalog)

    def test_inside_sdk_alias_is_normalized(self):
        sdk, catalog, _ = self.fixture()
        alias = sdk / 'lib/alias.o'
        alias.symlink_to(sdk / 'lib/runtime.o')
        report = COLLECT.sdk_inputs(sdk, 'LOAD ' + alias.as_posix() + '\n', 'x86_64-unknown-linux-gnu', catalog)
        self.assertEqual(report['inputs'][-1]['path'], 'lib/runtime.o')

    def test_sdk_symlink_escape_is_rejected(self):
        sdk, catalog, link_map = self.fixture()
        outside = sdk.parent / 'outside.o'
        outside.write_bytes(b'runtime')
        path = sdk / 'lib/runtime.o'
        path.unlink()
        path.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'escapes selected SDK'):
            COLLECT.sdk_inputs(sdk, link_map, 'x86_64-unknown-linux-gnu', catalog)

    def test_extra_mapped_sdk_symlink_escape_is_not_ignored(self):
        sdk, catalog, link_map = self.fixture()
        outside = sdk.parent / 'outside.a'
        outside.write_bytes(b'archive')
        alias = sdk / 'lib/escape.a'
        alias.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'mapped SDK static input escapes'):
            COLLECT.sdk_inputs(sdk, link_map + 'LOAD ' + alias.as_posix() + '\n', 'x86_64-unknown-linux-gnu', catalog)

    def test_catalog_path_traversal_is_rejected(self):
        sdk, catalog, link_map = self.fixture()
        catalog['targets']['x86_64-unknown-linux-gnu']['runtime_inputs'][0]['path'] = '../outside.o'
        with self.assertRaisesRegex(ValueError, 'unsafe reviewed SDK input path'):
            COLLECT.sdk_inputs(sdk, link_map, 'x86_64-unknown-linux-gnu', catalog)


if __name__ == '__main__':
    unittest.main()
