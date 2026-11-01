"""Проверить fail-closed native npm role layout без выполнения binaries."""

import contextlib
import gzip
import io
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import tarfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import native_npm_payload as PAYLOAD
import assemble_native_npm as ASSEMBLY
import check_native_npm as PACKED


@contextlib.contextmanager
def cwd(path):
    before = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(before)


class PayloadTests(unittest.TestCase):
    def fixture(self, temporary, role='napi'):
        root = Path(temporary)
        evidence = root / ('evidence-' + role)
        evidence.mkdir()
        for name in PAYLOAD.LICENSES:
            (root / name).write_bytes((ROOT / name).read_bytes())
        lock = ('version = 3\n\n[[package]]\nname = "ktav"\nversion = "0.8.1"\nchecksum = "' + PAYLOAD.CORE + '"\n').encode()
        notice = (json.dumps({'schema_version': 1, 'cargo_lock_sha256': PAYLOAD.sha(lock)}) + '\n').encode()
        compressed = gzip.compress(notice, mtime=0)
        raw = bytearray(32)
        raw[:4] = bytes.fromhex('cffaedfe')
        struct.pack_into('<I', raw, 4, 0x1000007)
        struct.pack_into('<I', raw, 12, 6)
        binary = bytes(raw) + PAYLOAD.MARKER + len(compressed).to_bytes(8, 'little') + compressed
        values = {
            'NOTICE.json': notice,
            'NOTICE.json.gz': compressed,
            'Cargo.lock': lock,
            'COPYRIGHT-library.html': b'fixture standard library grant',
            'rustc.txt': b'fixture compiler identity',
            'source-provenance.json': json.dumps({'source_ref': PAYLOAD.SOURCE, 'tooling_ref': 'a' * 40}).encode(),
            role + '-macos-verification.json': json.dumps({'target': 'x86_64-apple-darwin', 'role': role, 'binary_sha256': PAYLOAD.sha(binary)}).encode(),
            role + '-embedded-verification.json': b'{}',
            role + '-native-link.map': b'fixture linker map',
            PAYLOAD.identity('darwin-x64', role)[1]: binary,
            'unrelated.json': b'not a legal or source role',
        }
        for name, content in values.items():
            (evidence / name).write_bytes(content)
        return root, evidence, root / ('output-' + role), PAYLOAD.sha(lock)

    def create_payload(self, temporary):
        root, evidence, output, lock = self.fixture(temporary)
        with cwd(root), patch.object(PAYLOAD, 'LOCK', lock):
            PAYLOAD.stage(evidence, output, 'darwin-x64', 'napi')
        return root, evidence, output, lock

    def refresh_manifest(self, output):
        path = output / 'native-role-manifest.json'
        document = json.loads(path.read_bytes())
        document['files'] = [item for item in PAYLOAD.files(output) if item['path'] != path.name]
        path.write_text(json.dumps(document), encoding='utf-8')

    def test_complete_payload_retains_bytes_and_only_explicit_roles(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, evidence, output, lock = self.create_payload(temporary)
            with patch.object(PAYLOAD, 'LOCK', lock):
                document = PAYLOAD.contract(output, 'darwin-x64', 'napi')
            self.assertEqual(document['actual_target'], 'x86_64-apple-darwin')
            self.assertEqual(document['package_binary'], 'ktav.darwin-x64.node')
            self.assertEqual((output / 'legal/NOTICE.json').read_bytes(), (evidence / 'NOTICE.json').read_bytes())
            self.assertFalse((output / 'legal/unrelated.json').exists())
            self.assertEqual(len(document['files']), 12)

    def test_missing_legal_role_rejected_even_with_rehashed_manifest(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, evidence, output, lock = self.create_payload(temporary)
            (output / 'legal/COPYRIGHT-library.html').unlink()
            self.refresh_manifest(output)
            with patch.object(PAYLOAD, 'LOCK', lock), self.assertRaisesRegex(ValueError, 'mandatory native legal/source role set differs'):
                PAYLOAD.contract(output, 'darwin-x64', 'napi')

    def test_changed_file_bytes_fail_manifest_verification(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, evidence, output, lock = self.create_payload(temporary)
            (output / 'legal/NOTICE.json').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'manifest differs'):
                PAYLOAD.contract(output, 'darwin-x64', 'napi')

    def test_changed_compressed_sidecar_cannot_be_hidden_by_manifest(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, evidence, output, lock = self.create_payload(temporary)
            notice = (output / 'legal/NOTICE.json').read_bytes()
            (output / 'legal/NOTICE.json.gz').write_bytes(gzip.compress(notice, mtime=1))
            self.refresh_manifest(output)
            with patch.object(PAYLOAD, 'LOCK', lock), self.assertRaisesRegex(ValueError, 'actual resource identity differs'):
                PAYLOAD.contract(output, 'darwin-x64', 'napi')

    def test_wrong_cpu_is_rejected_before_payload_staging(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, evidence, output, lock = self.fixture(temporary)
            binary = evidence / 'ktav.darwin-x64.node'
            raw = bytearray(binary.read_bytes())
            struct.pack_into('<I', raw, 4, 0x100000C)
            binary.write_bytes(raw)
            with cwd(root), patch.object(PAYLOAD, 'LOCK', lock), self.assertRaisesRegex(ValueError, 'Mach-O CPU/library kind differs'):
                PAYLOAD.stage(evidence, output, 'darwin-x64', 'napi')
            self.assertFalse(output.exists())

    def test_unknown_role_and_windows_target_spoof_are_rejected(self):
        self.assertEqual(len(PAYLOAD.TARGETS), 8)
        for rid in ['win32-x64-msvc', 'win32-arm64-msvc']:
            target, name = PAYLOAD.identity(rid, 'napi')
            self.assertTrue(target.endswith('-gnullvm'))
            self.assertEqual(name, 'ktav.' + rid + '.node')
        for rid, role in [('unknown-rid', 'napi'), ('darwin-x64', 'unknown-role')]:
            with self.assertRaisesRegex(ValueError, 'unreviewed'):
                PAYLOAD.identity(rid, role)

    def test_unknown_paths_and_case_collisions_are_rejected(self):
        for name in ['../file', '/file', 'C:/file', 'tree' + chr(92) + 'file']:
            with self.assertRaisesRegex(ValueError, 'unsafe'):
                PAYLOAD.relative(name)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'NOTICE').write_bytes(b'first')
            (root / 'notice').write_bytes(b'second')
            with self.assertRaisesRegex(ValueError, 'case-folded'):
                PAYLOAD.files(root)

    def test_symlink_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'original').write_bytes(b'original')
            (root / 'alias').symlink_to(root / 'original')
            with self.assertRaisesRegex(ValueError, 'entry kind'):
                PAYLOAD.files(root)

    def test_existing_output_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, evidence, output, lock = self.fixture(temporary)
            output.mkdir()
            (output / 'keep').write_bytes(b'keep')
            with cwd(root), patch.object(PAYLOAD, 'LOCK', lock), self.assertRaises(FileExistsError):
                PAYLOAD.stage(evidence, output, 'darwin-x64', 'napi')
            self.assertEqual((output / 'keep').read_bytes(), b'keep')

    def assembled_fixture(self, temporary):
        inputs = {}
        for role in ['napi', 'cabi']:
            root, evidence, output, lock = self.fixture(temporary, role)
            with cwd(root), patch.object(PAYLOAD, 'LOCK', lock):
                PAYLOAD.stage(evidence, output, 'darwin-x64', role)
            inputs[role] = output
        template = root / 'template'
        template.mkdir()
        metadata = {'name': '@ktav-lang/js-darwin-x64', 'version': '0.8.1', 'license': 'MIT OR Apache-2.0', 'main': 'ktav.darwin-x64.node', 'cpu': ['x64'], 'os': ['darwin'], 'files': ['ktav.darwin-x64.node', 'libktav_cabi.dylib']}
        (template / 'package.json').write_text(json.dumps(metadata), encoding='utf-8')
        for name in ASSEMBLY.DOCS:
            (template / name).write_text('fixture documentation: ' + name, encoding='utf-8')
        return root, inputs, template, root / 'package', lock

    def test_assembler_preserves_two_distinct_complete_role_trees(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, inputs, template, output, lock = self.assembled_fixture(temporary)
            with patch.object(PAYLOAD, 'LOCK', lock):
                result = ASSEMBLY.assemble_platform('darwin-x64', inputs, template, output)
                ASSEMBLY.verify_platform(output, 'darwin-x64')
            self.assertEqual(set(result['roles']), {'napi', 'cabi'})
            self.assertEqual((output / 'ktav.darwin-x64.node').read_bytes(), (inputs['napi'] / 'binary').read_bytes())
            self.assertEqual((output / 'libktav_cabi.dylib').read_bytes(), (inputs['cabi'] / 'binary').read_bytes())
            for role in ['napi', 'cabi']:
                self.assertEqual((output / 'third_party' / role / 'NOTICE.json').read_bytes(), (inputs[role] / 'legal/NOTICE.json').read_bytes())
            metadata = json.loads((output / 'package.json').read_bytes())
            self.assertIn('third_party/', metadata['files'])
            self.assertIn('native-package-manifest.json', metadata['files'])

    def test_assembler_rejects_dropped_legal_role_even_after_all_manifest_updates(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, inputs, template, output, lock = self.assembled_fixture(temporary)
            with patch.object(PAYLOAD, 'LOCK', lock):
                ASSEMBLY.assemble_platform('darwin-x64', inputs, template, output)
            (output / 'third_party/napi/COPYRIGHT-library.html').unlink()
            source_path = output / 'third_party/napi/producer-role-manifest.json'
            source = json.loads(source_path.read_bytes())
            source['files'] = [item for item in source['files'] if item['path'] != 'legal/COPYRIGHT-library.html']
            source_path.write_text(json.dumps(source), encoding='utf-8')
            manifest_path = output / 'native-package-manifest.json'
            manifest = json.loads(manifest_path.read_bytes())
            manifest['roles']['napi']['producer_manifest_sha256'] = PAYLOAD.sha(source_path.read_bytes())
            manifest['files'] = [item for item in PAYLOAD.files(output) if item['path'] != manifest_path.name]
            manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
            with patch.object(PAYLOAD, 'LOCK', lock), self.assertRaisesRegex(ValueError, 'mandatory native legal/source role set differs'):
                ASSEMBLY.verify_platform(output, 'darwin-x64')

    def test_assembler_rejects_metadata_version_or_dependency_drift(self):
        for field, value in [('version', '0.8.2'), ('dependencies', {'foreign': '1.0.0'}), ('scripts', {'install': 'foreign-command'})]:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temporary:
                root, inputs, template, output, lock = self.assembled_fixture(temporary)
                path = template / 'package.json'
                metadata = json.loads(path.read_bytes())
                metadata[field] = value
                path.write_text(json.dumps(metadata), encoding='utf-8')
                with patch.object(PAYLOAD, 'LOCK', lock), self.assertRaisesRegex(ValueError, 'identity differs|must not fetch'):
                    ASSEMBLY.assemble_platform('darwin-x64', inputs, template, output)
                self.assertFalse(output.exists())

    def test_exact_eight_platform_role_pairs_required(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payloads = root / 'payloads'
            payloads.mkdir()
            with self.assertRaisesRegex(ValueError, 'sixteen native role payloads required'):
                ASSEMBLY.assemble(payloads, root / 'templates', root / 'output')
            self.assertFalse((root / 'output').exists())

    def test_actual_native_tarball_retains_both_complete_roles(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, inputs, template, output, lock = self.assembled_fixture(temporary)
            with patch.object(PAYLOAD, 'LOCK', lock):
                ASSEMBLY.assemble_platform('darwin-x64', inputs, template, output)
                archive = root / 'package.tgz'
                with tarfile.open(archive, 'w:gz') as packed:
                    for path in sorted(output.rglob('*')):
                        if path.is_file():
                            packed.add(path, arcname='package/' + path.relative_to(output).as_posix(), recursive=False)
                report = PACKED.verify(archive, 'darwin-x64')
            self.assertEqual(report['package'], '@ktav-lang/js-darwin-x64')
            self.assertEqual(set(report['roles']), {'napi', 'cabi'})
            self.assertEqual(report['package_sha256'], PAYLOAD.sha(archive.read_bytes()))

    def test_tar_traversal_symlinks_and_duplicate_aliases_are_rejected(self):
        for name, symlink in [('../escape', False), ('package/alias', True), ('package/./package.json', False)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive = root / 'package.tgz'
                with tarfile.open(archive, 'w:gz') as packed:
                    first = tarfile.TarInfo('package/package.json')
                    first.size = 2
                    packed.addfile(first, io.BytesIO(b'{}'))
                    entry = tarfile.TarInfo(name)
                    if symlink:
                        entry.type = tarfile.SYMTYPE
                        entry.linkname = '../../escape'
                    packed.addfile(entry, io.BytesIO(b''))
                with self.assertRaisesRegex(ValueError, 'unsafe or duplicate|kind/size'):
                    PACKED.unpack(archive, root / 'unpacked')
                self.assertFalse((root / 'escape').exists())


if __name__ == '__main__':
    unittest.main()
