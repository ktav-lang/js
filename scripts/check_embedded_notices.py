"""Проверить license resource без исполнения native binary."""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import sys
from pathlib import Path

MARKER = b"KTAV-NOTICES-GZIP-v1\0"
MAX_GZIP = 4 * 1024 * 1024
MAX_JSON = 64 * 1024 * 1024
MAX_BINARY = 128 * 1024 * 1024


def _read(path: Path, limit: int) -> bytes:
    with path.open("rb") as source:
        data = source.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f"file exceeds notice verification limit: {path.name}")
    return data


def _extract(binary: bytes) -> tuple[bytes, int]:
    offset = binary.find(MARKER)
    if offset < 0 or binary.find(MARKER, offset + 1) >= 0:
        raise ValueError("missing or duplicate embedded notice resource")
    start = offset + len(MARKER)
    if start + 8 > len(binary):
        raise ValueError("truncated embedded notice length")
    size = int.from_bytes(binary[start : start + 8], "little")
    start += 8
    if not 0 < size <= MAX_GZIP or start + size > len(binary):
        raise ValueError("invalid embedded notice size")
    with gzip.GzipFile(fileobj=io.BytesIO(binary[start : start + size])) as source:
        data = source.read(MAX_JSON + 1)
    if len(data) > MAX_JSON:
        raise ValueError("embedded notice JSON exceeds size limit")
    return data, size


def main() -> None:
    """Сверить embedded resource с ожидаемым source-backed bundle."""
    if len(sys.argv) != 3:
        raise SystemExit("usage: check_embedded_notices.py BINARY EXPECTED_NOTICE_JSON")
    try:
        binary = _read(Path(sys.argv[1]), MAX_BINARY)
        expected = _read(Path(sys.argv[2]), MAX_JSON)
        actual, compressed_size = _extract(binary)
        if actual != expected:
            raise ValueError("embedded notices differ from the locked build evidence")
        bundle = json.loads(actual)
        if bundle.get("schema_version") != 1:
            raise ValueError("unexpected embedded notice schema")
        report = {
            "schema_version": 1,
            "binary": Path(sys.argv[1]).name,
            "binary_sha256": hashlib.sha256(binary).hexdigest(),
            "notice_sha256": hashlib.sha256(actual).hexdigest(),
            "cargo_lock_sha256": bundle["cargo_lock_sha256"],
            "notice_bytes": len(actual),
            "compressed_bytes": compressed_size,
        }
    except (OSError, EOFError, ValueError, KeyError, TypeError) as exc:
        raise SystemExit(str(exc)) from exc
    print(json.dumps(report, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
