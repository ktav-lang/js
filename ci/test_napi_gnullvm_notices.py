"""Проверить source/grant/input boundaries licensed GNU NAPI variant без toolchain."""

import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import tarfile
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import napi_gnullvm_notices as RUNTIME
from prepare_gnu_napi_variant_notices import bind_variant_license, configure, resource_hook
from stage_gnu_napi_variant import fingerprints


class NapiRuntimeTests(unittest.TestCase):
    def fixture(self, target='x86_64-pc-windows-gnullvm'):
        document = RUNTIME.catalogue(ROOT)
        selected = document['targets'][target]
        inputs = [{'path': 'repro/llvm-mingw-20261020-ucrt-x86_64/' + item['path'], 'bytes': item['size'], 'sha256': item['sha256']} for item in selected['sdk_inputs']]
        mapping = '\n'.join('00001000 00000004 4  ' + name + ':(.text)' for name in selected['retained_objects']).encode()
        return document, inputs, mapping, target

    def test_both_exact_target_input_policies(self):
        for target in ['x86_64-pc-windows-gnullvm', 'aarch64-pc-windows-gnullvm']:
            document, inputs, mapping, target = self.fixture(target)
            RUNTIME.verify_inputs(inputs, mapping, document, target)
            self.assertEqual(len(document['targets'][target]['retained_objects']), 29 if target.startswith('x86_64') else 22)

    def test_complete_new_original_license_is_retained(self):
        document = RUNTIME.catalogue(ROOT)
        self.assertEqual(len(document['source_files']), 61)
        self.assertEqual(len(document['original_documents']), 7)
        text = RUNTIME.plain_notice(document)
        self.assertIn(b'Copyright (c) 2020-present LongYinan', text)
        self.assertIn(b'Copyright (c) 2018 GitHub', text)
        for item in document['original_documents']:
            raw = item['text'].encode('utf-8')
            self.assertIn(raw, text)
            self.assertEqual(hashlib.sha256(raw).hexdigest(), item['sha256'])
            self.assertEqual(hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(), item['git_blob'])
        sources = [item for item in document['source_files'] if item['path'].endswith('crtdll_atexit_register.c')]
        self.assertEqual(len(sources), 1)
        self.assertIn('Public Domain', sources[0]['source_notices'][0])

    def test_unknown_or_missing_retained_object_is_rejected(self):
        for extra in [True, False]:
            document, inputs, mapping, target = self.fixture()
            if extra:
                mapping += b'\n00001000 00000004 4  foreign.o:(.text)'
            else:
                mapping = b'\n'.join(mapping.splitlines()[1:])
            with self.assertRaisesRegex(ValueError, 'SDK bytes or retained objects differ'):
                RUNTIME.verify_inputs(inputs, mapping, document, target)

    def test_changed_sdk_archive_or_size_is_rejected(self):
        for key in ['bytes', 'sha256']:
            document, inputs, mapping, target = self.fixture()
            inputs[0][key] = 0 if key == 'bytes' else '0' * 64
            with self.assertRaisesRegex(ValueError, 'SDK bytes or retained objects differ'):
                RUNTIME.verify_inputs(inputs, mapping, document, target)

    def test_exact_target_libloading_rust_output_is_accepted(self):
        for target in ['x86_64-pc-windows-gnullvm', 'aarch64-pc-windows-gnullvm']:
            document, inputs, mapping, target = self.fixture(target)
            inputs.append({'path': 'repro/target/' + target + '/release/deps/rustcABC/liblibloading-0123456789abcdef.rlib', 'bytes': 2122, 'sha256': '0' * 64})
            RUNTIME.verify_inputs(inputs, mapping, document, target)
            for path in ['repro/target/' + target + '/release/deps/rustcABC/libforeign-0123456789abcdef.rlib', 'repro/target/foreign-target/release/deps/rustcABC/liblibloading-0123456789abcdef.rlib', 'repro/foreign/liblibloading-0123456789abcdef.rlib']:
                with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'outside reviewed SDK/Rust boundary'):
                    RUNTIME.verify_inputs(inputs + [{'path': path, 'bytes': 2122, 'sha256': '0' * 64}], mapping, document, target)

    def test_unknown_native_input_is_rejected(self):
        document, inputs, mapping, target = self.fixture()
        inputs.append({'path': 'foreign/foreign.lib', 'bytes': 1, 'sha256': '0' * 64})
        with self.assertRaisesRegex(ValueError, 'outside reviewed SDK/Rust boundary'):
            RUNTIME.verify_inputs(inputs, mapping, document, target)

    def test_changed_catalogue_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / RUNTIME.CATALOG
            path.parent.mkdir(parents=True)
            path.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'unreviewed'):
                RUNTIME.catalogue(root)

    def test_source_fetch_allowlist_is_exact(self):
        for url in ['https://foreign.invalid/LICENSE', 'https://raw.githubusercontent.com/napi-rs/napi-rs/main/LICENSE']:
            with self.assertRaisesRegex(ValueError, 'unreviewed'):
                RUNTIME.original(url)

    def test_augment_preserves_original_cargo_compiler_and_variant_roles(self):
        document = RUNTIME.catalogue(ROOT)
        before = {'schema_version': 1, 'coverage': 'fixture', 'packages': ['original'], 'rust_compiler_builtins': {'materials': ['unchanged']}, 'source_variant': {'source_ref': 'unchanged'}}
        result = RUNTIME.augment(copy.deepcopy(before), document, 'x86_64-pc-windows-gnullvm')
        self.assertEqual({key: value for key, value in result.items() if key not in {'coverage', 'non_cargo_runtimes'}}, {key: value for key, value in before.items() if key != 'coverage'})
        with self.assertRaisesRegex(ValueError, 'preparation state'):
            RUNTIME.augment(result, document, 'x86_64-pc-windows-gnullvm')

    def test_explicit_local_patch_preserves_original_cargo_config(self):
        source = (ROOT / 'ci/fixtures/windows-gnu-napi/project-config.toml.txt').read_bytes()
        patched = configure(source, Path('vendor/napi').resolve())
        parsed = tomllib.loads(patched.decode())
        self.assertEqual(parsed.pop('patch'), {'crates-io': {'napi': {'path': Path('vendor/napi').resolve().as_posix()}}})
        self.assertEqual(parsed, tomllib.loads(source.decode()))
        with self.assertRaisesRegex(ValueError, 'Cargo config'):
            configure(patched, Path('vendor/napi').resolve())

    def test_resource_overlay_keeps_encoder_and_only_guards_setup(self):
        source = (ROOT / 'ci/fixtures/windows-gnu-napi/resource-build.rs.txt').read_bytes()
        patched = resource_hook(source)
        self.assertIn(b'CARGO_CFG_TARGET_ENV', patched)
        self.assertIn(b'KTAV-NOTICES-GZIP-v1', patched)
        self.assertEqual(patched.count(b'napi_build::setup();'), 1)
        with self.assertRaisesRegex(ValueError, 'resource template'):
            resource_hook(source + b'changed')

    def test_variant_license_binding_preserves_other_registry_fallbacks(self):
        with tempfile.TemporaryDirectory() as temporary:
            vendor = Path(temporary)
            grant = next(item for item in RUNTIME.catalogue(ROOT)['original_documents'] if 'napi-rs/napi-rs/' in item['source'])
            (vendor / 'LICENSE').write_text(grant['text'], encoding='utf-8', newline='')
            package = {'id': 'local-napi', 'name': 'napi', 'version': '3.15.0', 'source': None, 'license': 'MIT', 'manifest_path': str(vendor / 'Cargo.toml')}
            metadata = {'packages': [package]}
            entry = {'id': 'MIT', 'text': 'generic fallback', 'source_path': None, 'used_by': [{'crate': {'id': 'local-napi'}}, {'crate': {'id': 'registry-napi-sys'}}]}
            report = {'licenses': [entry]}
            combined = bind_variant_license(metadata, report, vendor, grant)
            self.assertEqual(combined['licenses'][0], {**entry, 'used_by': [{'crate': {'id': 'registry-napi-sys'}}]})
            self.assertEqual(combined['licenses'][1]['text'], grant['text'])
            self.assertEqual(combined['licenses'][1]['used_by'], [{'crate': {'id': 'local-napi'}}])
            self.assertEqual(report, {'licenses': [entry]})
            for key, wrong in [('version', '3.15.1'), ('source', 'registry+https://github.com/rust-lang/crates.io-index'), ('license', 'MIT OR GPL-3.0-only'), ('manifest_path', str(vendor / 'foreign/Cargo.toml'))]:
                with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'source identity differs'):
                    bind_variant_license({'packages': [{**package, key: wrong}]}, report, vendor, grant)
            for licenses in [[], [entry, entry], [{**entry, 'id': 'Apache-2.0'}], [{**entry, 'source_path': 'foreign/LICENSE'}]]:
                with self.assertRaisesRegex(ValueError, 'coverage differs|shape differs'):
                    bind_variant_license(metadata, {'licenses': licenses}, vendor, grant)
            (vendor / 'LICENSE').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'original license differs'):
                bind_variant_license(metadata, report, vendor, grant)

    def test_linker_fingerprints_preserve_actual_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'link.tar'
            with tarfile.open(path, 'w:') as archive:
                item = tarfile.TarInfo('repro/response.txt')
                item.size = 3
                archive.addfile(item, io.BytesIO(b'abc'))
            self.assertEqual(fingerprints(path), [{'path': 'repro/response.txt', 'bytes': 3, 'sha256': hashlib.sha256(b'abc').hexdigest()}])

    def test_unsafe_or_duplicate_linker_members_are_rejected(self):
        for name in ['../response.txt', '/response.txt', 'C:/response.txt', 'repro\\response.txt', 'repro/response.txt']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                path = Path(temporary) / 'link.tar'
                with tarfile.open(path, 'w:') as archive:
                    archive.addfile(tarfile.TarInfo('repro/response.txt'), io.BytesIO(b''))
                    archive.addfile(tarfile.TarInfo(name), io.BytesIO(b''))
                with self.assertRaisesRegex(ValueError, 'unsafe or duplicate'):
                    fingerprints(path)

    def test_linker_symlink_and_missing_response_are_rejected(self):
        for symlink in [True, False]:
            with tempfile.TemporaryDirectory() as temporary:
                path = Path(temporary) / 'link.tar'
                with tarfile.open(path, 'w:') as archive:
                    item = tarfile.TarInfo('repro/object.o')
                    if symlink:
                        item.type = tarfile.SYMTYPE
                        item.linkname = 'foreign'
                    archive.addfile(item, io.BytesIO(b''))
                with self.assertRaisesRegex(ValueError, 'type/size|response missing'):
                    fingerprints(path)


if __name__ == '__main__':
    unittest.main()
