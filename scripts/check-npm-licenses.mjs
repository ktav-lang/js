import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const allowed = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'MIT OR Apache-2.0', 'Apache-2.0 OR MIT']);
const platformPrefix = '@ktav-lang/js-';
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const dependencyFields = ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies'];

export function checkLock(lock, root) {
  if (lock?.lockfileVersion !== 3 || !lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages) || !lock.packages['']) {
    throw new Error('Invalid npm lockfile');
  }
  const failures = [];
  const platforms = [];
  for (const [path, pkg] of Object.entries(lock.packages)) {
    if (path === '') continue;
    if (allowed.has(pkg?.license)) continue;
    if (path === 'node_modules/argparse' && pkg?.version === '2.0.1' && pkg?.dev === true && pkg?.license === 'Python-2.0') continue;
    const name = path.startsWith('node_modules/') ? path.slice('node_modules/'.length) : '';
    const suffix = name.startsWith(platformPrefix) ? name.slice(platformPrefix.length) : '';
    const version = root?.optionalDependencies?.[name];
    if (!pkg?.license && pkg?.optional === true && /^[a-z0-9-]+$/.test(suffix) && versionPattern.test(version || '')) {
      platforms.push({ name, version, suffix });
    } else {
      failures.push(`${path}: unapproved or missing license ${JSON.stringify(pkg?.license)}`);
    }
  }
  for (const [name, version] of Object.entries(root?.optionalDependencies || {})) {
    if (name.startsWith(platformPrefix) && !lock.packages[`node_modules/${name}`]) {
      failures.push(`${name}@${version}: missing lockfile entry`);
    }
  }
  return { failures, platforms };
}

export function checkPlatform(expected, local, published) {
  const failures = [];
  for (const [label, pkg] of [['local', local], ['registry', published]]) {
    if (pkg?.name !== expected.name || pkg?.version !== expected.version || !allowed.has(pkg?.license)) {
      failures.push(`${expected.name}@${expected.version}: invalid ${label} identity or license`);
    }
    for (const field of dependencyFields) {
      if (pkg?.[field] != null && (typeof pkg[field] !== 'object' || Object.keys(pkg[field]).length > 0)) {
        failures.push(`${expected.name}@${expected.version}: unreviewed ${label} ${field}`);
      }
    }
  }
  if (local?.license !== published?.license) failures.push(`${expected.name}@${expected.version}: license metadata differs`);
  return failures;
}

async function main() {
  const base = process.argv[2] || '.';
  const lock = JSON.parse(await readFile(join(base, 'package-lock.json'), 'utf8'));
  const root = JSON.parse(await readFile(join(base, 'package.json'), 'utf8'));
  const { failures, platforms } = checkLock(lock, root);
  for (const expected of platforms) {
    try {
      const local = JSON.parse(await readFile(join(base, 'npm', expected.suffix, 'package.json'), 'utf8'));
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(expected.name)}/${encodeURIComponent(expected.version)}`);
      if (!response.ok) throw new Error(`registry HTTP ${response.status}`);
      failures.push(...checkPlatform(expected, local, await response.json()));
    } catch (error) {
      failures.push(`${expected.name}@${expected.version}: ${error.message}`);
    }
  }
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
  } else {
    console.log(`Checked ${Object.keys(lock.packages).length - 1} npm lockfile entries`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
