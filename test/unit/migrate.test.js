import test from 'node:test';
import assert from 'node:assert/strict';

import { decryptValue } from '../../src/crypto/decrypt.js';
import { encryptValue } from '../../src/crypto/encrypt.js';
import { migrateConfig } from '../../src/utils/migrate.js';

const KEY = 'migration-test-key';

test('migrateConfig converts selected legacy payloads to v2 without mutating input', () => {
  const input = {
    db: {
      user: 'app',
      password: encryptValue('secret', KEY, 'db.password', { formatVersion: 1 })
    },
    emptyObject: {},
    emptyArray: []
  };
  const snapshot = structuredClone(input);

  const result = migrateConfig(input, {
    key: KEY,
    paths: ['db.password']
  });

  assert.deepEqual(input, snapshot);
  assert.equal(result.changed, true);
  assert.deepEqual(result.stats, {
    selected: 1,
    migrated: 1,
    preservedV2: 0
  });
  assert.match(result.data.db.password, /^yl\|2\|/);
  assert.equal(decryptValue(result.data.db.password, KEY, 'db.password'), 'secret');
  assert.equal(result.data.db.user, 'app');
  assert.deepEqual(result.data.emptyObject, {});
  assert.deepEqual(result.data.emptyArray, []);
});

test('migrateConfig preserves trailing holes in sparse arrays', () => {
  const input = new Array(4);
  input[1] = encryptValue('sparse-secret', KEY, '[1]', { formatVersion: 1 });

  const result = migrateConfig(input, { key: KEY });

  assert.equal(result.data.length, 4);
  assert.equal(0 in result.data, false);
  assert.equal(2 in result.data, false);
  assert.equal(3 in result.data, false);
  assert.equal(decryptValue(result.data[1], KEY, '[1]'), 'sparse-secret');
});

test('migrateConfig upgrades payloads with legacy ambiguous field paths', () => {
  const legacy = encryptValue('special-secret', KEY, 'a.b', { formatVersion: 1 });
  const result = migrateConfig(
    { 'a.b': legacy, a: { b: 'nested-plaintext' } },
    { key: KEY, paths: [String.raw`a\.b`] }
  );

  assert.equal(result.stats.migrated, 1);
  assert.equal(result.data.a.b, 'nested-plaintext');
  assert.equal(
    decryptValue(result.data['a.b'], KEY, String.raw`a\.b`),
    'special-secret'
  );
});

test('migrateConfig combines exact paths and structural patterns', () => {
  const input = {
    services: [
      {
        token: encryptValue('first', KEY, 'services[0].token', { formatVersion: 1 }),
        note: 'plaintext-note'
      },
      {
        token: encryptValue('second', KEY, 'services[1].token', { formatVersion: 1 })
      }
    ],
    exact: encryptValue('third', KEY, 'exact', { formatVersion: 1 }),
    untouched: 'plaintext'
  };

  const result = migrateConfig(input, {
    key: KEY,
    paths: ['exact', 'services[0].token'],
    pathPatterns: ['services[*].token', 'services[0].token']
  });

  assert.deepEqual(result.stats, {
    selected: 3,
    migrated: 3,
    preservedV2: 0
  });
  assert.equal(decryptValue(result.data.services[0].token, KEY, 'services[0].token'), 'first');
  assert.equal(decryptValue(result.data.services[1].token, KEY, 'services[1].token'), 'second');
  assert.equal(decryptValue(result.data.exact, KEY, 'exact'), 'third');
  assert.equal(result.data.services[0].note, 'plaintext-note');
  assert.equal(result.data.untouched, 'plaintext');
});

test('migrateConfig validates path patterns before traversal', () => {
  let valueReads = 0;
  const input = {};
  Object.defineProperty(input, 'value', {
    enumerable: true,
    get() {
      valueReads += 1;
      return 'plaintext';
    }
  });

  assert.throws(
    () => migrateConfig(input, { key: KEY, pathPatterns: ['partial-*'] }),
    (error) => error.code === 'ERR_INVALID_PATH_PATTERNS'
  );
  assert.equal(valueReads, 0);
});

test('migrateConfig authenticates and preserves v2 values only when allowed', () => {
  const v2 = encryptValue('modern', KEY, 'token', { formatVersion: 2 });

  assert.throws(
    () => migrateConfig({ token: v2 }, { key: KEY }),
    (error) => error.code === 'ERR_MIGRATION_ALREADY_V2'
  );

  const result = migrateConfig({ token: v2 }, {
    key: KEY,
    allowMixed: true
  });
  assert.equal(result.changed, false);
  assert.equal(result.data.token, v2);
  assert.deepEqual(result.stats, {
    selected: 1,
    migrated: 0,
    preservedV2: 1
  });

  assert.throws(
    () => migrateConfig({ token: v2 }, { key: 'wrong-key', allowMixed: true }),
    (error) => error.code === 'ERR_AUTHENTICATION_FAILED'
  );
});

test('migrateConfig rejects selected plaintext, non-string, and unsupported versions', () => {
  assert.throws(
    () => migrateConfig({ value: 'plaintext' }, { key: KEY }),
    (error) => error.code === 'ERR_MIGRATION_PLAINTEXT'
  );
  assert.throws(
    () => migrateConfig({ value: 42 }, { key: KEY }),
    (error) => error.code === 'ERR_MIGRATION_NON_STRING'
  );
  assert.throws(
    () => migrateConfig({ value: 'yl|3|future' }, { key: KEY }),
    (error) => error.code === 'ERR_MIGRATION_UNSUPPORTED_VERSION'
  );
});

test('migrateConfig rejects empty selections and invalid input', () => {
  assert.throws(
    () => migrateConfig({ value: 'plaintext' }, { key: KEY, paths: ['missing'] }),
    (error) => error.code === 'ERR_MIGRATION_NOTHING_TO_DO'
  );
  assert.throws(
    () => migrateConfig(null, { key: KEY }),
    (error) => error.code === 'ERR_MIGRATION_INPUT'
  );
  assert.throws(
    () => migrateConfig({}, null),
    (error) => error.code === 'ERR_MIGRATION_OPTIONS'
  );
});

test('migrateConfig does not expose decrypted values after a later failure', () => {
  const first = encryptValue('first-secret', KEY, 'first', { formatVersion: 1 });
  const input = {
    first,
    second: 'not-encrypted'
  };

  assert.throws(
    () => migrateConfig(input, { key: KEY }),
    (error) => error.code === 'ERR_MIGRATION_PLAINTEXT'
  );
  assert.equal(input.first, first);
  assert.equal(input.second, 'not-encrypted');
});
