import test from 'node:test';
import assert from 'node:assert/strict';

import { processConfig } from '../../src/utils/config.js';

const KEY = 'unit-test-secret-key';

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
