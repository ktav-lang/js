"""Связать полный GNU notice с reviewed target и actual link evidence."""

import base64
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys

PROFILE_SHA256 = '6aac74157ae3d421c2238e73f4a7d47fca62452f8685a51f158cdc83ac18f07e'
CATALOG_SHA256 = '81946a881bab335453f935cd935c3255ce3eb623f636a26089f61099b94610db'
TARGETS = {'x86_64-unknown-linux-gnu': 'sysdeps/x86_64', 'aarch64-unknown-linux-gnu': 'ports/sysdeps/aarch64'}
DOCUMENTS = ['share/licenses/gcc/COPYING3', 'share/licenses/gcc/COPYING.RUNTIME', 'share/licenses/glibc/COPYING.LIB']
CRT = {'crti.o', 'crtn.o', 'crtbeginS.o', 'crtendS.o'}
MEMBERS = [['libc_nonshared.a', 'fstat64.oS'], ['libc_nonshared.a', 'stat64.oS']]
FLAGS = {'-m64', '-Wl,--no-undefined-version', '-Wl,--as-needed', '-Wl,-Bstatic', '-Wl,-Bdynamic', '-Wl,--eh-frame-hdr', '-Wl,-z,noexecstack', '-Wl,--gc-sections', '-shared', '-Wl,-z,relro,-z,now', '-Wl,-O1', '-Wl,--strip-debug', '-nodefaultlibs', '-Wl,-z,nodelete', '-ldl', '-lgcc_s', '-lutil', '-lrt', '-lpthread', '-lm', '-lc'}


def read(path, limit):
    if path.is_symlink() or not path.is_file():
        raise ValueError('missing or symlinked GNU notice input')
    with path.open('rb') as source:
        data = source.read(limit + 1)
    if len(data) > limit:
        raise ValueError('GNU notice input exceeds bound')
    return data


def reviewed(root):
    profile = read(root / 'ci/licenses/napi-gnu-runtime.json', 1024 * 1024)
    catalog = read(root / 'ci/napi-gnu-sdk-inputs.json', 1024 * 1024)
    if hashlib.sha256(profile).hexdigest() != PROFILE_SHA256 or hashlib.sha256(catalog).hexdigest() != CATALOG_SHA256:
        raise ValueError('GNU runtime profile or SDK catalogue differs from review')
    return json.loads(profile), json.loads(catalog)


def runtime_notice(root, target):
    if target not in TARGETS:
        raise ValueError('unreviewed GNU runtime target')
    profile, catalog = reviewed(root)
    selected = ['glibc/io/fstat64.c', 'glibc/io/stat64.c', 'glibc/' + TARGETS[target] + '/crti.S', 'glibc/' + TARGETS[target] + '/crtn.S', 'gcc/libgcc/crtstuff.c', *DOCUMENTS]
    indexed = {item['id']: item for item in profile['materials']}
    materials = [indexed[name] for name in selected]
    for item in materials:
        data = item['text'].encode('utf-8')
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256'] or blob != item['git_blob']:
            raise ValueError('GNU source or license material identity mismatch')
    return {'schema_version': 1, 'target': target, 'profile_sha256': PROFILE_SHA256, 'sdk_catalog_sha256': CATALOG_SHA256, 'sdk_revision': profile['sdk_revision'], 'sdk_inputs': catalog['targets'][target], 'archive_members': MEMBERS, 'loaded_crt_objects': sorted(CRT), 'materials': materials, 'glibc_terms': profile['glibc_terms'], 'gcc_terms': profile['gcc_terms'], 'compilation_process': profile['compilation_process'], 'scope': profile['scope'], 'unused_archive': 'libpthread_nonshared.a is loaded, but no members are retained by this reviewed link profile.', 'host_libraries': 'System shared libraries including glibc and libgcc_s are host-provided, not redistributed in this addon payload; their dynamic use is distinct from the selected compiled-in CRT members.'}


