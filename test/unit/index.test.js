import test from 'node:test';
import assert from 'node:assert/strict';

import {
  encryptValue,
  decryptValue,
  processConfig,
  getSupportedAlgorithms
} from '../../src/index.js';

const KEY = 'unit-test-secret-key';
const FIELD = 'path.to.value';

test('public API exports expected helpers', () => {
  assert.equal(typeof encryptValue, 'function');
  assert.equal(typeof decryptValue, 'function');
  assert.equal(typeof processConfig, 'function');
  assert.equal(typeof getSupportedAlgorithms, 'function');
});

test('getSupportedAlgorithms returns a non-empty list', () => {
  const algorithms = getSupportedAlgorithms();
  assert.ok(Array.isArray(algorithms));
  assert.ok(algorithms.length > 0);
});

test('encrypt/decrypt round-trip through the public API', () => {
  const encrypted = encryptValue('swordfish', KEY, FIELD);
  const decrypted = decryptValue(encrypted, KEY, FIELD);
  assert.equal(decrypted, 'swordfish');
});

test('processConfig is exposed and functional', () => {
  const input = { nested: { secret: 'value' } };
  const encrypted = processConfig(input, { mode: 'encrypt', key: KEY });
  const decrypted = processConfig(encrypted, { mode: 'decrypt', key: KEY });
  assert.deepEqual(decrypted, input);
});
