"""Добавить только private retention к выбранному binding source."""

from pathlib import Path
import sys


IMPORT = 'use rustc_hash::FxBuildHasher;\n'
FUNCTION = "pub fn loads<'env>(env: &'env Env, s: String) -> Result<Unknown<'env>> {\n"
STATIC = '\nstatic KTAV_NOTICES: &[u8] =\n    include_bytes!(concat!(env!("OUT_DIR"), "/ktav-napi-notices.resource"));\n'
CALL = '    std::hint::black_box(KTAV_NOTICES);\n'


def patch_source(source):
    if 'KTAV_NOTICES' in source or source.count(IMPORT) != 1 or source.count(FUNCTION) != 1:
        raise ValueError('unreviewed or already patched NAPI source')
    return source.replace(IMPORT, IMPORT + STATIC).replace(FUNCTION, FUNCTION + CALL)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: patch_napi_notice_source.py NAPI_LIB_RS')
    path = Path(sys.argv[1])
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 1024 * 1024:
        raise SystemExit('expected bounded regular NAPI source file')
    original = path.read_bytes()
    patched = patch_source(original.decode('utf-8')).encode('utf-8')
    path.write_bytes(patched)
