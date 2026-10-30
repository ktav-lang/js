#!/usr/bin/env python3
"""Прозрачно захватить GNU linker map выбранного NAPI cross toolchain."""

import json
import os
from pathlib import Path
import sys
import uuid

TARGETS = {'x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu'}


def command(arguments, environment, home):
    target = environment['KTAV_NAPI_TARGET']
    if target not in TARGETS:
        raise ValueError('unreviewed NAPI cross target')
    toolchain = home / '.napi-rs/cross-toolchain/1.0.3' / target
    compiler = toolchain / 'bin' / (target + '-gcc')
    args = list(arguments)
    record = None
    if '-shared' in args and '-o' in args:
        position = args.index('-o')
        if position + 1 >= len(args):
            raise ValueError('missing NAPI linker output')
        output = Path(args[position + 1]).resolve()
        workspace = Path(environment['GITHUB_WORKSPACE']).resolve()
        if not output.is_relative_to(workspace) or output.suffix != '.so':
            raise ValueError('NAPI shared output must belong to this build')
        evidence = Path(environment['KTAV_NAPI_LINK_EVIDENCE'])
        if not evidence.is_dir() or evidence.is_symlink():
            raise ValueError('NAPI linker evidence must already exist')
        name = uuid.uuid4().hex
        link_map = evidence / (name + '.map')
        record = {'target': target, 'compiler': str(compiler), 'output': str(output), 'map': link_map.name, 'arguments': args}
        with (evidence / (name + '.json')).open('x', encoding='utf-8') as destination:
            json.dump(record, destination, sort_keys=True, indent=2)
        args.append('-Wl,-Map=' + str(link_map))
    return compiler, [str(compiler), *args], record


if __name__ == '__main__':
    compiler, arguments, _ = command(sys.argv[1:], os.environ, Path.home())
    if not compiler.is_file():
        raise SystemExit('exact NAPI cross compiler was not installed; fallback forbidden')
    os.execv(str(compiler), arguments)
