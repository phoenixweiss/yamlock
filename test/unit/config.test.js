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
  assert.throws(
    () => processConfig(null, { mode: 'encrypt', key: KEY }),
    (error) => error.code === 'ERR_INVALID_CONFIG_ROOT'
  );
  assert.throws(
    () => processConfig(new Date(), { mode: 'encrypt', key: KEY }),
    (error) => error.code === 'ERR_INVALID_CONFIG_ROOT'
  );
  assert.throws(
    () => processConfig({ value: 'x' }),
    (error) => error.code === 'ERR_INVALID_CONFIG_OPTIONS'
  );
  assert.throws(() => processConfig({ value: 'x' }, { mode: 'unknown', key: KEY }), /Unknown processConfig mode/);
});

test('processConfig validates policies, paths, and path serializers', () => {
  const input = { value: 'secret' };

  assert.throws(
    () => processConfig(input, { mode: 'encrypt', key: KEY, nonStringPolicy: 'unknown' }),
    (error) => error.code === 'ERR_INVALID_NON_STRING_POLICY'
  );
  assert.throws(
    () => processConfig(input, { mode: 'encrypt', key: KEY, paths: 'value' }),
    (error) => error.code === 'ERR_INVALID_PATHS'
  );
  assert.throws(
    () => processConfig(input, { mode: 'encrypt', key: KEY, paths: [''] }),
    (error) => error.code === 'ERR_INVALID_PATHS'
  );
  assert.throws(
    () => processConfig(input, { mode: 'encrypt', key: KEY, parentPath: [undefined] }),
    (error) => error.code === 'ERR_INVALID_PATH_SEGMENTS'
  );
  assert.throws(
    () => processConfig(input, { mode: 'encrypt', key: KEY, pathSerializer: 'value' }),
    (error) => error.code === 'ERR_INVALID_PATH_SERIALIZER'
  );
  assert.throws(
    () => processConfig(input, {
      mode: 'encrypt',
      key: KEY,
      pathSerializer: () => 42
    }),
    (error) => error.code === 'ERR_INVALID_PATH_SERIALIZER'
  );
  assert.throws(
    () => processConfig(input, {
      mode: 'encrypt',
      key: KEY,
      pathSerializer: () => {
        throw new Error('serializer failure');
      }
    }),
    (error) => error.code === 'ERR_INVALID_PATH_SERIALIZER'
  );
});

test('processConfig rejects pathSerializer collisions and supports valid custom paths', () => {
  assert.throws(
    () => processConfig(
      { first: 'one', second: 'two' },
      { mode: 'encrypt', key: KEY, pathSerializer: () => 'same' }
    ),
    (error) => error.code === 'ERR_PATH_COLLISION'
  );

  const serializer = (segments) => segments.join('/');
  const input = { db: { password: 'secret' } };
  const encrypted = processConfig(input, {
    mode: 'encrypt',
    key: KEY,
    pathSerializer: serializer
  });
  const decrypted = processConfig(encrypted, {
    mode: 'decrypt',
    key: KEY,
    pathSerializer: serializer
  });
  assert.deepEqual(decrypted, input);
});

test('processConfig rejects cycles but permits shared non-circular objects', () => {
  const circular = { value: 'secret' };
  circular.self = circular;
  assert.throws(
    () => processConfig(circular, { mode: 'encrypt', key: KEY }),
    (error) => error.code === 'ERR_CIRCULAR_CONFIG'
  );

  const shared = { secret: 'value' };
  const encrypted = processConfig(
    { first: shared, second: shared },
    { mode: 'encrypt', key: KEY }
  );
  assert.match(encrypted.first.secret, /^yl\|2\|/);
  assert.match(encrypted.second.secret, /^yl\|2\|/);
  assert.notEqual(encrypted.first.secret, encrypted.second.secret);
  assert.equal(shared.secret, 'value');
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

test('processConfig stringifies finite JSON primitives when policy=stringify', () => {
  const input = { number: 12345, enabled: true, empty: null };
  const encrypted = processConfig(input, {
    mode: 'encrypt',
    key: KEY,
    nonStringPolicy: 'stringify'
  });
  assert.match(encrypted.number, /^yl\|2\|/);
  assert.match(encrypted.enabled, /^yl\|2\|/);
  assert.match(encrypted.empty, /^yl\|2\|/);

  const decrypted = processConfig(encrypted, {
    mode: 'decrypt',
    key: KEY
  });
  assert.deepEqual(decrypted, { number: '12345', enabled: 'true', empty: 'null' });
});

test('processConfig throws when non-string values encountered and policy=error', () => {
  const algorithmOptions = { algorithm: 'aes-192-cbc' };
  const input = { value: { secret: 123 } };
  assert.throws(
    () => processConfig(input, {
      mode: 'encrypt',
      key: KEY,
      nonStringPolicy: 'error',
      algorithm: algorithmOptions
    }),
    (error) => error.code === 'ERR_NON_STRING_VALUE'
  );
});

test('processConfig preserves opaque values with policy=ignore', () => {
  const date = new Date('2025-12-01T12:34:56.000Z');
  const map = new Map([['key', 'value']]);
  const handler = () => 'value';
  const input = {
    date,
    map,
    missing: undefined,
    large: 1n,
    invalidNumber: Number.NaN,
    handler
  };

  const result = processConfig(input, { mode: 'encrypt', key: KEY });
  assert.equal(result.date, date);
  assert.equal(result.map, map);
  assert.equal(result.missing, undefined);
  assert.equal(result.large, 1n);
  assert.equal(Number.isNaN(result.invalidNumber), true);
  assert.equal(result.handler, handler);
});

test('processConfig fails closed when stringify would lose type information', () => {
  const unsupported = [
    undefined,
    1n,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    new Date('2025-12-01T12:34:56.000Z'),
    new Map([['key', 'value']])
  ];

  for (const value of unsupported) {
    assert.throws(
      () => processConfig(
        { value },
        { mode: 'encrypt', key: KEY, nonStringPolicy: 'stringify' }
      ),
      (error) => error.code === 'ERR_UNSUPPORTED_CONFIG_VALUE'
    );
  }
});

test('processConfig applies nonStringPolicy only to selected values', () => {
  const date = new Date('2025-12-01T12:34:56.000Z');
  const input = { secret: 'value', retries: 3, createdAt: date };
  const encrypted = processConfig(input, {
    mode: 'encrypt',
    key: KEY,
    paths: ['secret'],
    nonStringPolicy: 'error'
  });

  assert.match(encrypted.secret, /^yl\|2\|/);
  assert.equal(encrypted.retries, 3);
  assert.equal(encrypted.createdAt, date);
});

test('processConfig rejects selected non-string values during decryption', () => {
  assert.throws(
    () => processConfig(
      { value: 123 },
      { mode: 'decrypt', key: KEY, nonStringPolicy: 'stringify' }
    ),
    (error) => error.code === 'ERR_NON_STRING_VALUE'
  );
});
