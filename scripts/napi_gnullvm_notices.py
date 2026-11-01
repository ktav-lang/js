"""Подготовить и проверить GNU NAPI-specific GNU/LLVM runtime notices."""

import gzip
import hashlib
import importlib.util
import json
from pathlib import Path, PurePosixPath
import re
import sys
import urllib.error
import urllib.request

CATALOG = 'ci/licenses/napi-gnullvm-runtime.json'
CATALOG_SHA = 'f1642eb589e5481d017f5d05178e593249efd94e9eb8de8b85f203adc057a85d'
SDK_SHA = 'fd5462b7f5d93b2ff981fcd3f9c7e427e47f3203c64ea91c27bcc444eebd74cd'
REVISIONS = {'mingw-w64/mingw-w64': '0d6dfbc348dfad714761c0a7151615767f96bcb5', 'llvm/llvm-project': '7a941dfb2877a0b8cf30323fefa85ad019e0b0f5', 'napi-rs/napi-rs': 'd9cb526c15e63ba30e06b4d169068c9854180595'}
DATA_ONLY = {'mingw-w64-crt/crt/cinitexe.c', 'mingw-w64-crt/misc/mingw_matherr.c', 'mingw-w64-crt/misc/dllmain.c'}
MAX_FILE = 4 * 1024 * 1024
MAX_TOTAL = 64 * 1024 * 1024


def read(path, limit):
    if path.is_symlink() or not path.is_file():
        raise ValueError('missing or symlinked GNU NAPI runtime input')
    with path.open('rb') as source:
        raw = source.read(limit + 1)
    if len(raw) > limit:
        raise ValueError('GNU NAPI runtime input exceeds bound')
    return raw


def catalogue(root):
    raw = read(root / CATALOG, MAX_FILE)
    if hashlib.sha256(raw).hexdigest() != CATALOG_SHA:
        raise ValueError('unreviewed GNU NAPI runtime catalogue')
    document = json.loads(raw)
    if document['sdk_archive_sha256'] != SDK_SHA or len(document['source_files']) != 61 or len(document['original_documents']) != 7:
        raise ValueError('GNU NAPI runtime catalogue roles differ')
    return document


def source_file_path(evidence, item):
    relative = PurePosixPath(item['path'])
    if relative.is_absolute() or '..' in relative.parts or '\\' in item['path']:
        raise ValueError('unsafe original source path')
    matches = [repo.split('/')[-1] for repo, revision in REVISIONS.items() if item['source'].startswith('https://raw.githubusercontent.com/' + repo + '/' + revision + '/')]
    if len(matches) != 1:
        raise ValueError('unreviewed GNU NAPI source repository')
    return evidence / 'runtime-originals' / matches[0] / item['path']


def original(url):
    if not any(url.startswith('https://raw.githubusercontent.com/' + repo + '/' + revision + '/') for repo, revision in REVISIONS.items()):
        raise ValueError('unreviewed GNU NAPI runtime source URL')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                raw = response.read(MAX_FILE + 1)
            break
        except urllib.error.HTTPError as error:
            if error.code not in {500, 502, 503, 504} or attempt == 2:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2:
                raise
    if len(raw) > MAX_FILE:
        raise ValueError('GNU NAPI original source exceeds bound')
    return raw


def verify_sources(document, fetch=original, evidence=None):
    seen = set()
    total = 0
    for item in [*document['source_files'], *document['original_documents']]:
        if item['source'] in seen:
            raise ValueError('duplicate GNU NAPI original source')
        seen.add(item['source'])
        raw = fetch(item['source'])
        total += len(raw)
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if len(raw) > MAX_FILE or total > MAX_TOTAL or hashlib.sha256(raw).hexdigest() != item['sha256'] or item.get('git_blob', blob) != blob:
            raise ValueError('GNU NAPI source/grant bytes differ')
        if 'text' in item:
            if item['text'].encode('utf-8') != raw:
                raise ValueError('GNU NAPI legal document differs')
        else:
            comments = re.findall(r'/\*.*?\*/|(?:^[ \t]*//[^\n]*(?:\n|$))+', raw.decode('utf-8'), re.M | re.S)
            notices = [value for value in comments if re.search(r'copyright|licens|public domain|permission|redistribution', value, re.I)]
            if item['source_notices'] != notices or not notices and item['path'] not in DATA_ONLY:
                raise ValueError('GNU NAPI file-level original notice differs')
        if evidence is not None:
            path = source_file_path(evidence, item)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)


