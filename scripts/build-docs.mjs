#!/usr/bin/env node
// Rebuilds repository docs, examples/README*, and platform README* files
// from root-docs/ using @ktav-lang/polydoc. Run with --check for a
// CI-friendly, read-only verification instead of regenerating the files.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { configure, buildRootDocs } from '@ktav-lang/polydoc';

const LANGS = ['en', 'ru', 'zh'];
const PLATFORM_TARGETS = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64-gnu': 'aarch64-unknown-linux-gnu',
  'linux-arm64-musl': 'aarch64-unknown-linux-musl',
  'linux-x64-gnu': 'x86_64-unknown-linux-gnu',
  'linux-x64-musl': 'x86_64-unknown-linux-musl',
  'win32-arm64-msvc': 'aarch64-pc-windows-msvc',
  'win32-x64-msvc': 'x86_64-pc-windows-msvc',
};

// polydoc's writeRootDocs/checkRootDocs write and verify every root
// document at the repository root (<DOC>.md, <DOC>.<lang>.md). This
// repository's published layout is different, and package.json "files"
// plus existing cross-links depend on it: translations live under
// docs/ru/ and docs/zh/, and CONTRIBUTING/SECURITY live under docs/.
// Assembly and validation still come from polydoc (buildRootDocs);
// only the last-mile write/verify below maps document + language to
// this repository's own output paths.
const OUTPUT_PATHS = {
  README: {
    en: 'README.md',
    ru: 'docs/ru/README.ru.md',
    zh: 'docs/zh/README.zh.md',
  },
  CHANGELOG: {
    en: 'CHANGELOG.md',
    ru: 'docs/ru/CHANGELOG.ru.md',
    zh: 'docs/zh/CHANGELOG.zh.md',
  },
  CONTRIBUTING: {
    en: 'docs/CONTRIBUTING.md',
    ru: 'docs/ru/CONTRIBUTING.ru.md',
    zh: 'docs/zh/CONTRIBUTING.zh.md',
  },
  SECURITY: {
    en: 'docs/SECURITY.md',
    ru: 'docs/ru/SECURITY.ru.md',
    zh: 'docs/zh/SECURITY.zh.md',
  },
  'EXAMPLES-README': {
    en: 'examples/README.md',
    ru: 'examples/README.ru.md',
    zh: 'examples/README.zh.md',
  },
  'PLATFORM-README': Object.fromEntries(
    ['en', 'ru', 'zh'].map((lang) => [lang, Object.keys(PLATFORM_TARGETS)
      .map((rid) => `npm/${rid}/README${lang === 'en' ? '' : `.${lang}`}.md`)]),
  ),
};

configure({
  langs: LANGS,
  rootDocuments: [
    'README', 'CHANGELOG', 'CONTRIBUTING', 'SECURITY',
    'EXAMPLES-README', 'PLATFORM-README',
  ],
});

