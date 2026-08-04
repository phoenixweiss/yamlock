import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync
} from 'node:crypto';
import { TextDecoder } from 'node:util';

export const V2_FORMAT_VERSION = 2;
export const V2_ALGORITHM = 'aes-256-gcm';
export const V2_KDF = 'scrypt';
export const V2_KDF_PARAMS = Object.freeze({ N: 32768, r: 8, p: 1 });
export const V2_KEY_LENGTH = 32;
export const V2_KDF_SALT_LENGTH = 16;
export const V2_NONCE_LENGTH = 12;
export const V2_AUTH_TAG_LENGTH = 16;
export const V2_SCRYPT_MAXMEM = 128 * 1024 * 1024;
export const V2_MAX_SERIALIZED_BYTES = 16 * 1024 * 1024;
export const V2_MAX_CIPHERTEXT_BYTES = 8 * 1024 * 1024;
export const V2_MAX_FIELD_PATH_BYTES = 4 * 1024;

const V2_FIELD_COUNT = 12;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;
const CANONICAL_VERSION_PATTERN = /^(0|[1-9][0-9]*)$/;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function createAuthenticationError() {
  const error = new Error('Payload authentication failed.');
  error.code = 'ERR_AUTHENTICATION_FAILED';
  return error;
}

function normalizeSecret(secret) {
  if (Buffer.isBuffer(secret)) {
    if (secret.length === 0) {
      throw new Error('Encryption key must not be empty.');
    }
    return Buffer.from(secret);
  }

  if (typeof secret === 'string') {
    if (secret.length === 0) {
      throw new Error('Encryption key must not be empty.');
    }
    return Buffer.from(secret, 'utf8');
  }

  throw new Error('Encryption key must be a string or Buffer.');
}

function encodeFieldPath(fieldPath) {
  if (typeof fieldPath !== 'string' || fieldPath.length === 0) {
    throw new Error('Field path must be a non-empty string.');
  }

  const bytes = Buffer.from(fieldPath, 'utf8');
  if (bytes.length > V2_MAX_FIELD_PATH_BYTES) {
    throw new Error(`Field path exceeds ${V2_MAX_FIELD_PATH_BYTES} bytes.`);
  }

  if (UTF8_DECODER.decode(bytes) !== fieldPath) {
    throw new Error('Field path must contain valid UTF-8 text.');
  }

  return bytes.toString('base64url');
}

function decodeBase64Url(segment, name, { allowEmpty = false, exactLength, maxLength } = {}) {
  if (typeof segment !== 'string' || (!allowEmpty && segment.length === 0)) {
    throw new Error(`${name} must not be empty.`);
  }

  if (!BASE64URL_PATTERN.test(segment)) {
    throw new Error(`${name} must use unpadded base64url encoding.`);
  }

  const decoded = Buffer.from(segment, 'base64url');
  if (decoded.toString('base64url') !== segment) {
    throw new Error(`${name} must use canonical base64url encoding.`);
  }

  if (exactLength !== undefined && decoded.length !== exactLength) {
    throw new Error(`${name} must decode to exactly ${exactLength} bytes.`);
  }

  if (maxLength !== undefined && decoded.length > maxLength) {
    throw new Error(`${name} exceeds ${maxLength} bytes.`);
  }

  return decoded;
}

function decodeFieldPath(segment) {
  const bytes = decodeBase64Url(segment, 'Field path', {
    maxLength: V2_MAX_FIELD_PATH_BYTES
  });

  let fieldPath;
  try {
    fieldPath = UTF8_DECODER.decode(bytes);
  } catch {
    throw new Error('Field path must contain valid UTF-8 text.');
  }

  if (fieldPath.length === 0) {
    throw new Error('Field path must not be empty.');
  }

  return fieldPath;
}

function validateMaterial(value, name, expectedLength) {
  if (!Buffer.isBuffer(value) || value.length !== expectedLength) {
    throw new Error(`${name} must be a ${expectedLength}-byte Buffer.`);
  }
  return Buffer.from(value);
}

function deriveV2Key(secret, kdfSalt) {
  const secretBytes = normalizeSecret(secret);
  try {
    return scryptSync(secretBytes, kdfSalt, V2_KEY_LENGTH, {
      ...V2_KDF_PARAMS,
      maxmem: V2_SCRYPT_MAXMEM
    });
  } finally {
    secretBytes.fill(0);
  }
}

function buildHeader({ kdfSalt, nonce, encodedFieldPath }) {
  return [
    'yl',
    String(V2_FORMAT_VERSION),
    V2_ALGORITHM,
    V2_KDF,
    String(V2_KDF_PARAMS.N),
    String(V2_KDF_PARAMS.r),
    String(V2_KDF_PARAMS.p),
    kdfSalt.toString('base64url'),
    nonce.toString('base64url'),
    encodedFieldPath
  ];
}

export function detectPayloadVersion(value) {
  if (typeof value !== 'string' || !value.startsWith('yl|')) {
    return null;
  }

  const nextDelimiter = value.indexOf('|', 3);
  const secondSegment = nextDelimiter === -1
    ? value.slice(3)
    : value.slice(3, nextDelimiter);

  if (CANONICAL_VERSION_PATTERN.test(secondSegment)) {
    return Number(secondSegment);
  }

  return 1;
}

