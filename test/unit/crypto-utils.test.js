import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ALGORITHM,
  decodeFieldPathSalt,
  deriveKey,
  encodeFieldPathSalt,
  formatPayload,
  generateIv,
  isYamlockPayload,
  parsePayload,
  resolveAlgorithmOptions
} from '../../src/crypto/utils.js';

const ALGORITHM = DEFAULT_ALGORITHM;

test('deriveKey produces deterministic buffers sized for the cipher', () => {
  const config = resolveAlgorithmOptions(ALGORITHM);
  const first = deriveKey('top-secret', config);
  const second = deriveKey('top-secret', config);

  assert.equal(first.byteLength, 32);
  assert.equal(second.byteLength, 32);
  assert.deepEqual(first, second);
});

test('generateIv returns random values of correct length', () => {
  const config = resolveAlgorithmOptions(ALGORITHM);
  const first = generateIv(config);
  const second = generateIv(config);

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

test('resolveAlgorithmOptions uses presets and overrides', () => {
  const chachaConfig = resolveAlgorithmOptions('chacha20-poly1305');
  assert.equal(chachaConfig.algorithm, 'chacha20-poly1305');
  assert.equal(chachaConfig.keyLength, 32);
  assert.equal(chachaConfig.ivLength, 12);

  const overrideConfig = resolveAlgorithmOptions({
    algorithm: 'aes-192-cbc',
    keyLength: 40,
    ivLength: 24
  });
  assert.equal(overrideConfig.keyLength, 40);
  assert.equal(overrideConfig.ivLength, 24);
});

test('preset algorithms expose expected key/iv lengths', () => {
  const cases = [
    ['aes-128-cbc', 16, 16],
    ['aes-192-cbc', 24, 16],
    ['aes-256-cbc', 32, 16],
    ['chacha20-poly1305', 32, 12]
  ];

  cases.forEach(([name, keyLength, ivLength]) => {
    const config = resolveAlgorithmOptions(name);
    assert.equal(config.algorithm, name);
    assert.equal(config.keyLength, keyLength);
    assert.equal(config.ivLength, ivLength);
  });
});
