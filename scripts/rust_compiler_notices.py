"""Сохранить полные compiler grants для exact Rust source revision."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath

PROFILE_SHA256 = "39cbf18420d5e0c0a35fb2d5e5fbed4db755488ea0ca11414944ead9fbabab92"
RUST_REVISION = "58cf8f9c35b355199727627d07ae34a4e2846d67"


def _read(path: Path, limit: int) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise ValueError("missing or symlinked compiler notice input")
    with path.open("rb") as source:
        raw = source.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("compiler notice input exceeds bound")
    return raw


def collect(root: Path, rustc: str) -> dict:
    """Сверить compiler identity и сохранить original legal/source bytes."""
    if (
        not rustc.startswith("rustc 1.99.1 ")
        or "\nrelease: 1.99.1\n" not in rustc
        or "\ncommit-hash: " + RUST_REVISION + "\n" not in rustc
    ):
        raise ValueError("unreviewed Rust compiler source identity")
    root = root.resolve()
    raw = _read(root / "ci/rust-compiler-notices.json", 1024 * 1024)
    if hashlib.sha256(raw).hexdigest() != PROFILE_SHA256:
        raise ValueError("compiler notice profile differs from review")
    profile = json.loads(raw)
    materials = []
    for item in profile["materials"]:
        relative = PurePosixPath(item["path"])
        path = root / item["path"]
        if (
            relative.is_absolute()
            or ".." in relative.parts
            or "\\" in item["path"]
            or not path.resolve().is_relative_to(root)
        ):
            raise ValueError("unsafe compiler notice source path")
        original = _read(path, 4 * 1024 * 1024)
        blob = hashlib.sha1(b"blob " + str(len(original)).encode() + b"\0" + original).hexdigest()
        if (
            len(original) != item["bytes"]
            or hashlib.sha256(original).hexdigest() != item["sha256"]
            or blob != item["git_blob"]
        ):
            raise ValueError("compiler notice original identity differs")
        materials.append({**item, "text": original.decode("utf-8")})
    return {
        "schema_version": 1,
        "profile_sha256": PROFILE_SHA256,
        "rust_revision": profile["rust_revision"],
        "llvm_revision": profile["llvm_revision"],
        "compiler_builtins_license": "MIT AND Apache-2.0 WITH LLVM-exception",
        "libm_license": "MIT",
        "coverage": profile["coverage"],
        "materials": materials,
    }
