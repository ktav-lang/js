import assert from 'node:assert/strict';
import test from 'node:test';
import { checkLock, checkPlatform } from '../scripts/check-npm-licenses.mjs';

const name = '@ktav-lang/js-linux-x64-gnu';
const root = { optionalDependencies: { [name]: '0.8.1' } };
const entry = `node_modules/${name}`;
const lock = (packages) => ({ lockfileVersion: 3, packages: { '': {}, ...packages } });

test('checks every lockfile entry and rejects unapproved compounds', () => {
  const result = checkLock(lock({
    'node_modules/a': { license: 'MIT AND GPL-3.0-only' },
    'node_modules/b': {},
    'node_modules/c': { license: 'MIT' },
  }), {});
  assert.equal(result.failures.length, 2);
  assert.equal(result.platforms.length, 0);
});

test('limits Python-2.0 exception to the reviewed development package', () => {
  const result = checkLock(lock({
    'node_modules/argparse': { version: '2.0.1', dev: true, license: 'Python-2.0' },
    'node_modules/a': { version: '2.0.1', dev: true, license: 'Python-2.0' },
  }), {});
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /node_modules\/a/);
  assert.equal(checkLock(lock({ 'node_modules/argparse': { version: '2.0.1', license: 'Python-2.0' } }), {}).failures.length, 1);
});

test('requires reviewed optional packages to match registry and local metadata', () => {
  const result = checkLock(lock({ [entry]: { optional: true } }), root);
  assert.deepEqual(result.failures, []);
  assert.equal(result.platforms.length, 1);
  const expected = result.platforms[0];
  const pkg = { name, version: '0.8.1', license: 'MIT OR Apache-2.0' };
  assert.deepEqual(checkPlatform(expected, pkg, pkg), []);
  assert.notEqual(checkPlatform(expected, pkg, { ...pkg, license: 'UNKNOWN' }).length, 0);
  assert.notEqual(checkPlatform(expected, pkg, { ...pkg, dependencies: { unreviewed: '1' } }).length, 0);
  assert.notEqual(checkPlatform(expected, pkg, { ...pkg, version: '0.8.2' }).length, 0);
  assert.notEqual(checkLock(lock({}), root).failures.length, 0);
  assert.notEqual(checkLock(lock({ [entry]: { optional: true } }), { optionalDependencies: { [name]: '^0.8.1' } }).failures.length, 0);
});

test('rejects malformed lockfiles', () => {
  assert.throws(() => checkLock({ lockfileVersion: 2, packages: {} }, {}));
  assert.throws(() => checkLock({ lockfileVersion: 3 }, {}));
});
