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


if __name__ == '__main__':
    unittest.main()
