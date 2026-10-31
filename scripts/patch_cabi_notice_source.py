"""Наложить одну metadata-вставку, не перенося APIs другой версии core."""

from pathlib import Path
import sys

ANCHOR = 'ktav::declare_cabi!();'
INSERTION = '\n\ninclude!(concat!(env!("OUT_DIR"), "/native_notices.rs"));'


def patch_source(source):
    if 'native_notices.rs' in source or source.count(ANCHOR) != 1:
        raise ValueError('unreviewed or already patched C ABI source')
    return source.replace(ANCHOR, ANCHOR + INSERTION)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: patch_cabi_notice_source.py SOURCE')
    path = Path(sys.argv[1])
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 1024 * 1024:
        raise SystemExit('missing, symlinked or oversized C ABI source')
    path.write_bytes(patch_source(path.read_bytes().decode('utf-8')).encode('utf-8'))
