#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  x86_64-unknown-linux-musl) addon=ktav.linux-x64-musl.node; machine='Advanced Micro Devices X86-64' ;;
  aarch64-unknown-linux-musl) addon=ktav.linux-arm64-musl.node; machine='AArch64' ;;
  *) printf 'Unsupported musl target: %s\n' "${1:-}" >&2; exit 1 ;;
esac

npx --no-install napi build --release -p ktav-napi --target "$1" --platform --js false --output-dir . --cross-compile
test -s "$addon"
python3 - "$addon" "$machine" <<'PY'
import re
import subprocess
import sys

path, expected_machine = sys.argv[1:]
header = subprocess.check_output(['readelf', '-h', path], text=True)
machine = re.search(r'^\s*Machine:\s*(.+)$', header, re.MULTILINE)
if not machine or machine.group(1).strip() != expected_machine:
    raise SystemExit(f'{path}: unexpected ELF machine')
dynamic = subprocess.check_output(['readelf', '-d', path], text=True)
needed = re.findall(r'Shared library: \[([^]]+)\]', dynamic)
if any(name != 'libc.so' for name in needed):
    raise SystemExit(f'{path}: unexpected shared libraries: {needed!r}')
versions = subprocess.check_output(['readelf', '--version-info', path], text=True)
if re.search(r'\bGLIBC_[0-9]', versions):
    raise SystemExit(f'{path}: glibc symbol version in musl addon')
print(f'{path}: ELF machine and musl dynamic dependencies verified: {needed!r}')
PY
