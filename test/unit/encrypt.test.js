import test from 'node:test';
import assert from 'node:assert/strict';

import { encryptValue } from '../../src/crypto/encrypt.js';
import { parsePayload } from '../../src/crypto/utils.js';
import {
  ALGORITHM_CASES,
  TEST_FIELD_PATH as FIELD_PATH,
  TEST_KEY as KEY
} from '../fixtures/crypto-fixtures.js';

test('encryptValue returns a yamlock payload with encoded salt', () => {
  const encrypted = encryptValue('swordfish', KEY, FIELD_PATH);
  const payload = parsePayload(encrypted);

  assert.equal(payload.algorithm, 'aes-256-cbc');
  assert.equal(payload.salt, Buffer.from(FIELD_PATH, 'utf8').toString('base64'));
  assert.ok(payload.iv.byteLength > 0);
  assert.ok(payload.data.byteLength > 0);
});

test('encryptValue uses a different IV for each call', () => {
  const first = parsePayload(encryptValue('matching', KEY, FIELD_PATH));
  const second = parsePayload(encryptValue('matching', KEY, FIELD_PATH));

  assert.notEqual(first.iv.toString('base64'), second.iv.toString('base64'));
  assert.notEqual(first.data.toString('base64'), second.data.toString('base64'));
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
  test(`encryptValue encodes payload metadata for ${name}`, () => {
    const encrypted = encryptValue('value', KEY, FIELD_PATH, { algorithm: name });
    const payload = parsePayload(encrypted);

    assert.equal(payload.algorithm, name);
    assert.equal(payload.iv.byteLength, ivLength);
  });
});
