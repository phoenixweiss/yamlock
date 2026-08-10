import test from 'node:test';
import assert from 'node:assert/strict';

import {
  encryptValue,
  decryptValue,
  YAMLOCK_ERROR_CODES,
  YamlockAuthenticationError,
  YamlockConfigError,
  YamlockDecryptionError,
  YamlockError,
  YamlockPayloadError,
  YamlockValidationError,
  processConfig,
  serializePath,
  getSupportedAlgorithms
} from '../../src/index.js';

const KEY = 'unit-test-secret-key';
const FIELD = 'path.to.value';

test('public API exports expected helpers', () => {
  assert.equal(typeof encryptValue, 'function');
  assert.equal(typeof decryptValue, 'function');
  assert.equal(typeof processConfig, 'function');
  assert.equal(typeof serializePath, 'function');
  assert.equal(typeof getSupportedAlgorithms, 'function');
  assert.equal(typeof YAMLOCK_ERROR_CODES, 'object');
  assert.equal(typeof YamlockError, 'function');
  assert.equal(typeof YamlockValidationError, 'function');
  assert.equal(typeof YamlockPayloadError, 'function');
  assert.equal(typeof YamlockAuthenticationError, 'function');
  assert.equal(typeof YamlockDecryptionError, 'function');
  assert.equal(typeof YamlockConfigError, 'function');
});

test('serializePath exposes canonical paths through the public API', () => {
  assert.equal(serializePath(['db.primary', 'token']), String.raw`db\.primary.token`);
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
