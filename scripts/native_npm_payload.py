"""Сохранить проверенные native legal/source роли в общем manifest-bound payload."""

import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import struct
import sys
import tomllib

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_embedded_notices import MARKER, _extract
from windows_gnu_napi_variant import verify_lock

SOURCE = '562deb3fde092d63a78f359be095e5079929d0d1'
LOCK = 'c09c21c421fda8a5411f756f5df5718de41d4cf92ad237150592011f9f785932'
CORE = '7140dfe2fa6c320e74768cd6a637828c2d26f81746254f4fcd805f3993bd3fd5'
LICENSES = {'LICENSE-MIT': 'dab3570e779bf2a81f0331e5346b8f663278e624df1daf052751fa5ca2dbab5d', 'LICENSE-APACHE': 'a6dc86d5f5d6c98462c1361d7c062ca8d3a932aa13ecbffbb2ab9f8b1586feec'}
TARGETS = {
    'darwin-x64': 'x86_64-apple-darwin',
    'darwin-arm64': 'aarch64-apple-darwin',
    'linux-x64-gnu': 'x86_64-unknown-linux-gnu',
    'linux-arm64-gnu': 'aarch64-unknown-linux-gnu',
    'linux-x64-musl': 'x86_64-unknown-linux-musl',
    'linux-arm64-musl': 'aarch64-unknown-linux-musl',
    'win32-x64-msvc': 'x86_64-pc-windows-gnullvm',
    'win32-arm64-msvc': 'aarch64-pc-windows-gnullvm',
}
COMMON = ['NOTICE.json', 'NOTICE.json.gz', 'Cargo.lock', 'COPYRIGHT-library.html', 'rustc.txt', 'source-provenance.json']
GNU_NAPI = ['GNU-RUNTIME-NOTICE.json', 'GNU-RUNTIME-NOTICE.txt', 'napi-gnu-sdk-inputs.json', 'sdk-notice-files.json', 'gnu-runtime-verification.json', 'rust-builtins-verification.json', 'native-link.map', 'native-link-inputs.json', 'native-link-command.json']
GNU_CABI = ['NOTICE.cargo-std.json', 'NOTICE.zig-runtime.txt', 'zig-runtime-catalog.json', 'zig-runtime-members.json', 'native-gnu-verification.json', 'native-link.map', 'native-link-command.json']
WINDOWS_CABI = ['NOTICE.cargo-std.json', 'NOTICE.windows-runtime.txt', 'cabi-gnullvm-runtime.json', 'native-runtime-verification.json', 'native-verification.json', 'link-input-fingerprints.json', 'native-link.map', 'sdk-legal.json']
MUSL = ['NOTICE.cargo-std.json', 'NOTICE.source-collection.json', 'NOTICE.musl-runtime.txt', 'NOTICE.rust-builtins.txt', 'musl-retained-runtime.json', 'musl-runtime-catalog.json']


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path, limit=64 * 1024 * 1024):
    if path.is_symlink() or not path.is_file():
        raise ValueError('missing or symlinked payload input: ' + path.name)
    with path.open('rb') as source:
        raw = source.read(limit + 1)
    if len(raw) > limit:
        raise ValueError('payload input exceeds bound')
    return raw


def relative(name):
    path = PurePosixPath(name)
    if not path.parts or path.is_absolute() or '..' in path.parts or chr(92) in name or ':' in name:
        raise ValueError('unsafe payload path')
    return path


def identity(rid, role):
    if rid not in TARGETS or role not in {'napi', 'cabi'}:
        raise ValueError('unreviewed native package role')
    target = TARGETS[rid]
    filename = 'ktav.' + rid + '.node' if role == 'napi' else ('ktav_cabi.dll' if rid.startswith('win32-') else 'libktav_cabi.' + ('dylib' if rid.startswith('darwin-') else 'so'))
    return target, filename


def cpu(raw, target):
    arm = target.startswith('aarch64-')
    if target.endswith('-apple-darwin'):
        if len(raw) < 32 or raw[:4] != b'\xcf\xfa\xed\xfe' or struct.unpack_from('<I', raw, 4)[0] != (0x100000C if arm else 0x1000007) or struct.unpack_from('<I', raw, 12)[0] != 6:
            raise ValueError('native Mach-O CPU/library kind differs')
    elif target.endswith('-gnullvm'):
        if len(raw) < 64 or raw[:2] != b'MZ':
            raise ValueError('native PE header missing')
        offset = int.from_bytes(raw[60:64], 'little')
        if offset + 24 > len(raw) or raw[offset:offset + 4] != b'PE\0\0' or struct.unpack_from('<H', raw, offset + 4)[0] != (0xAA64 if arm else 0x8664) or not struct.unpack_from('<H', raw, offset + 22)[0] & 0x2000:
            raise ValueError('native PE CPU/library kind differs')
    elif len(raw) < 64 or raw[:6] != b'\x7fELF\x02\x01' or struct.unpack_from('<H', raw, 16)[0] != 3 or struct.unpack_from('<H', raw, 18)[0] != (183 if arm else 62):
        raise ValueError('native ELF CPU/library kind differs')


