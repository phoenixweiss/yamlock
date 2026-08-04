import test from 'node:test';
import assert from 'node:assert/strict';

import { decryptValue, encryptValue, processConfig } from '../../src/index.js';
import {
  encryptValueV2,
  parseV2Payload,
  V2_ALGORITHM,
  V2_AUTH_TAG_LENGTH,
  V2_FORMAT_VERSION,
  V2_KDF_SALT_LENGTH,
  V2_MAX_SERIALIZED_BYTES,
  V2_NONCE_LENGTH
} from '../../src/crypto/payload-v2.js';
import {
  LEGACY_PAYLOAD_FIXTURES,
  TEST_FIELD_PATH as FIELD_PATH,
  TEST_KEY as KEY
} from '../../fixtures/crypto-fixtures.js';

const DETERMINISTIC_PAYLOAD = 'yl|2|aes-256-gcm|scrypt|32768|8|1|AAECAwQFBgcICQoLDA0ODw|EBESExQVFhcYGRob|c2VydmljZXMuZGIucGFzc3dvcmQ|8jhQ_ceuqCm4bNQeoeMp8MSEWA|xI4YSwK15t5y3FuRJAavqQ';

function replaceSegment(payload, index, replacement) {
  const parts = payload.split('|');
  parts[index] = replacement;
  return parts.join('|');
}

function changeEncodedByte(segment) {
  const bytes = Buffer.from(segment, 'base64url');
  bytes[0] ^= 1;
  return bytes.toString('base64url');
}

function assertAuthenticationFailure(callback) {
  assert.throws(callback, (error) => {
    assert.equal(error.code, 'ERR_AUTHENTICATION_FAILED');
    assert.match(error.message, /authentication failed/i);
    return true;
  });
}

test('v2 encryption is opt-in and legacy output remains the default', () => {
  const legacy = encryptValue('legacy', KEY, FIELD_PATH);
  const v2 = encryptValue('modern', KEY, FIELD_PATH, { formatVersion: 2 });

  assert.match(legacy, /^yl\|aes-256-cbc\|/);
  assert.match(v2, /^yl\|2\|aes-256-gcm\|scrypt\|/);
  assert.equal(decryptValue(v2, KEY, FIELD_PATH), 'modern');
});

test('v2 deterministic vector has canonical metadata and round-trips', () => {
  const payload = encryptValueV2('deterministic-value', KEY, FIELD_PATH, {
    kdfSalt: Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex'),
    nonce: Buffer.from('101112131415161718191a1b', 'hex')
  });

  assert.equal(payload, DETERMINISTIC_PAYLOAD);

  const parsed = parseV2Payload(payload);
  assert.equal(parsed.version, V2_FORMAT_VERSION);
  assert.equal(parsed.algorithm, V2_ALGORITHM);
  assert.equal(parsed.kdfSalt.length, V2_KDF_SALT_LENGTH);
  assert.equal(parsed.nonce.length, V2_NONCE_LENGTH);
  assert.equal(parsed.authTag.length, V2_AUTH_TAG_LENGTH);
  assert.equal(parsed.storedFieldPath, FIELD_PATH);
  assert.equal(decryptValue(payload, KEY, FIELD_PATH), 'deterministic-value');
});

test('v2 authenticates caller path, salt, nonce, ciphertext, and tag', () => {
  const parts = DETERMINISTIC_PAYLOAD.split('|');

  assertAuthenticationFailure(() => decryptValue(DETERMINISTIC_PAYLOAD, KEY, 'other.path'));
  assertAuthenticationFailure(() => decryptValue(DETERMINISTIC_PAYLOAD, 'wrong-secret', FIELD_PATH));
  assertAuthenticationFailure(() => decryptValue(
    replaceSegment(DETERMINISTIC_PAYLOAD, 7, changeEncodedByte(parts[7])),
    KEY,
    FIELD_PATH
  ));
  assertAuthenticationFailure(() => decryptValue(
    replaceSegment(DETERMINISTIC_PAYLOAD, 8, changeEncodedByte(parts[8])),
    KEY,
    FIELD_PATH
  ));
  assertAuthenticationFailure(() => decryptValue(
    replaceSegment(DETERMINISTIC_PAYLOAD, 9, Buffer.from('other.path').toString('base64url')),
    KEY,
    FIELD_PATH
  ));
  assertAuthenticationFailure(() => decryptValue(
    replaceSegment(DETERMINISTIC_PAYLOAD, 10, changeEncodedByte(parts[10])),
    KEY,
    FIELD_PATH
  ));
  assertAuthenticationFailure(() => decryptValue(
    replaceSegment(DETERMINISTIC_PAYLOAD, 11, changeEncodedByte(parts[11])),
    KEY,
    FIELD_PATH
  ));
});

