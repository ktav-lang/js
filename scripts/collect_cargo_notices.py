"""Собрать лицензионные уведомления разрешённого Cargo-графа."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

NOTICE_NAME = re.compile(
    r"^(?:notice|notices|copyright|copying|patents|authors|credits|acknowledg(?:e)?ments|"
    r"third[-_ ]?party[-_ ]?(?:notices?|licen[cs]es?))"
    r"(?:[-_].+|\.(?:txt|md|rst|html|lesser))?$",
    re.IGNORECASE,
)
MAX_NOTICE_BYTES = 4 * 1024 * 1024
MAX_TOTAL_BYTES = 32 * 1024 * 1024


def _packages(metadata: dict, report: dict) -> list[dict]:
    packages = metadata.get("packages")
    crates = report.get("crates")
    licenses = report.get("licenses")
    if not isinstance(packages, list) or not packages:
        raise ValueError("Cargo metadata has no packages")
    if not isinstance(crates, list) or not isinstance(licenses, list) or not licenses:
        raise ValueError("license report is incomplete")
    package_ids = {p["id"] for p in packages}
    reported_ids = {c["package"]["id"] for c in crates}
    licensed_ids = {u["crate"]["id"] for lic in licenses for u in lic["used_by"]}
    if (
        len(package_ids) != len(packages)
        or package_ids != reported_ids
        or package_ids != licensed_ids
    ):
        raise ValueError("Cargo graph and license report coverage differ")
    if any(not lic.get("source_path") or not lic.get("text") for lic in licenses):
        raise ValueError("license report contains an unverified fallback")
    return sorted(packages, key=lambda p: p["id"])


def _notice_files(root: Path) -> list[Path]:
    if root.is_symlink() or not root.is_dir():
        raise ValueError(f"invalid package source directory: {root}")
    pending = [root]
    found = []
    while pending:
        directory = pending.pop()
        for path in sorted(directory.iterdir()):
            if path.name in {".git", "target"}:
                continue
            if path.is_symlink():
                if NOTICE_NAME.fullmatch(path.name) or path.is_dir():
                    raise ValueError(f"unverified symlink in package source: {path}")
                continue
            if path.is_dir():
                pending.append(path)
            elif path.is_file() and NOTICE_NAME.fullmatch(path.name):
                found.append(path)
    return sorted(found)


def _collect(metadata: dict, report: dict) -> dict:
    packages = _packages(metadata, report)
    notices = []
    total = 0
    for package in packages:
        root = Path(package["manifest_path"]).parent
        for path in _notice_files(root):
            size = path.stat().st_size
            if size > MAX_NOTICE_BYTES or total + size > MAX_TOTAL_BYTES:
                raise ValueError(f"notice size limit exceeded: {path}")
            data = path.read_bytes()
            if len(data) != size:
                raise ValueError(f"notice changed while reading: {path}")
            total += len(data)
            notices.append(
                {
                    "package": package["name"],
                    "version": package["version"],
                    "source": package.get("source"),
                    "path": path.relative_to(root).as_posix(),
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "text": data.decode("utf-8"),
                }
            )
    return {"schema_version": 1, "package_count": len(packages), "notices": notices}


def main() -> None:
    """Проверить покрытие, сохранить уведомления и хеши."""
    if len(sys.argv) != 4:
        raise SystemExit("usage: collect_cargo_notices.py METADATA LICENSES OUTPUT")
    try:
        metadata = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        report = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
        result = _collect(metadata, report)
        Path(sys.argv[3]).write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise SystemExit(str(exc)) from exc
    print(f"Collected {len(result['notices'])} notices from {result['package_count']} packages")


if __name__ == "__main__":
    main()
