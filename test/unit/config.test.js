import test from 'node:test';
import assert from 'node:assert/strict';

import { processConfig } from '../../src/utils/config.js';

const KEY = 'unit-test-secret-key';
const ALGORITHMS = ['aes-128-cbc', 'aes-192-cbc', 'aes-256-cbc', 'chacha20-poly1305'];

test('processConfig encrypts nested string values across objects and arrays', () => {
  const input = {
    db: {
      host: 'localhost',
      password: 'swordfish'
    },
    version: 1,
    features: ['alpha', { flag: 'beta' }]
  };

  const encrypted = processConfig(input, { mode: 'encrypt', key: KEY });

  assert.notEqual(encrypted.db.password, 'swordfish');
  assert.notEqual(encrypted.db.host, 'localhost');
  assert.equal(typeof encrypted.features[0], 'string');
  assert.notEqual(encrypted.features[0], 'alpha');
  assert.notEqual(encrypted.features[1].flag, 'beta');
  assert.equal(encrypted.version, 1);
});

test('processConfig decrypts values back to their original form', () => {
  const input = {
    db: {
      password: 'secret'
    }
  };

  const encrypted = processConfig(input, { mode: 'encrypt', key: KEY });
  const decrypted = processConfig(encrypted, { mode: 'decrypt', key: KEY });

  assert.deepEqual(decrypted, input);
});

test('processConfig validates mode and input types', () => {
  assert.throws(() => processConfig(null, { mode: 'encrypt', key: KEY }), /non-null object or array/);
  assert.throws(() => processConfig({ value: 'x' }, { mode: 'unknown', key: KEY }), /Unknown processConfig mode/);
});

test('processConfig respects algorithm option overrides', () => {
  const input = {
    token: 'secret'
  };

  const algorithmOptions = { algorithm: 'chacha20-poly1305' };
  const encrypted = processConfig(input, { mode: 'encrypt', key: KEY, algorithm: algorithmOptions });
  const decrypted = processConfig(encrypted, { mode: 'decrypt', key: KEY, algorithm: algorithmOptions });

  assert.deepEqual(decrypted, input);
});

ALGORITHMS.forEach((name) => {
  test(`processConfig encrypts/decrypts using ${name}`, () => {
    const input = { value: 'secret' };
    const encrypted = processConfig(input, { mode: 'encrypt', key: KEY, algorithm: { algorithm: name } });
    const decrypted = processConfig(encrypted, { mode: 'decrypt', key: KEY, algorithm: { algorithm: name } });
    assert.deepEqual(decrypted, input);
  });
});
