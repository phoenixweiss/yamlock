import test from 'node:test';
import assert from 'node:assert/strict';

import { encryptValue } from '../../src/crypto/encrypt.js';
import { parsePayload } from '../../src/crypto/utils.js';

const KEY = 'unit-test-secret-key';
const FIELD_PATH = 'services.db.password';

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
