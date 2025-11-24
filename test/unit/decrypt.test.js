import test from 'node:test';
import assert from 'node:assert/strict';

import { encryptValue } from '../../src/crypto/encrypt.js';
import { decryptValue } from '../../src/crypto/decrypt.js';

const KEY = 'unit-test-secret-key';
const FIELD_PATH = 'services.db.password';

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