def files(root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError('invalid payload directory')
    result = []
    total = 0
    seen = set()
    for path in sorted(root.rglob('*')):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise ValueError('unexpected payload entry kind')
        if path.is_file():
            name = path.relative_to(root).as_posix()
            relative(name)
            if name.casefold() in seen:
                raise ValueError('duplicate case-folded payload path')
            seen.add(name.casefold())
            raw = read(path, 128 * 1024 * 1024)
            total += len(raw)
            if len(result) >= 4096 or total > 256 * 1024 * 1024:
                raise ValueError('payload inventory exceeds bound')
            result.append({'path': name, 'bytes': len(raw), 'sha256': sha(raw)})
    return sorted(result, key=lambda item: item['path'])


def check_manifest(root, manifest_name):
    document = json.loads(read(root / manifest_name, 4 * 1024 * 1024))
    rows = document['files']
    if len(rows) != len({item['path'] for item in rows}):
        raise ValueError('duplicate manifest role')
    actual = [item for item in files(root) if item['path'] != manifest_name]
    if sorted(rows, key=lambda item: item['path']) != actual:
        raise ValueError('complete native payload manifest differs')
    return document


def contract(root, rid, role):
    document = check_manifest(root, 'native-role-manifest.json')
    target, filename = identity(rid, role)
    if document['schema_version'] != 1 or document['rid'] != rid or document['role'] != role or document['actual_target'] != target or document['source_ref'] != SOURCE or document['package_binary'] != filename:
        raise ValueError('native role identity differs')
    raw = read(root / 'binary', 128 * 1024 * 1024)
    notice = read(root / 'legal/NOTICE.json')
    cpu(raw, target)
    decoded, compressed_bytes = _extract(raw)
    start = raw.index(MARKER) + len(MARKER) + 8
    if sha(raw) != document['binary_sha256'] or sha(notice) != document['notice_sha256'] or decoded != notice or raw[start:start + compressed_bytes] != read(root / 'legal/NOTICE.json.gz', 4 * 1024 * 1024):
        raise ValueError('native role actual resource identity differs')
    for name, expected in LICENSES.items():
        if sha(read(root / name, 64 * 1024)) != expected:
            raise ValueError('original first-party license differs')
    required = set(COMMON)
    trees = {}
    if target.endswith('-gnullvm') and role == 'napi':
        original = json.loads(read(root / 'legal/native-payload-manifest.json', 4 * 1024 * 1024))
        original_paths = {item['path'] for item in original['files']}
        source_roles = {'source/project-original.tar', 'source/napi-3.15.0-source.tar.gz', 'source/README.txt', 'source/overlays/.cargo/config.toml', 'source/overlays/crates/napi/build.rs', 'source/overlays/crates/napi/Cargo.toml', 'source/overlays/crates/napi/src/lib.rs'}
        if original['target'] != target or original['source_ref'] != SOURCE or original['binary_sha256'] != sha(raw) or original['notice_sha256'] != sha(notice) or len(original['files']) != 106 or len(original_paths) != 106 or not source_roles.issubset(original_paths) or sum(name.startswith('runtime-originals/') for name in original_paths) != 68 or sum(name.startswith('rust-compiler-originals/') for name in original_paths) != 14:
            raise ValueError('complete GNU NAPI producer role set differs')
        for item in original['files']:
            path = relative(item['path'])
            content = raw if str(path) == 'ktav_napi.node' else read(root / 'legal' / path, 128 * 1024 * 1024)
            if len(content) != item['bytes'] or sha(content) != item['sha256']:
                raise ValueError('GNU NAPI original producer role changed')
        required = {item['path'] for item in original['files'] if item['path'] != 'ktav_napi.node'} | {'native-payload-manifest.json'}
    elif target.endswith('-apple-darwin'):
        required.update([role + '-macos-verification.json', role + '-embedded-verification.json', role + '-native-link.map'])
    elif target.endswith('-musl'):
        required.update(MUSL)
        required.update(role + '/' + name for name in ['Cargo.lock', 'NOTICE.json', 'NOTICE.json.gz', 'NOTICE.cargo-std.json', 'NOTICE.musl-runtime.txt', 'musl-runtime-catalog.json', 'source-provenance.json', 'native-verification.json', 'retained-runtime-verification.json', 'embedded-verification.json', 'native-link-command.json', 'native-link.map'])
        trees = {'runtime-rust-originals': 13}
    elif target.endswith('-gnullvm'):
        required.update(WINDOWS_CABI)
        trees = {'runtime-originals': 64}
    else:
        required.update(GNU_NAPI if role == 'napi' else GNU_CABI)
    actual = {item['path'] for item in document['files']}
    for tree, count in trees.items():
        members = [name for name in actual if name.startswith('legal/' + tree + '/')]
        if len(members) != count:
            raise ValueError('mandatory original source tree roles differ')
        required.update(name.removeprefix('legal/') for name in members)
    if actual != {'binary', *LICENSES} | {'legal/' + name for name in required}:
        raise ValueError('mandatory native legal/source role set differs')
    lock = read(root / 'legal/Cargo.lock', 4 * 1024 * 1024)
    bundle = json.loads(notice)
    cores = [item for item in tomllib.loads(lock.decode())['package'] if item['name'] == 'ktav']
    if bundle.get('schema_version') != 1 or bundle['cargo_lock_sha256'] != sha(lock) or len(cores) != 1 or cores[0]['version'] != '0.8.1' or cores[0].get('checksum') != CORE:
        raise ValueError('actual native source/core/lock identity differs')
    windows_napi = target.endswith('-gnullvm') and role == 'napi'
    if not windows_napi and sha(lock) != LOCK:
        raise ValueError('original reviewed native lock differs')
    provenance = json.loads(read(root / 'legal' / ('source-variant.json' if windows_napi else 'source-provenance.json')))
    if windows_napi:
        original_lock = read(root / 'legal/Cargo.original.lock', 4 * 1024 * 1024)
        if sha(original_lock) != LOCK or lock != read(root / 'legal/Cargo.variant.lock', 4 * 1024 * 1024) or provenance['variant_lock_sha256'] != sha(lock) or bundle['source_variant'] != provenance:
            raise ValueError('explicit derivative native graph identity differs')
        verify_lock(tomllib.loads(original_lock.decode()), tomllib.loads(lock.decode()))
    proof_name = ('native-runtime-verification.json' if target.endswith('-gnullvm') else role + '-macos-verification.json' if target.endswith('-apple-darwin') else role + '/retained-runtime-verification.json' if target.endswith('-musl') else 'gnu-runtime-verification.json' if role == 'napi' else 'native-gnu-verification.json')
    proof = json.loads(read(root / 'legal' / proof_name))
    if provenance['source_ref'] != SOURCE or provenance['tooling_ref'] != document['tooling_ref'] or proof['target'] != target or proof['binary_sha256'] != sha(raw) or proof.get('role', role) != role or proof.get('notice_sha256', sha(notice)) != sha(notice):
        raise ValueError('actual producer source/target/resource proof differs')
    return document


def stage(evidence, output, rid, role):
    target, filename = identity(rid, role)
    if evidence.is_symlink() or not evidence.is_dir():
        raise ValueError('invalid producer evidence directory')
    entries = list(evidence.rglob('*'))
    if len(entries) > 8192 or any(path.is_symlink() or not (path.is_file() or path.is_dir()) for path in entries):
        raise ValueError('unsafe or oversized producer evidence tree')
    if output.resolve().is_relative_to(evidence.resolve()):
        raise ValueError('payload output must be outside producer evidence')
    windows_napi = target.endswith('-gnullvm') and role == 'napi'
    binary = evidence / ('ktav_napi.node' if windows_napi else filename)
    if target.endswith('-musl'):
        binary = evidence / role / filename
    raw = read(binary, 128 * 1024 * 1024)
    cpu(raw, target)
    notice = read(evidence / 'NOTICE.json')
    if _extract(raw)[0] != notice:
        raise ValueError('producer binary does not retain actual notice')
    bundle = json.loads(notice)
    lock = read(evidence / 'Cargo.lock', 4 * 1024 * 1024)
    if bundle['cargo_lock_sha256'] != sha(lock):
        raise ValueError('native resource lock identity differs')
    cores = [item for item in tomllib.loads(lock.decode())['package'] if item['name'] == 'ktav']
    if len(cores) != 1 or cores[0]['version'] != '0.8.1' or cores[0].get('checksum') != CORE:
        raise ValueError('native resource registry core differs')
    selected = list(COMMON)
    trees = []
    if windows_napi:
        producer = check_manifest(evidence, 'native-payload-manifest.json')
        if producer['target'] != target or producer['source_ref'] != SOURCE or producer['binary_sha256'] != sha(raw) or producer['notice_sha256'] != sha(notice):
            raise ValueError('GNU NAPI producer manifest identity differs')
        selected = [item['path'] for item in producer['files'] if item['path'] != 'ktav_napi.node'] + ['native-payload-manifest.json']
        provenance = json.loads(read(evidence / 'source-variant.json'))
        proof = json.loads(read(evidence / 'native-runtime-verification.json'))
        if sha(read(evidence / 'Cargo.original.lock', 4 * 1024 * 1024)) != LOCK or bundle['source_variant'] != provenance or sha(lock) != provenance['variant_lock_sha256']:
            raise ValueError('explicit derivative source/lock differs')
    else:
        if sha(lock) != LOCK:
            raise ValueError('original reviewed lock differs')
        provenance = json.loads(read(evidence / 'source-provenance.json'))
        if target.endswith('-apple-darwin'):
            selected += [role + '-macos-verification.json', role + '-embedded-verification.json', role + '-native-link.map']
            proof = json.loads(read(evidence / (role + '-macos-verification.json')))
        elif target.endswith('-musl'):
            selected += MUSL
            trees = ['runtime-rust-originals']
            selected += [role + '/' + name for name in ['Cargo.lock', 'NOTICE.json', 'NOTICE.json.gz', 'NOTICE.cargo-std.json', 'NOTICE.musl-runtime.txt', 'musl-runtime-catalog.json', 'source-provenance.json', 'native-verification.json', 'retained-runtime-verification.json', 'embedded-verification.json', 'native-link-command.json', 'native-link.map']]
            proof = json.loads(read(evidence / role / 'retained-runtime-verification.json'))
            if read(evidence / role / 'NOTICE.json') != notice:
                raise ValueError('musl role notice differs from complete source collection')
        elif target.endswith('-gnullvm'):
            selected += WINDOWS_CABI
            trees = ['runtime-originals']
            proof = json.loads(read(evidence / 'native-runtime-verification.json'))
        elif role == 'napi':
            selected += GNU_NAPI
            proof = json.loads(read(evidence / 'gnu-runtime-verification.json'))
        else:
            selected += GNU_CABI
            proof = json.loads(read(evidence / 'native-gnu-verification.json'))
    if provenance['source_ref'] != SOURCE or proof['target'] != target or proof['binary_sha256'] != sha(raw) or proof.get('role', role) != role:
        raise ValueError('producer source/target/binary proof differs')
    if 'notice_sha256' in proof and proof['notice_sha256'] != sha(notice):
        raise ValueError('producer actual notice proof differs')
    for tree in trees:
        entries = files(evidence / tree)
        if not entries:
            raise ValueError('mandatory original source tree is empty')
        selected.extend(tree + '/' + item['path'] for item in entries)
    if len(selected) != len(set(selected)):
        raise ValueError('duplicate native source/legal role')
    output.mkdir()
    (output / 'legal').mkdir()
    shutil.copyfile(binary, output / 'binary')
    for name in selected:
        relative(name)
        original = evidence / name
        content = read(original, 128 * 1024 * 1024)
        destination = output / 'legal' / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
    for name, expected in LICENSES.items():
        content = read(Path(name), 64 * 1024)
        if sha(content) != expected:
            raise ValueError('source checkout first-party license differs')
        (output / name).write_bytes(content)
    document = {'schema_version': 1, 'rid': rid, 'role': role, 'actual_target': target, 'package_binary': filename, 'source_ref': SOURCE, 'tooling_ref': provenance['tooling_ref'], 'binary_sha256': sha(raw), 'notice_sha256': sha(notice), 'files': files(output), 'scope': 'Complete source-bound native role payload for npm assembly. Compatibility filenames do not identify the compiler target; historical package or native execution clearance is not implied.'}
    (output / 'native-role-manifest.json').write_text(json.dumps(document, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    contract(output, rid, role)
    print(json.dumps({'rid': rid, 'role': role, 'actual_target': target, 'binary_sha256': sha(raw), 'notice_sha256': sha(notice), 'files': len(document['files'])}))


if __name__ == '__main__':
    if len(sys.argv) != 5:
        raise SystemExit('usage: native_npm_payload.py EVIDENCE NEW_OUTPUT RID ROLE')
    stage(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4])
