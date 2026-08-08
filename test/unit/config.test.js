import test from 'node:test';
import assert from 'node:assert/strict';

import { decryptValue } from '../../src/crypto/decrypt.js';
import { encryptValue } from '../../src/crypto/encrypt.js';
import { processConfig } from '../../src/utils/config.js';
import {
  ALGORITHM_NAMES,
  nestedConfig,
  sampleConfig,
  TEST_KEY as KEY
} from '../../fixtures/crypto-fixtures.js';

test('processConfig encrypts nested string values across objects and arrays', () => {
  const input = nestedConfig();

  const encrypted = processConfig(input, { mode: 'encrypt', key: KEY });

  assert.match(encrypted.db.password, /^yl\|2\|/);
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
  const input = sampleConfig();

  const algorithmOptions = { algorithm: 'chacha20-poly1305' };
  const encrypted = processConfig(input, { mode: 'encrypt', key: KEY, algorithm: algorithmOptions });
  const decrypted = processConfig(encrypted, { mode: 'decrypt', key: KEY, algorithm: algorithmOptions });

  assert.deepEqual(decrypted, input);
});

ALGORITHM_NAMES.forEach((name) => {
  test(`processConfig encrypts/decrypts using ${name}`, () => {
    const input = sampleConfig();
    const encrypted = processConfig(input, { mode: 'encrypt', key: KEY, algorithm: { algorithm: name } });
    const decrypted = processConfig(encrypted, { mode: 'decrypt', key: KEY, algorithm: { algorithm: name } });
    assert.deepEqual(decrypted, input);
  });
});

test('processConfig only processes specified paths', () => {
  const input = {
    db: { user: 'app', password: 'secret' },
    api: { token: 'abc', url: 'https://example.com' }
  };

  const encrypted = processConfig(input, {
    mode: 'encrypt',
    key: KEY,
    paths: ['db.password', 'api.token']
  });

  assert.equal(encrypted.db.user, input.db.user);
  assert.equal(encrypted.api.url, input.api.url);
  assert.notEqual(encrypted.db.password, input.db.password);
  assert.notEqual(encrypted.api.token, input.api.token);

  const decrypted = processConfig(encrypted, {
    mode: 'decrypt',
    key: KEY,
    paths: ['db.password', 'api.token']
  });

  assert.deepEqual(decrypted, input);
});

test('processConfig ignores non-existent paths without modifying data', () => {
  const input = sampleConfig('value');
  const encrypted = processConfig(input, {
    mode: 'encrypt',
    key: KEY,
    paths: ['non.existent.path']
  });
  assert.deepEqual(encrypted, input);
});

test('processConfig preserves valid encrypted values and encrypts remaining plaintext', () => {
  const modern = encryptValue('modern-secret', KEY, 'modern');
  const legacy = encryptValue('legacy-secret', KEY, 'legacy', { formatVersion: 1 });
  const input = {
    modern,
    legacy,
    plaintext: 'new-secret'
  };

  const encrypted = processConfig(input, { mode: 'encrypt', key: KEY });
  assert.equal(encrypted.modern, modern);
  assert.equal(encrypted.legacy, legacy);
  assert.match(encrypted.plaintext, /^yl\|2\|/);

  const repeated = processConfig(encrypted, { mode: 'encrypt', key: KEY });
  assert.deepEqual(repeated, encrypted);
});

test('processConfig can fail when a selected value is already encrypted', () => {
  const payload = encryptValue('secret', KEY, 'value');

  assert.throws(
    () => processConfig(
      { value: payload },
      { mode: 'encrypt', key: KEY, existingPayloadPolicy: 'error' }
    ),
    (error) => error.code === 'ERR_ALREADY_ENCRYPTED'
  );
});

test('processConfig requires an explicit policy to encrypt yl-prefixed plaintext', () => {
  const payload = encryptValue('secret', KEY, 'value');
  const encrypted = processConfig(
    { value: payload },
    { mode: 'encrypt', key: KEY, existingPayloadPolicy: 'encrypt' }
  );

  assert.notEqual(encrypted.value, payload);
  assert.equal(decryptValue(encrypted.value, KEY, 'value'), payload);
});

test('processConfig authenticates existing payloads before preserving them', () => {
  const payload = encryptValue('secret', KEY, 'value');

  assert.throws(
    () => processConfig({ value: payload }, { mode: 'encrypt', key: 'wrong-key' }),
    (error) => error.code === 'ERR_AUTHENTICATION_FAILED'
  );
  assert.throws(
    () => processConfig({ value: 'yl|2|broken' }, { mode: 'encrypt', key: KEY }),
    /expected 12 fields/i
  );
});

test('processConfig validates existingPayloadPolicy usage', () => {
  assert.throws(
    () => processConfig(
      { value: 'secret' },
      { mode: 'encrypt', key: KEY, existingPayloadPolicy: 'unknown' }
    ),
    (error) => error.code === 'ERR_INVALID_EXISTING_PAYLOAD_POLICY'
  );
  assert.throws(
    () => processConfig(
      { value: 'secret' },
      { mode: 'decrypt', key: KEY, existingPayloadPolicy: 'preserve' }
    ),
    (error) => error.code === 'ERR_INVALID_EXISTING_PAYLOAD_POLICY'
  );
});

test('processConfig stringifies non-string values when policy=stringify', () => {
  const input = { value: 12345 };
  const encrypted = processConfig(input, {
    mode: 'encrypt',
    key: KEY,
    nonStringPolicy: 'stringify'
  });
  assert.ok(encrypted.value.startsWith('yl|'));

  const decrypted = processConfig(encrypted, {
    mode: 'decrypt',
    key: KEY,
    nonStringPolicy: 'stringify'
  });
  assert.equal(decrypted.value, '12345');
});

test('processConfig throws when non-string values encountered and policy=error', () => {
  const algorithmOptions = { algorithm: 'aes-192-cbc' };
  const input = { value: { secret: 123 } };
  assert.throws(() => {
    processConfig(input, { mode: 'encrypt', key: KEY, nonStringPolicy: 'error', algorithm: algorithmOptions });
  }, /Non-string value encountered/);
});
