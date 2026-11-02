"""Собрать notices без локальных путей и проверить их в wheel."""

from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import sys
import zipfile
from pathlib import Path, PurePosixPath

from collect_cargo_notices import _collect, _packages

MEMBER = "ktav/_third_party/NOTICE.json"
MAX_BUNDLE_BYTES = 64 * 1024 * 1024


def _text(data: bytes) -> dict:
    return {"sha256": hashlib.sha256(data).hexdigest(), "text": data.decode("utf-8")}


def _package(package: dict) -> dict:
    return {key: package.get(key) for key in ("name", "version", "source")}


def _build(evidence: Path) -> bytes:
    metadata = json.loads((evidence / "metadata.json").read_text(encoding="utf-8"))
    report = json.loads((evidence / "licenses.json").read_text(encoding="utf-8"))
    packages = _packages(metadata, report)
    identities = {package["id"]: _package(package) for package in packages}
    licenses = []
    for entry in report["licenses"]:
        used_by = [identities[item["crate"]["id"]] for item in entry["used_by"]]
        licenses.append(
            {
                **_text(entry["text"].encode("utf-8")),
                "used_by": sorted(used_by, key=lambda item: json.dumps(item, sort_keys=True)),
            }
        )
    notices = _collect(metadata, report)
    for entry in notices["notices"]:
        path = PurePosixPath(entry["path"])
        if path.is_absolute() or ".." in path.parts or "\\" in entry["path"]:
            raise ValueError("unsafe notice path")
    rustc = (evidence / "rustc.txt").read_bytes()
    if not rustc.startswith(b"rustc ") or b"\ncommit-hash: " not in rustc:
        raise ValueError("missing verbose rustc provenance")
    stdlib = (evidence / "COPYRIGHT-library.html").read_bytes()
    if not stdlib.strip():
        raise ValueError("empty Rust standard library report")
    lock = (evidence / "Cargo.lock").read_bytes()
    if not lock.strip():
        raise ValueError("empty Cargo.lock")
    result = {
        "schema_version": 1,
        "coverage": "Resolved Cargo graph and Rust standard library; not a linked-code inventory. "
        "Non-Cargo runtimes require separate evidence.",
        "cargo_lock_sha256": hashlib.sha256(lock).hexdigest(),
        "packages": sorted(identities.values(), key=lambda item: json.dumps(item, sort_keys=True)),
        "licenses": sorted(licenses, key=lambda item: json.dumps(item, sort_keys=True)),
        "notices": notices["notices"],
        "rustc": rustc.decode("utf-8"),
        "rust_standard_library": _text(stdlib),
    }
    data = (json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()
    if len(data) > MAX_BUNDLE_BYTES:
        raise ValueError("notice bundle size limit exceeded")
    return data


def _verify(wheel_path: Path, expected: bytes) -> None:
    if not expected or len(expected) > MAX_BUNDLE_BYTES:
        raise ValueError("invalid expected bundle size")
    with zipfile.ZipFile(wheel_path) as wheel:
        members = [item for item in wheel.infolist() if item.filename == MEMBER]
        if len(members) != 1 or members[0].file_size != len(expected):
            raise ValueError("missing, duplicate or wrong-sized wheel notice bundle")
        if wheel.read(members[0]) != expected:
            raise ValueError("wheel notice bundle differs from build evidence")
        records = [item for item in wheel.infolist() if item.filename.endswith(".dist-info/RECORD")]
        if len(records) != 1 or records[0].filename.count("/") != 1:
            raise ValueError("unexpected wheel RECORD")
        rows = csv.reader(io.StringIO(wheel.read(records[0]).decode("utf-8")))
        matching = [row for row in rows if row and row[0] == MEMBER]
        digest = base64.urlsafe_b64encode(hashlib.sha256(expected).digest()).rstrip(b"=").decode()
        if matching != [[MEMBER, f"sha256={digest}", str(len(expected))]]:
            raise ValueError("notice bundle does not match wheel RECORD")


def main() -> None:
    """Собрать bundle или сверить точные байты упакованного файла."""
    if len(sys.argv) != 4 or sys.argv[1] not in {"build", "verify"}:
        raise SystemExit(
            "usage: cargo_notice_bundle.py build EVIDENCE OUTPUT | verify WHEEL BUNDLE"
        )
    try:
        if sys.argv[1] == "build":
            data = _build(Path(sys.argv[2]))
            output = Path(sys.argv[3])
            output.parent.mkdir(parents=True, exist_ok=True)
            with output.open("xb") as destination:
                destination.write(data)
        else:
            _verify(Path(sys.argv[2]), Path(sys.argv[3]).read_bytes())
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as exc:
        raise SystemExit(str(exc)) from exc
    print(f"notice bundle {sys.argv[1]} verified")


if __name__ == "__main__":
    main()