def augment(bundle, document, target):
    if target not in document['targets'] or bundle.get('schema_version') != 1 or 'non_cargo_runtimes' in bundle:
        raise ValueError('unexpected GNU NAPI runtime preparation state')
    runtime = {'name': 'LLVM-MinGW DLL startup, MinGW runtime and LLVM libunwind', 'target': target, 'catalog_sha256': CATALOG_SHA, 'sdk_archive_sha256': SDK_SHA, 'sdk_recipe_revision': document['sdk_recipe_revision'], 'mingw_revision': document['mingw_revision'], 'llvm_revision': document['llvm_revision'], 'selected_inputs': document['targets'][target], 'source_files': document['source_files'], 'original_documents': document['original_documents'], 'coverage': document['coverage']}
    return {**bundle, 'non_cargo_runtimes': [runtime], 'coverage': bundle['coverage'] + ' Includes source-reviewed GNU NAPI GNU/LLVM runtime grants; final retained-input gate is required.'}


def plain_notice(document):
    sections = ['Ktav GNU NAPI Windows GNU/LLVM runtime notices.\nOriginal terms follow unchanged; the source/header notice set is conservative.\n']
    for item in document['original_documents']:
        sections.extend(['\n===== ' + item['source'] + ' =====\n', item['text']])
    for item in document['source_files']:
        sections.extend(['\n===== ' + item['source'] + ' =====\n', '\n'.join(item['source_notices'])])
    return '\n'.join(sections).encode('utf-8')