// Per-unit validation proves every meaning has every language. It does
// NOT prove the languages describe the same DOCUMENT: a heading demoted
// from ## to ### in one translation, or an extra heading in another,
// passes unit validation untouched. This check catches that class of
// drift.
function headingSkeleton(markdown) {
  const levels = [];
  let fenceChar = null;
  let fenceLen = 0;
  for (const line of markdown.split('\n')) {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (fence) {
      const char = fence[1][0];
      const len = fence[1].length;
      if (fenceChar === null) { fenceChar = char; fenceLen = len; }
      else if (char === fenceChar && len >= fenceLen) { fenceChar = null; }
      continue;
    }
    if (fenceChar !== null) continue;
    const heading = line.match(/^(#{1,6})\s+\S/u);
    if (heading) levels.push(heading[1].length);
  }
  return levels;
}

function structuralProblems(label, perLang) {
  const [reference, ...others] = LANGS;
  const base = headingSkeleton(perLang.get(reference).toString('utf8'));
  const problems = [];
  for (const lang of others) {
    const other = headingSkeleton(perLang.get(lang).toString('utf8'));
    if (other.length !== base.length) {
      problems.push(`${label}: ${lang} has ${other.length} heading(s) but ${reference} has ` +
        `${base.length} — the translations describe different documents`);
      continue;
    }
    const at = base.findIndex((level, i) => level !== other[i]);
    if (at !== -1) {
      problems.push(`${label}: heading #${at + 1} is level ${other[at]} in ${lang} but ` +
        `level ${base[at]} in ${reference}`);
    }
  }
  return problems;
}

function outputPaths(root, doc, lang) {
  const mapped = OUTPUT_PATHS[doc][lang];
  return (Array.isArray(mapped) ? mapped : [mapped]).map((rel) => ({
    rel,
    absolute: path.join(root, rel),
  }));
}

function outputBuffer(doc, rel, body) {
  if (doc !== 'PLATFORM-README') return body;
  const rid = rel.split('/')[1];
  const target = PLATFORM_TARGETS[rid];
  if (!target) throw new Error(`unknown platform README target: ${rel}`);
  const rendered = body.toString('utf8')
    .replaceAll('{{PACKAGE_NAME}}', `@ktav-lang/js-${rid}`)
    .replaceAll('{{TARGET_TRIPLE}}', target);
  if (/\{\{[A-Z_]+\}\}/u.test(rendered)) throw new Error(`unexpanded platform README token: ${rel}`);
  return Buffer.from(rendered, 'utf8');
}

function writeDocs(root, docs) {
  for (const [doc, perLang] of docs) {
    for (const lang of LANGS) {
      for (const { rel, absolute } of outputPaths(root, doc, lang)) {
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, outputBuffer(doc, rel, perLang.get(lang)));
      }
    }
  }
}

function checkDocs(root, docs) {
  const problems = [];
  for (const [doc, perLang] of docs) {
    for (const lang of LANGS) {
      for (const { rel, absolute } of outputPaths(root, doc, lang)) {
        const expected = outputBuffer(doc, rel, perLang.get(lang));
        let actual;
        try {
          actual = fs.readFileSync(absolute);
        } catch (e) {
          problems.push(`${rel} is missing or unreadable (${e.message}); it is generated from ` +
            `root-docs/${doc}/`);
          continue;
        }
        if (actual.equals(expected)) continue;
        let off = 0;
        const min = Math.min(actual.length, expected.length);
        while (off < min && actual[off] === expected[off]) off++;
        const line = expected.subarray(0, off).toString('utf8').split('\n').length;
        problems.push(
          `${rel} differs from what root-docs/${doc}/ generates, first at byte ${off} `+
          `(line ${line}); edit the unit source, never the generated file`);
      }
    }
  }
  return problems;
}

function usage() {
  process.stderr.write(
    'usage: node scripts/build-docs.mjs [--check]\n' +
    '  (no args)  regenerate root docs, examples/README*, and npm/*/README*\n' +
    '  --check    verify the generated files match root-docs/ without writing\n'
  );
}

// SECURITY.md's supported-version line uses @@MINOR_LINE@@ so it can
// never quietly fall behind package.json's actual version the way a
// hand-written "0.1.x" once did.
function readPkgVersion(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+/u.test(pkg.version)) {
    throw new Error('package.json: no valid version field found');
  }
  return pkg.version;
}

function cli() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, '..');

  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) { usage(); process.exit(0); }
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    usage();
    process.exit(1);
  }
  const checkMode = args[0] === '--check';

  let docs;
  try {
    const version = readPkgVersion(root);
    docs = buildRootDocs(root, { release: { version, released: '' } });
    for (const [name, perLang] of docs) {
      const problems = structuralProblems(name, perLang);
      if (problems.length > 0) {
        throw new Error(problems.join('\n'));
      }
    }
  } catch (e) {
    process.stderr.write(`build-docs: ${e.message}\n`);
    process.exit(1);
  }

  if (!checkMode) {
    writeDocs(root, docs);
    process.stdout.write(`build-docs: assembled ${docs.size} document(s) from root-docs/\n`);
    process.exit(0);
  }

  const problems = checkDocs(root, docs);
  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`build-docs --check: ${problem}\n`);
    }
    process.exit(1);
  }
  process.exit(0);
}

const isMain = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) cli();
