import test from 'node:test';
import assert from 'node:assert/strict';

import { encryptValue } from '../../src/crypto/encrypt.js';
import { decryptValue } from '../../src/crypto/decrypt.js';
import {
  ALGORITHM_NAMES,
  TEST_FIELD_PATH as FIELD_PATH,
  TEST_KEY as KEY
} from '../../fixtures/crypto-fixtures.js';

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

ALGORITHM_NAMES.forEach((name) => {
  test(`decryptValue round-trips for ${name}`, () => {
    const payload = encryptValue('multi', KEY, FIELD_PATH, { algorithm: name });
    const decrypted = decryptValue(payload, KEY, FIELD_PATH);
    assert.equal(decrypted, 'multi');
  });
});