def prepare(evidence, target):
    root = Path(__file__).resolve().parents[1]
    document = catalogue(root)
    if target not in document['targets'] or (evidence / 'NOTICE.cargo-std.json').exists():
        raise ValueError('unreviewed target or runtime already prepared')
    verify_sources(document, evidence=evidence)
    before = read(evidence / 'NOTICE.json', MAX_TOTAL)
    combined = (json.dumps(augment(json.loads(before), document, target), ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')
    payload = gzip.compress(combined, mtime=0)
    if len(combined) > MAX_TOTAL or len(payload) > MAX_FILE:
        raise ValueError('GNU NAPI combined runtime notice exceeds bound')
    (evidence / 'NOTICE.cargo-std.json').write_bytes(before)
    (evidence / 'NOTICE.json').write_bytes(combined)
    (evidence / 'NOTICE.json.gz').write_bytes(payload)
    (evidence / 'NOTICE.windows-runtime.txt').write_bytes(plain_notice(document))
    (evidence / 'napi-gnullvm-runtime.json').write_bytes(read(root / CATALOG, MAX_FILE))


def retained_objects(raw):
    objects = set()
    for line in raw.splitlines():
        match = re.match(rb'^[0-9a-fA-F]+\s+[0-9a-fA-F]+\s+\d+\s{2,}(.+):\([^\r\n]*\)\s*$', line)
        if match and b'.rcgu.o' not in match[1]:
            objects.add(match[1].decode('utf-8').replace('\\', '/').rsplit('/', 1)[-1])
    return objects


def sdk_inputs(items, target):
    selected = []
    marker = 'llvm-mingw-20261020-ucrt-x86_64/'
    seen = set()
    for item in items:
        name = item['path'].replace('\\', '/')
        if not name.endswith(('.a', '.o', '.obj', '.rlib', '.lib')):
            continue
        if marker not in name:
            cargo = r'/target/' + re.escape(target) + r'/release/deps/'
            rust = r'/[.]rustup/toolchains/1[.]99[.]1-x86_64-pc-windows-msvc/lib/rustlib/' + re.escape(target) + r'/lib/'
            accepted = re.search(cargo + r'ktav_napi[.][^/]+[.]rcgu[.]o$', name) or re.search(cargo + r'rustc[^/]+/libstd-[0-9a-f]+[.]rlib$', name) or re.search(rust + r'libcompiler_builtins-[0-9a-f]+[.]rlib$', name)
            if not accepted:
                raise ValueError('native linker input outside reviewed SDK/Rust boundary')
            continue
        if name.count(marker) != 1:
            raise ValueError('unreviewed SDK linker input path')
        relative = name.split(marker, 1)[1]
        if relative in seen or '..' in PurePosixPath(relative).parts:
            raise ValueError('duplicate or unsafe SDK linker input')
        seen.add(relative)
        selected.append({'path': relative, 'size': item['bytes'], 'sha256': item['sha256']})
    return sorted(selected, key=lambda item: item['path'])


def verify_inputs(items, mapping, document, target):
    if target not in document['targets']:
        raise ValueError('unreviewed GNU NAPI target')
    expected = document['targets'][target]
    if sdk_inputs(items, target) != expected['sdk_inputs'] or retained_objects(mapping) != set(expected['retained_objects']):
        raise ValueError('GNU NAPI SDK bytes or retained objects differ from reviewed profile')


def verify(evidence, binary, target):
    spec = importlib.util.spec_from_file_location('napi_notice_scanner', Path(__file__).with_name('check_embedded_notices.py'))
    scanner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(scanner)

    document = catalogue(Path(__file__).resolve().parents[1])
    if target not in document['targets']:
        raise ValueError('unreviewed GNU NAPI target')
    records = {item['source']: item for item in [*document['source_files'], *document['original_documents']]}
    verify_sources(document, fetch=lambda url: read(source_file_path(evidence, records[url]), MAX_FILE))
    raw = read(binary, 128 * 1024 * 1024)
    notice = read(evidence / 'NOTICE.json', MAX_TOTAL)
    before = json.loads(read(evidence / 'NOTICE.cargo-std.json', MAX_TOTAL))
    if json.loads(notice) != augment(before, document, target) or scanner._extract(raw)[0] != notice:
        raise ValueError('actual GNU NAPI runtime resource differs')
    if read(evidence / 'NOTICE.windows-runtime.txt', MAX_TOTAL) != plain_notice(document):
        raise ValueError('plain GNU NAPI original notices differ')
    if read(evidence / 'napi-gnullvm-runtime.json', MAX_FILE) != read(Path(__file__).resolve().parents[1] / CATALOG, MAX_FILE):
        raise ValueError('staged GNU NAPI catalogue differs')
    identity = json.loads(read(evidence / 'binary-verification.json', MAX_FILE))
    mapping = read(evidence / 'native-link.map', 32 * 1024 * 1024)
    if identity['target'] != target or identity['binary_sha256'] != hashlib.sha256(raw).hexdigest() or identity['map_sha256'] != hashlib.sha256(mapping).hexdigest():
        raise ValueError('actual GNU NAPI release/map identity differs')
    expected = document['targets'][target]
    inputs = json.loads(read(evidence / 'link-input-fingerprints.json', MAX_FILE))
    verify_inputs(inputs, mapping, document, target)
    provenance = json.loads(read(evidence / 'source-variant.json', MAX_FILE))
    if provenance['sdk_archive_sha256'] != SDK_SHA or provenance['source_ref'] != '562deb3fde092d63a78f359be095e5079929d0d1':
        raise ValueError('GNU NAPI source/SDK identity differs')
    report = {'target': target, 'binary_sha256': identity['binary_sha256'], 'notice_sha256': hashlib.sha256(notice).hexdigest(), 'catalog_sha256': CATALOG_SHA, 'sdk_inputs': len(expected['sdk_inputs']), 'retained_runtime_objects': len(expected['retained_objects']), 'source_records': len(document['source_files']), 'scope': 'Actual GNU NAPI DLL resource and target-specific SDK input/source-grant binding; not npm delivery, ARM execution, other targets or historical published artifact clearance.'}
    (evidence / 'native-runtime-verification.json').write_text(json.dumps(report, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, sort_keys=True))


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == 'prepare':
        prepare(Path(sys.argv[2]), sys.argv[3])
    elif len(sys.argv) == 5 and sys.argv[1] == 'verify':
        verify(Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4])
    else:
        raise SystemExit('usage: napi_gnullvm_notices.py prepare EVIDENCE TARGET | verify EVIDENCE BINARY TARGET')
