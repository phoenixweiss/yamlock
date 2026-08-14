import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decryptValue,
  encryptValue,
  processConfig,
  serializePath,
  YAMLOCK_ERROR_CODES,
  YamlockAuthenticationError,
  YamlockConfigError,
  YamlockDecryptionError,
  YamlockError,
  YamlockPayloadError,
  YamlockValidationError
} from '../../src/index.js';

const KEY = 'unit-test-secret-key';
const FIELD_PATH = 'services.db.password';

function assertYamlockError(callback, ErrorClass, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof ErrorClass);
    assert.ok(error instanceof YamlockError);
    assert.equal(error.code, code);
    assert.equal(error.name, ErrorClass.name);
    return true;
  });
}

test('YamlockError validates codes and preserves causes', () => {
  const cause = new Error('low-level failure');
  const error = new YamlockError('Public failure', {
    code: 'ERR_EXAMPLE',
    cause
  });

  assert.equal(error.name, 'YamlockError');
  assert.equal(error.code, 'ERR_EXAMPLE');
  assert.equal(error.cause, cause);
  assert.throws(
    () => new YamlockError('Missing code'),
    /requires an ERR_\* code/
  );
});

test('public validation failures expose stable classes and codes', () => {
  assertYamlockError(
    () => encryptValue(123, KEY, FIELD_PATH),
    YamlockValidationError,
    YAMLOCK_ERROR_CODES.INVALID_VALUE
  );
  assertYamlockError(
    () => encryptValue('value', '', FIELD_PATH),
    YamlockValidationError,
    YAMLOCK_ERROR_CODES.INVALID_KEY
  );
  assertYamlockError(
    () => encryptValue('value', KEY, ''),
    YamlockValidationError,
    YAMLOCK_ERROR_CODES.INVALID_FIELD_PATH
  );
  assertYamlockError(
    () => encryptValue('value', KEY, FIELD_PATH, 'not-a-cipher'),
    YamlockValidationError,
    YAMLOCK_ERROR_CODES.UNSUPPORTED_ALGORITHM
  );
  assertYamlockError(
    () => encryptValue('value', KEY, FIELD_PATH, []),
    YamlockValidationError,
    YAMLOCK_ERROR_CODES.INVALID_OPTIONS
  );
  assertYamlockError(
    () => encryptValue('value', KEY, FIELD_PATH, {
      formatVersion: 1,
      ivLength: -1
    }),
    YamlockValidationError,
    YAMLOCK_ERROR_CODES.INVALID_OPTIONS
  );
  assertYamlockError(
    () => serializePath([]),
    YamlockValidationError,
    YAMLOCK_ERROR_CODES.INVALID_PATH_SEGMENTS
  );
});

test('payload and authentication failures expose stable classes and codes', () => {
  assertYamlockError(
    () => decryptValue('not-a-payload', KEY, FIELD_PATH),
    YamlockPayloadError,
    YAMLOCK_ERROR_CODES.INVALID_PAYLOAD
  );

  const v2Payload = encryptValue('value', KEY, FIELD_PATH);
  assertYamlockError(
    () => decryptValue(v2Payload, 'wrong-key', FIELD_PATH),
    YamlockAuthenticationError,
    YAMLOCK_ERROR_CODES.AUTHENTICATION_FAILED
  );

  const legacyPayload = encryptValue('value', KEY, FIELD_PATH, { formatVersion: 1 });
  assertYamlockError(
    () => decryptValue(legacyPayload, KEY, 'other.path'),
    YamlockDecryptionError,
    YAMLOCK_ERROR_CODES.FIELD_PATH_MISMATCH
  );

  const authenticatedLegacyPayload = encryptValue('value', KEY, FIELD_PATH, {
    formatVersion: 1,
    algorithm: 'chacha20-poly1305'
  });
  assertYamlockError(
    () => decryptValue(authenticatedLegacyPayload, 'wrong-key', FIELD_PATH),
    YamlockDecryptionError,
    YAMLOCK_ERROR_CODES.DECRYPTION_FAILED
  );
});

test('processConfig validation failures expose YamlockConfigError', () => {
  assertYamlockError(
    () => processConfig({}, { mode: 'rotate', key: KEY }),
    YamlockConfigError,
    YAMLOCK_ERROR_CODES.INVALID_MODE
  );
  assertYamlockError(
    () => processConfig(
      { value: 'secret' },
      { mode: 'encrypt', key: KEY, pathPatterns: ['partial-*'] }
    ),
    YamlockConfigError,
    YAMLOCK_ERROR_CODES.INVALID_PATH_PATTERNS
  );
});
