import test from 'node:test';
import assert from 'node:assert/strict';

import { encryptValue } from '../../src/crypto/encrypt.js';
import { decryptValue } from '../../src/crypto/decrypt.js';

const KEY = 'unit-test-secret-key';
const FIELD_PATH = 'services.db.password';
const ALGORITHMS = ['aes-128-cbc', 'aes-192-cbc', 'aes-256-cbc', 'chacha20-poly1305'];

test('decryptValue returns the original string when metadata matches', () => {
  const payload = encryptValue('swordfish', KEY, FIELD_PATH);
  const decrypted = decryptValue(payload, KEY, FIELD_PATH);

  assert.equal(decrypted, 'swordfish');
});

test('decryptValue fails when the field path does not match', () => {
  const payload = encryptValue('token', KEY, FIELD_PATH);

  assert.throws(
    () => decryptValue(payload, KEY, 'services.redis.password'),
    /Field path does not match/
  );
});

test('decryptValue requires yamlock payloads', () => {
  assert.throws(() => decryptValue('not-a-payload', KEY, FIELD_PATH), /yamlock-formatted/);
});

test('decryptValue supports algorithms with auth tags', () => {
  const payload = encryptValue('poly', KEY, FIELD_PATH, { algorithm: 'chacha20-poly1305' });
  const decrypted = decryptValue(payload, KEY, FIELD_PATH);

  assert.equal(decrypted, 'poly');
});

ALGORITHMS.forEach((name) => {
  test(`decryptValue round-trips for ${name}`, () => {
    const payload = encryptValue('multi', KEY, FIELD_PATH, { algorithm: name });
    const decrypted = decryptValue(payload, KEY, FIELD_PATH);
    assert.equal(decrypted, 'multi');
  });
});
