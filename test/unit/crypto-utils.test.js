import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeFieldPathSalt,
  deriveKey,
  encodeFieldPathSalt,
  formatPayload,
  generateIv,
  isYamlockPayload,
  parsePayload
} from '../../src/crypto/utils.js';

const ALGORITHM = 'aes-256-cbc';

test('deriveKey produces deterministic buffers sized for the cipher', () => {
  const first = deriveKey('top-secret', ALGORITHM);
  const second = deriveKey('top-secret', ALGORITHM);

  assert.equal(first.byteLength, 32);
  assert.equal(second.byteLength, 32);
  assert.deepEqual(first, second);
});

test('generateIv returns random values of correct length', () => {
  const first = generateIv(ALGORITHM);
  const second = generateIv(ALGORITHM);

  assert.equal(first.byteLength, 16);
  assert.equal(second.byteLength, 16);
  assert.notDeepEqual(first, second);
});

test('encodeFieldPathSalt and decodeFieldPathSalt round trip field paths', () => {
  const initialPath = 'db.connection.password';
  const salt = encodeFieldPathSalt(initialPath);
  const restoredPath = decodeFieldPathSalt(salt);

  assert.equal(salt, Buffer.from(initialPath, 'utf8').toString('base64'));
  assert.equal(restoredPath, initialPath);
});

test('formatPayload + parsePayload round trip encrypted metadata', () => {
  const salt = encodeFieldPathSalt('secret.path');
  const iv = Buffer.from('iv-sample-value-16', 'utf8');
  const data = Buffer.from('ciphertext', 'utf8');

  const serialized = formatPayload({
    algorithm: ALGORITHM,
    salt,
    iv,
    data
  });

  assert.equal(isYamlockPayload(serialized), true);

  const parsed = parsePayload(serialized);
  assert.equal(parsed.algorithm, ALGORITHM);
  assert.equal(parsed.salt, salt);
  assert.deepEqual(parsed.iv, Buffer.from(iv.toString('base64'), 'base64'));
  assert.deepEqual(parsed.data, Buffer.from(data.toString('base64'), 'base64'));
});

test('parsePayload rejects malformed values', () => {
  assert.throws(() => parsePayload('not-a-yamlock-value'));
  assert.throws(() => parsePayload('yl|only|three|parts'));
});
