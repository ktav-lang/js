"""Проверить MSVC PE и bounded input guards без native исполнения."""

import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/collect_msvc_napi_evidence.py'
SPEC = importlib.util.spec_from_file_location('msvc', SCRIPT)
MSVC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MSVC)


def pe(machine=0x8664, characteristics=0x2000):
    header = bytearray(64)
    header[:2] = b'MZ'
    struct.pack_into('<I', header, 60, 64)
    return bytes(header) + struct.pack('<4sHHIIIHH', b'PE\0\0', machine, 1, 0, 0, 0, 0, characteristics)


class MsvcEvidenceTests(unittest.TestCase):
    def test_both_dll_machines_are_reported(self):
        for machine in [0x8664, 0xAA64]:
            self.assertEqual(MSVC.pe_machine(pe(machine)), machine)

    def test_executable_is_not_a_dll(self):
        with self.assertRaisesRegex(ValueError, 'DLL image'):
            MSVC.pe_machine(pe(characteristics=0))

    def test_truncated_header_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'DLL image'):
            MSVC.pe_machine(pe()[:-1])

    def test_foreign_format_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'PE library'):
            MSVC.pe_machine(b'not PE')

    def test_outside_pe_offset_is_rejected(self):
        data = bytearray(pe())
        struct.pack_into('<I', data, 60, 0xFFFFFFFF)
        with self.assertRaisesRegex(ValueError, 'DLL image'):
            MSVC.pe_machine(data)

    def test_default_legal_limit_is_unchanged(self):
        self.assertEqual(MSVC.legal_read_limit('unknown/NOTICE.txt', 4 * 1024 * 1024), 4 * 1024 * 1024)
        with self.assertRaisesRegex(ValueError, 'exceeds 4 MiB'):
            MSVC.legal_read_limit('unknown/NOTICE.txt', 4 * 1024 * 1024 + 1)

    def test_large_document_bound_is_path_and_size_specific(self):
        key = 'visual-studio/Licenses/1033/ThirdPartyNotices.txt'
        self.assertEqual(MSVC.legal_read_limit(key, 6167634), 6167634)
        for name in [key.lower(), key + '.other', 'windows-sdk/Licenses/1033/ThirdPartyNotices.txt']:
            with self.subTest(path=name), self.assertRaisesRegex(ValueError, 'exceeds 4 MiB'):
                MSVC.legal_read_limit(name, 6167634)
        for size in [6167633, 6167635, 32 * 1024 * 1024]:
            with self.subTest(size=size), self.assertRaisesRegex(ValueError, 'exceeds 4 MiB'):
                MSVC.legal_read_limit(key, size)

    def test_unknown_same_size_legal_bytes_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'ThirdPartyNotices.txt'
            path.write_bytes(b'x' * 6167634)
            with self.assertRaisesRegex(ValueError, 'unreviewed oversized SDK legal SHA256'):
                MSVC.legal_document(path, 'visual-studio/Licenses/1033/ThirdPartyNotices.txt')

    def test_default_legal_document_bytes_are_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'LICENSE.txt'
            path.write_bytes(b'full original copyright and grant')
            self.assertEqual(MSVC.legal_document(path, 'unknown/LICENSE.txt'), path.read_bytes())

    def test_large_original_reader_still_rejects_overflow(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'ThirdPartyNotices.txt'
            path.write_bytes(b'x' * 6167634)
            self.assertEqual(len(MSVC.read(path, 6167634)), 6167634)
            with path.open('ab') as output:
                output.write(b'x')
            with self.assertRaisesRegex(ValueError, 'exceeds bound'):
                MSVC.read(path, 6167634)

    def test_read_and_fingerprint_size_bounds(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'input.data'
            path.write_bytes(b'1234')
            self.assertEqual(MSVC.read(path, 4), b'1234')
            self.assertEqual(MSVC.fingerprint(path, 4)['bytes'], 4)
            with self.assertRaisesRegex(ValueError, 'exceeds bound'):
                MSVC.read(path, 3)
            with self.assertRaisesRegex(ValueError, 'fingerprint input'):
                MSVC.fingerprint(path, 3)


if __name__ == '__main__':
    unittest.main()