def notice_bytes(notice):
    data = (json.dumps(notice, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')
    sections = ['GNU NAPI runtime notices — ' + notice['target'], notice['scope'], notice['glibc_terms'], notice['gcc_terms'], notice['compilation_process'], notice['unused_archive'], notice['host_libraries']]
    for item in notice['materials']:
        sections.extend(['=' * 72, item['id'], item['repository'] + ' @ ' + item['revision'], 'Git blob: ' + item['git_blob'] + '; SHA256: ' + item['sha256'], item['text']])
    plain = ('\n\n'.join(sections) + '\n').encode('utf-8')
    return data, plain


def prepare(root, evidence, target):
    notice = runtime_notice(root, target)
    data, plain = notice_bytes(notice)
    paths = [evidence / 'GNU-RUNTIME-NOTICE.json', evidence / 'GNU-RUNTIME-NOTICE.txt']
    if any(path.exists() or path.is_symlink() for path in paths):
        raise ValueError('GNU runtime notice output already exists')
    bundle = json.loads(read(evidence / 'NOTICE.json', 64 * 1024 * 1024))
    if 'napi_gnu_runtime' in bundle:
        raise ValueError('GNU runtime bundle already augmented')
    bundle['napi_gnu_runtime'] = notice
    augmented = (json.dumps(bundle, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')
    compressed = gzip.compress(augmented, mtime=0)
    if len(augmented) > 64 * 1024 * 1024 or len(compressed) > 4 * 1024 * 1024:
        raise ValueError('augmented GNU notice exceeds resource bounds')
    paths[0].write_bytes(data)
    paths[1].write_bytes(plain)
    (evidence / 'NOTICE.json').write_bytes(augmented)
    (evidence / 'NOTICE.json.gz').write_bytes(compressed)


def verify_link(notice, report, notices, command, rustc, compiler):
    target = notice['target']
    if report.get('target') != target or command.get('target') != target:
        raise ValueError('GNU runtime target differs from actual link')
    selected = notice['sdk_inputs']
    expected = []
    for role, entries in [('compiler', [selected['compiler']]), ('configuration', [selected['configuration']]), ('runtime', selected['runtime_inputs'])]:
        expected.extend({'role': role, 'path': item['path'], 'bytes': item['bytes'], 'sha256': item['sha256']} for item in entries)
    actual = report.get('sdk_input_profile', {})
    if actual.get('repository_revision') != notice['sdk_revision'] or actual.get('inputs') != expected or report.get('sdk_input_catalog_sha256') != CATALOG_SHA256:
        raise ValueError('GNU actual SDK inputs differ from reviewed runtime')
    if report.get('compiler_sha256') != selected['compiler']['sha256'] or report.get('cross_toolchain_version') != '1.0.3':
        raise ValueError('GNU actual compiler differs from reviewed runtime')
    if sorted(report.get('archive_members', [])) != MEMBERS:
        raise ValueError('GNU retained archive members differ from reviewed runtime')
    objects = report.get('loaded_objects', [])
    own = [name for name in objects if re.fullmatch(r'ktav_napi\..+\.rcgu\.o', name)]
    if len(own) != 1 or len(objects) != 5 or set(objects) != CRT | set(own):
        raise ValueError('GNU loaded objects differ from reviewed runtime')
    indexed = {}
    for item in notices:
        if item['path'] in indexed:
            raise ValueError('duplicate SDK notice path')
        indexed[item['path']] = item
    for item in notice['materials']:
        if item['id'] not in DOCUMENTS:
            continue
        actual_document = indexed.get(item['id'])
        if actual_document is None or base64.b64decode(actual_document['raw_bytes_base64'], validate=True) != item['text'].encode('utf-8') or actual_document['sha256'] != item['sha256']:
            raise ValueError('actual SDK legal document differs from reviewed notice')
    if not rustc.startswith('rustc 1.99.1 ') or '\nrelease: 1.99.1\n' not in rustc or '\nLLVM version: ' not in rustc:
        raise ValueError('unreviewed Rust compilation process')
    if not compiler.splitlines() or not compiler.splitlines()[0].startswith(target + '-gcc ') or not compiler.splitlines()[0].endswith(' 4.8.5'):
        raise ValueError('unreviewed GCC compilation process')
    if not command.get('compiler', '').endswith('/' + target + '/bin/' + target + '-gcc') or PurePosixPath(command.get('output', '')).name != 'libktav_napi.so':
        raise ValueError('unreviewed final NAPI link command')
    arguments = command.get('arguments', [])
    skip_path = False
    native_inputs = []
    for argument in arguments:
        if skip_path:
            if not PurePosixPath(argument).is_absolute():
                raise ValueError('unreviewed final NAPI link path')
            skip_path = False
        elif argument in {'-L', '-o'}:
            skip_path = True
        elif argument in FLAGS or (target == 'aarch64-unknown-linux-gnu' and argument == '-Wl,--fix-cortex-a53-843419') or argument.startswith('-Wl,--version-script=/'):
            continue
        elif PurePosixPath(argument).is_absolute() and (PurePosixPath(argument).name in own or re.fullmatch(r'libcompiler_builtins-[0-9a-f]+\.rlib', PurePosixPath(argument).name)):
            native_inputs.append(PurePosixPath(argument).name)
        else:
            raise ValueError('unreviewed final NAPI link argument')
    if skip_path or len(native_inputs) != 2 or not all(name in native_inputs for name in own) or arguments.count('-shared') != 1 or arguments.count('-o') != 1:
        raise ValueError('incomplete reviewed final NAPI compilation process')


def verify(root, evidence, target):
    notice = runtime_notice(root, target)
    data, plain = notice_bytes(notice)
    if read(evidence / 'GNU-RUNTIME-NOTICE.json', 1024 * 1024) != data or read(evidence / 'GNU-RUNTIME-NOTICE.txt', 1024 * 1024) != plain:
        raise ValueError('GNU runtime notice output differs from reviewed material')
    bundle_bytes = read(evidence / 'NOTICE.json', 64 * 1024 * 1024)
    bundle = json.loads(bundle_bytes)
    if read(evidence / 'NOTICE.json.gz', 4 * 1024 * 1024) != gzip.compress(bundle_bytes, mtime=0):
        raise ValueError('GNU compressed bundle differs from readable notice')
    if bundle.get('napi_gnu_runtime') != notice:
        raise ValueError('GNU runtime notice absent from augmented bundle')
    report = json.loads(read(evidence / 'native-link-inputs.json', 1024 * 1024))
    verify_link(notice, report, json.loads(read(evidence / 'sdk-notice-files.json', 48 * 1024 * 1024)), json.loads(read(evidence / 'native-link-command.json', 1024 * 1024)), read(evidence / 'rustc.txt', 64 * 1024).decode('utf-8'), read(evidence / 'compiler-version.txt', 64 * 1024).decode('utf-8'))
    result = {'target': target, 'binary_sha256': report['binary_sha256'], 'runtime_notice_sha256': hashlib.sha256(data).hexdigest(), 'plain_notice_sha256': hashlib.sha256(plain).hexdigest(), 'profile_sha256': PROFILE_SHA256, 'scope': 'Actual GNU SDK inputs, selected source/license notices and final link process verified; embedding and npm delivery are separate gates, not established by this report.'}
    (evidence / 'gnu-runtime-verification.json').write_text(json.dumps(result, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    if len(sys.argv) != 4 or sys.argv[1] not in {'prepare', 'verify'}:
        raise SystemExit('usage: napi_gnu_runtime_notices.py prepare|verify EVIDENCE TARGET')
    root = Path(__file__).resolve().parents[1]
    action = prepare if sys.argv[1] == 'prepare' else verify
    action(root, Path(sys.argv[2]), sys.argv[3])
