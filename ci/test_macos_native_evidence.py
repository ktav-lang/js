"""Проверить bounded Mach-O parsing и прежнюю SDK map boundary."""

import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/macos_native_evidence.py'
SPEC = importlib.util.spec_from_file_location('macos', SCRIPT)
MACOS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MACOS)


def dylib_command(command, name):
    payload = name.encode('utf-8') + b'\0'
    payload += bytes((-len(payload)) % 8)
    return struct.pack('<6I', command, 24 + len(payload), 24, 0, 0, 0) + payload


def library(symbol='_PyLong_FromLong', dependency='/usr/lib/libSystem.B.dylib'):
    identity = dylib_command(0xD, '@rpath/ktav_napi.dylib')
    load = dylib_command(0xC, dependency)
    size = len(identity) + len(load) + 24
    offset = 32 + size
    strings = b'\0' + symbol.encode('utf-8') + b'\0'
    symtab = struct.pack('<6I', 2, 24, offset, 1, offset + 16, len(strings))
    header = struct.pack('<8I', 0xFEEDFACF, 0x0100000C, 0, 6, 3, size, 0, 0)
    return header + identity + load + symtab + struct.pack('<IBBHQ', 1, 1, 0, 0, 0) + strings


class MachoTests(unittest.TestCase):
    def test_install_name_is_not_an_import(self):
        report = MACOS.macho(library())
        self.assertEqual(report['install_name'], '@rpath/ktav_napi.dylib')
        self.assertEqual(report['dynamic_libraries'], ['/usr/lib/libSystem.B.dylib'])
        self.assertEqual(report['iconv_charset_undefined_symbols'], [])

    def test_actual_iconv_import_and_dependency_are_reported(self):
        report = MACOS.macho(library('_iconv_open', '/usr/lib/libiconv.2.dylib'))
        self.assertEqual(report['dynamic_libraries'], ['/usr/lib/libiconv.2.dylib'])
        self.assertEqual(report['iconv_charset_undefined_symbols'], ['_iconv_open'])

    def test_executable_is_not_accepted_as_library(self):
        data = bytearray(library())
        struct.pack_into('<I', data, 12, 2)
        with self.assertRaisesRegex(ValueError, 'unreviewed Mach-O library header'):
            MACOS.macho(data)

    def test_truncated_symbol_strings_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'symbol bounds'):
            MACOS.macho(library()[:-1])

    def test_invalid_load_command_length_is_rejected(self):
        data = bytearray(library())
        struct.pack_into('<I', data, 36, 7)
        with self.assertRaisesRegex(ValueError, 'command bounds'):
            MACOS.macho(data)


class RuntimeImportTests(unittest.TestCase):
    def test_only_system_library_passes(self):
        MACOS.verify_runtime_imports(MACOS.macho(library()))

    def test_unused_iconv_dependency_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unused or unreviewed'):
            MACOS.verify_runtime_imports(MACOS.macho(library(dependency='/usr/lib/libiconv.2.dylib')))

    def test_iconv_symbol_is_rejected_even_with_system_library(self):
        with self.assertRaisesRegex(ValueError, 'unused or unreviewed'):
            MACOS.verify_runtime_imports(MACOS.macho(library('_iconv_open')))

    def test_duplicate_system_dependency_is_rejected(self):
        machine = MACOS.macho(library())
        machine['dynamic_libraries'] *= 2
        with self.assertRaisesRegex(ValueError, 'unused or unreviewed'):
            MACOS.verify_runtime_imports(machine)


class MapTests(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        cargo, rustlib, sdk = root / 'target/deps', root / 'rust/lib', root / 'sdk'
        cargo.mkdir(parents=True)
        rustlib.mkdir(parents=True)
        (sdk / 'usr/lib').mkdir(parents=True)
        stub = sdk / 'usr/lib/libSystem.tbd'
        stub.write_bytes(b'stub')
        rows = ['linker synthesized', str(cargo / 'ktav_napi.rcgu.o'), str(stub)]
        return root, cargo, rustlib, sdk, rows

    def map(self, rows):
        return ('# Object files:\n' + ''.join(f'[{index}] {name}\n' for index, name in enumerate(rows)) + '# Sections:\n').encode('utf-8')

    def test_rust_and_system_stub_pass(self):
        _, cargo, rustlib, sdk, rows = self.fixture()
        report = MACOS.object_inputs(self.map(rows), cargo, rustlib, sdk)
        self.assertEqual([item['kind'] for item in report], ['linker-synthesized', 'rust-object', 'system-stub'])

    def test_unknown_sdk_public_stub_is_rejected(self):
        _, cargo, rustlib, sdk, rows = self.fixture()
        alias = sdk / 'usr/lib/foreign.tbd'
        alias.symlink_to(sdk / 'usr/lib/libSystem.tbd')
        rows[-1] = str(alias)
        with self.assertRaisesRegex(ValueError, 'unreviewed Darwin SDK stub'):
            MACOS.object_inputs(self.map(rows), cargo, rustlib, sdk)

    def test_sdk_symlink_escape_is_rejected(self):
        root, cargo, rustlib, sdk, rows = self.fixture()
        outside = root / 'outside.tbd'
        outside.write_bytes(b'stub')
        stub = sdk / 'usr/lib/libSystem.tbd'
        stub.unlink()
        stub.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'escapes selected SDK'):
            MACOS.object_inputs(self.map(rows), cargo, rustlib, sdk)

    def test_external_static_archive_is_rejected(self):
        _, cargo, rustlib, sdk, rows = self.fixture()
        rows.append(str(sdk / 'usr/lib/unknown.a'))
        with self.assertRaisesRegex(ValueError, 'external static object'):
            MACOS.object_inputs(self.map(rows), cargo, rustlib, sdk)

    def test_foreign_rust_object_is_rejected(self):
        root, cargo, rustlib, sdk, rows = self.fixture()
        rows[1] = str(root / 'foreign.rcgu.o')
        with self.assertRaisesRegex(ValueError, 'outside reviewed Cargo'):
            MACOS.object_inputs(self.map(rows), cargo, rustlib, sdk)

    def test_duplicate_object_section_is_rejected(self):
        _, cargo, rustlib, sdk, rows = self.fixture()
        with self.assertRaisesRegex(ValueError, 'missing or duplicate'):
            MACOS.object_inputs(self.map(rows) + self.map(rows), cargo, rustlib, sdk)


if __name__ == '__main__':
    unittest.main()
