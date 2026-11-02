#!/usr/bin/env bash
set -euo pipefail

if [[ " $* " == *"--print-map"* ]]; then
  python3 -I -c 'import json, os, sys; f = open(os.environ["KTAV_LINK_COMMAND"], "x", encoding="utf-8"); json.dump(sys.argv[1:], f, indent=2); f.close()' "$@"
  "${KTAV_REAL_ZIG:?}" "$@" | tee -a "${KTAV_LINK_MAP:?}"
else
  exec "${KTAV_REAL_ZIG:?}" "$@"
fi