export function isV2Payload(value) {
  return detectPayloadVersion(value) === V2_FORMAT_VERSION;
}

export function parseV2Payload(value) {
  if (typeof value !== 'string' || !value.startsWith('yl|2|')) {
    throw new Error('Value is not a yamlock v2 payload.');
  }

  if (Buffer.byteLength(value, 'utf8') > V2_MAX_SERIALIZED_BYTES) {
    throw new Error(`Payload exceeds ${V2_MAX_SERIALIZED_BYTES} bytes.`);
  }

  const parts = value.split('|');
  if (parts.length !== V2_FIELD_COUNT) {
    throw new Error(`Malformed yamlock v2 payload: expected ${V2_FIELD_COUNT} fields.`);
  }

  const [
    marker,
    version,
    algorithm,
    kdf,
    cost,
    blockSize,
    parallelization,
    saltSegment,
    nonceSegment,
    pathSegment,
    ciphertextSegment,
    tagSegment
  ] = parts;

  if (marker !== 'yl' || version !== String(V2_FORMAT_VERSION)) {
    throw new Error('Unsupported yamlock payload version.');
  }

  if (algorithm !== V2_ALGORITHM) {
    throw new Error(`Unsupported yamlock v2 algorithm: ${algorithm}`);
  }

  if (kdf !== V2_KDF) {
    throw new Error(`Unsupported yamlock v2 KDF: ${kdf}`);
  }

  if (
    cost !== String(V2_KDF_PARAMS.N) ||
    blockSize !== String(V2_KDF_PARAMS.r) ||
    parallelization !== String(V2_KDF_PARAMS.p)
  ) {
    throw new Error('Unsupported yamlock v2 KDF parameters.');
  }

  const kdfSalt = decodeBase64Url(saltSegment, 'KDF salt', {
    exactLength: V2_KDF_SALT_LENGTH
  });
  const nonce = decodeBase64Url(nonceSegment, 'Nonce', {
    exactLength: V2_NONCE_LENGTH
  });
  const storedFieldPath = decodeFieldPath(pathSegment);
  const ciphertext = decodeBase64Url(ciphertextSegment, 'Ciphertext', {
    allowEmpty: true,
    maxLength: V2_MAX_CIPHERTEXT_BYTES
  });
  const authTag = decodeBase64Url(tagSegment, 'Authentication tag', {
    exactLength: V2_AUTH_TAG_LENGTH
  });

  return {
    version: V2_FORMAT_VERSION,
    algorithm,
    kdf,
    kdfParams: { ...V2_KDF_PARAMS },
    kdfSalt,
    nonce,
    storedFieldPath,
    encodedFieldPath: pathSegment,
    ciphertext,
    authTag,
    headerSegments: parts.slice(0, 10)
  };
}

export function encryptValueV2(value, secret, fieldPath, testMaterial = {}) {
  if (typeof value !== 'string') {
    throw new Error('encryptValue expects the value to be a string.');
  }

  const plaintext = Buffer.from(value, 'utf8');
  if (plaintext.length > V2_MAX_CIPHERTEXT_BYTES) {
    throw new Error(`Plaintext exceeds ${V2_MAX_CIPHERTEXT_BYTES} bytes.`);
  }

  const encodedFieldPath = encodeFieldPath(fieldPath);
  const kdfSalt = testMaterial.kdfSalt === undefined
    ? randomBytes(V2_KDF_SALT_LENGTH)
    : validateMaterial(testMaterial.kdfSalt, 'KDF salt', V2_KDF_SALT_LENGTH);
  const nonce = testMaterial.nonce === undefined
    ? randomBytes(V2_NONCE_LENGTH)
    : validateMaterial(testMaterial.nonce, 'Nonce', V2_NONCE_LENGTH);
  const key = deriveV2Key(secret, kdfSalt);
  const headerSegments = buildHeader({ kdfSalt, nonce, encodedFieldPath });
  const aad = Buffer.from(headerSegments.join('|'), 'utf8');

  try {
    const cipher = createCipheriv(V2_ALGORITHM, key, nonce, {
      authTagLength: V2_AUTH_TAG_LENGTH
    });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      ...headerSegments,
      ciphertext.toString('base64url'),
      authTag.toString('base64url')
    ].join('|');
  } finally {
    key.fill(0);
  }
}

export function decryptValueV2(encryptedValue, secret, fieldPath) {
  const payload = parseV2Payload(encryptedValue);
  const callerPathSegment = encodeFieldPath(fieldPath);
  const key = deriveV2Key(secret, payload.kdfSalt);

  try {
    const decipher = createDecipheriv(V2_ALGORITHM, key, payload.nonce, {
      authTagLength: V2_AUTH_TAG_LENGTH
    });
    decipher.setAAD(Buffer.from(payload.headerSegments.join('|'), 'utf8'));
    decipher.setAuthTag(payload.authTag);
    const plaintext = Buffer.concat([
      decipher.update(payload.ciphertext),
      decipher.final()
    ]);

    if (payload.encodedFieldPath !== callerPathSegment) {
      throw createAuthenticationError();
    }

    return plaintext.toString('utf8');
  } catch {
    throw createAuthenticationError();
  } finally {
    key.fill(0);
  }
}
