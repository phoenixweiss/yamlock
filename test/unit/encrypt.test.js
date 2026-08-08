import test from 'node:test';
import assert from 'node:assert/strict';

import { encryptValue } from '../../src/crypto/encrypt.js';
import { parseV2Payload } from '../../src/crypto/payload-v2.js';
import { parsePayload } from '../../src/crypto/utils.js';
import {
  ALGORITHM_CASES,
  TEST_FIELD_PATH as FIELD_PATH,
  TEST_KEY as KEY
} from '../../fixtures/crypto-fixtures.js';

test('encryptValue writes authenticated v2 payloads by default', () => {
  const encrypted = encryptValue('swordfish', KEY, FIELD_PATH);
  const payload = parseV2Payload(encrypted);

  assert.equal(payload.algorithm, 'aes-256-gcm');
  assert.equal(payload.storedFieldPath, FIELD_PATH);
  assert.equal(payload.nonce.byteLength, 12);
  assert.equal(payload.authTag.byteLength, 16);
});

test('encryptValue uses fresh v2 material for each default call', () => {
  const first = parseV2Payload(encryptValue('matching', KEY, FIELD_PATH));
  const second = parseV2Payload(encryptValue('matching', KEY, FIELD_PATH));

  assert.notDeepEqual(first.kdfSalt, second.kdfSalt);
  assert.notDeepEqual(first.nonce, second.nonce);
  assert.notDeepEqual(first.ciphertext, second.ciphertext);
});

test('encryptValue enforces string inputs and supported algorithms', () => {
  assert.throws(() => encryptValue(123, KEY, FIELD_PATH), /expects the value to be a string/i);
  assert.throws(() => encryptValue('value', KEY, FIELD_PATH, 'non-existent-cipher'), /Unsupported algorithm/i);
});

test('encryptValue supports algorithm option overrides', () => {
  const encrypted = encryptValue('override', KEY, FIELD_PATH, {
    algorithm: 'chacha20-poly1305'
  });
  const payload = parsePayload(encrypted);

  assert.equal(payload.algorithm, 'chacha20-poly1305');
  assert.equal(payload.iv.byteLength, 12);
});
ALGORITHM_CASES.forEach(({ name, ivLength }) => {
  test(`encryptValue writes explicit legacy payload metadata for ${name}`, () => {
    const encrypted = encryptValue('value', KEY, FIELD_PATH, {
      formatVersion: 1,
      algorithm: name
    });
    const payload = parsePayload(encrypted);

    assert.equal(payload.algorithm, name);
    assert.equal(payload.iv.byteLength, ivLength);
  });
});
