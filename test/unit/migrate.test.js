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
      password: encryptValue('secret', KEY, 'db.password')
    }
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
  const first = encryptValue('first-secret', KEY, 'first');
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
