"""Проверить actual npm tar members и полные native роли без выполнения payload."""

import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_native_npm import verify_platform


def unpack(archive_path, output):
    if archive_path.is_symlink() or not archive_path.is_file() or not 0 < archive_path.stat().st_size <= 128 * 1024 * 1024:
        raise ValueError('npm archive is missing or exceeds bound')
    output.mkdir()
    seen = set()
    total = 0
    with tarfile.open(archive_path, 'r:gz') as archive:
        for item in archive:
            path = PurePosixPath(item.name)
            if path.is_absolute() or '..' in path.parts or chr(92) in item.name or ':' in item.name or not path.parts or path.parts[0] != 'package' or path.as_posix().casefold() in seen:
                raise ValueError('unsafe or duplicate npm tar member')
            seen.add(path.as_posix().casefold())
            if len(seen) > 8192:
                raise ValueError('npm tar member count exceeds bound')
            if item.isdir():
                continue
            if not item.isfile() or item.size > 128 * 1024 * 1024 or len(path.parts) < 2:
                raise ValueError('npm tar member kind/size differs')
            total += item.size
            if total > 256 * 1024 * 1024:
                raise ValueError('npm tar decoded bytes exceed bound')
            destination = output.joinpath(*path.parts[1:])
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(item) as source, destination.open('xb') as target:
                remaining = item.size
                while remaining:
                    raw = source.read(min(remaining, 1024 * 1024))
                    if not raw:
                        raise ValueError('truncated npm tar member')
                    target.write(raw)
                    remaining -= len(raw)
    if not (output / 'package.json').is_file():
        raise ValueError('packed npm metadata missing')


def verify(archive_path, rid):
    with tempfile.TemporaryDirectory(prefix='ktav-packed-native-') as temporary:
        output = Path(temporary) / 'package'
        unpack(archive_path, output)
        document = verify_platform(output, rid)
    return {'package': document['package'], 'version': document['version'], 'rid': rid, 'source_ref': document['source_ref'], 'tooling_ref': document['tooling_ref'], 'package_sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(), 'files': len(document['files']), 'roles': document['roles'], 'scope': 'Actual packed native npm file/resource/legal/source contract; native execution is a separate consumer gate.'}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: check_native_npm.py TARBALL RID')
    print(json.dumps(verify(Path(sys.argv[1]), sys.argv[2]), ensure_ascii=False, sort_keys=True, indent=2))