test('v2 supports authenticated empty strings', () => {
  const payload = encryptValue('', KEY, FIELD_PATH, { formatVersion: 2 });
  const parsed = parseV2Payload(payload);

  assert.equal(parsed.ciphertext.length, 0);
  assert.equal(decryptValue(payload, KEY, FIELD_PATH), '');
});

test('v2 parser rejects malformed and unsupported envelopes before decryption', () => {
  const parts = DETERMINISTIC_PAYLOAD.split('|');

  assert.throws(
    () => parseV2Payload(parts.slice(0, -1).join('|')),
    /expected 12 fields/i
  );
  assert.throws(
    () => parseV2Payload(replaceSegment(DETERMINISTIC_PAYLOAD, 2, 'aes-128-gcm')),
    /unsupported.*algorithm/i
  );
  assert.throws(
    () => parseV2Payload(replaceSegment(DETERMINISTIC_PAYLOAD, 4, '65536')),
    /unsupported.*KDF parameters/i
  );
  assert.throws(
    () => parseV2Payload(replaceSegment(DETERMINISTIC_PAYLOAD, 7, `${parts[7]}=`)),
    /unpadded base64url/i
  );
  assert.throws(
    () => parseV2Payload(replaceSegment(DETERMINISTIC_PAYLOAD, 8, 'AA')),
    /exactly 12 bytes/i
  );
  assert.throws(
    () => parseV2Payload(replaceSegment(DETERMINISTIC_PAYLOAD, 8, 'AB')),
    /canonical base64url/i
  );
  assert.throws(
    () => parseV2Payload(replaceSegment(DETERMINISTIC_PAYLOAD, 9, '_w')),
    /valid UTF-8/i
  );
  assert.throws(
    () => parseV2Payload(`yl|2|${'A'.repeat(V2_MAX_SERIALIZED_BYTES)}`),
    /payload exceeds/i
  );
  assert.throws(
    () => decryptValue('yl|3|unsupported', KEY, FIELD_PATH),
    /unsupported yamlock payload version: 3/i
  );
  assert.throws(
    () => encryptValue('value', KEY, FIELD_PATH, { formatVersion: 3 }),
    /unsupported yamlock payload version: 3/i
  );
});

test('v2 generates fresh KDF salts and nonces', () => {
  const first = parseV2Payload(encryptValue('same', KEY, FIELD_PATH, { formatVersion: 2 }));
  const second = parseV2Payload(encryptValue('same', KEY, FIELD_PATH, { formatVersion: 2 }));

  assert.notDeepEqual(first.kdfSalt, second.kdfSalt);
  assert.notDeepEqual(first.nonce, second.nonce);
  assert.notDeepEqual(first.ciphertext, second.ciphertext);
});

test('v2 rejects free-form cipher sizing overrides', () => {
  assert.throws(
    () => encryptValue('value', KEY, FIELD_PATH, {
      formatVersion: 2,
      algorithm: 'chacha20-poly1305'
    }),
    /only supports aes-256-gcm/i
  );
  assert.throws(
    () => encryptValue('value', KEY, FIELD_PATH, {
      formatVersion: 2,
      authTagLength: 12
    }),
    /does not support the authTagLength override/i
  );
  assert.throws(
    () => encryptValue('value', 123, FIELD_PATH, { formatVersion: 2 }),
    /key must be a string or Buffer/i
  );
  assert.throws(
    () => decryptValue(DETERMINISTIC_PAYLOAD, KEY, FIELD_PATH, 123),
    /options must be an object or algorithm string/i
  );
});

test('decryptValue keeps frozen legacy payloads readable', () => {
  Object.entries(LEGACY_PAYLOAD_FIXTURES).forEach(([algorithm, payload]) => {
    assert.equal(
      decryptValue(payload, KEY, FIELD_PATH),
      'legacy-fixture-value',
      algorithm
    );
  });
});

test('processConfig propagates formatVersion and decrypts mixed payloads', () => {
  const input = {
    db: { password: 'secret' },
    api: { token: 'token' }
  };
  const encrypted = processConfig(input, {
    mode: 'encrypt',
    key: KEY,
    formatVersion: 2
  });

  assert.match(encrypted.db.password, /^yl\|2\|/);
  assert.match(encrypted.api.token, /^yl\|2\|/);
  assert.deepEqual(processConfig(encrypted, { mode: 'decrypt', key: KEY }), input);

  const mixed = {
    services: {
      db: {
        password: LEGACY_PAYLOAD_FIXTURES['aes-256-cbc']
      }
    },
    modern: encryptValue('new-value', KEY, 'modern', { formatVersion: 2 })
  };
  assert.deepEqual(processConfig(mixed, { mode: 'decrypt', key: KEY }), {
    services: { db: { password: 'legacy-fixture-value' } },
    modern: 'new-value'
  });
});
