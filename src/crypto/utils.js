import { createHash, getCipherInfo, getCiphers, randomBytes } from 'node:crypto';

export const YAMLOCK_PREFIX = 'yl';
export const YAMLOCK_DELIMITER = '|';

/**
 * Returns the sorted list of cipher algorithms supported by the current runtime.
 * @returns {string[]}
 */
export function listSupportedAlgorithms() {
  return [...new Set(getCiphers())].sort();
}

/**
 * Ensures the provided algorithm is available in the current runtime.
 * @param {string} algorithm
 * @returns {string}
 */
export function ensureAlgorithm(algorithm) {
  if (!algorithm) {
    throw new Error('Encryption algorithm is required.');
  }

  if (!listSupportedAlgorithms().includes(algorithm)) {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  return algorithm;
}

/**
 * Derives a key buffer with the exact size required by the cipher.
 * @param {string|Buffer} secret
 * @param {string} algorithm
 * @returns {Buffer}
 */
export function deriveKey(secret, algorithm) {
  const normalizedAlgorithm = ensureAlgorithm(algorithm);
  if (secret === undefined || secret === null || secret === '') {
    throw new Error('Encryption key is required to derive a cipher key.');
  }

  const baseBuffer = Buffer.isBuffer(secret)
    ? secret
    : Buffer.from(String(secret), 'utf8');

  const keyLength = getCipherInfo(normalizedAlgorithm)?.keyLength ?? 32;
  if (baseBuffer.length === keyLength) {
    return baseBuffer;
  }

  const hash = createHash('sha512').update(baseBuffer).digest();
  if (hash.length >= keyLength) {
    return hash.subarray(0, keyLength);
  }

  const result = Buffer.allocUnsafe(keyLength);
  let offset = 0;
  let material = hash;
  while (offset < keyLength) {
    const chunk = material.subarray(0, Math.min(material.length, keyLength - offset));
    chunk.copy(result, offset);
    offset += chunk.length;
    material = createHash('sha512').update(material).digest();
  }

  return result;
}

/**
 * Generates an IV buffer for the given algorithm (defaults to 16 bytes).
 * @param {string} algorithm
 * @returns {Buffer}
 */
export function generateIv(algorithm) {
  const normalizedAlgorithm = ensureAlgorithm(algorithm);
  const ivLength = getCipherInfo(normalizedAlgorithm)?.ivLength ?? 16;
  if (ivLength === 0) {
    return Buffer.alloc(0);
  }

  return randomBytes(ivLength);
}

/**
 * Creates a deterministic salt (Base64 field path) used when encrypting.
 * @param {string} fieldPath
 * @returns {string}
 */
export function encodeFieldPathSalt(fieldPath) {
  if (!fieldPath) {
    throw new Error('Field path is required to create a salt.');
  }

  return Buffer.from(String(fieldPath), 'utf8').toString('base64');
}

/**
 * Decodes a Base64 salt string back to the original field path.
 * @param {string} salt
 * @returns {string}
 */
export function decodeFieldPathSalt(salt) {
  if (!salt) {
    throw new Error('Salt value is required.');
  }

  return Buffer.from(String(salt), 'base64').toString('utf8');
}

/**
 * Formats the encrypted payload into the canonical yamlock string.
 * @param {Object} payload
 * @param {string} payload.algorithm
 * @param {string} payload.salt
 * @param {Buffer} payload.iv
 * @param {Buffer} payload.data
 * @returns {string}
 */
export function formatPayload({ algorithm, salt, iv, data }) {
  if (!algorithm || !salt || !iv || !data) {
    throw new Error('Algorithm, salt, IV, and data are required to format payload.');
  }

  return [
    YAMLOCK_PREFIX,
    algorithm,
    salt,
    iv.toString('base64'),
    data.toString('base64')
  ].join(YAMLOCK_DELIMITER);
}

/**
 * Checks whether a string looks like a yamlock payload.
 * @param {unknown} candidate
 * @returns {boolean}
 */
export function isYamlockPayload(candidate) {
  return (
    typeof candidate === 'string' &&
    candidate.startsWith(`${YAMLOCK_PREFIX}${YAMLOCK_DELIMITER}`)
  );
}

/**
 * Parses a yamlock payload and returns its structured pieces.
 * @param {string} value
 * @returns {{ algorithm: string, salt: string, iv: Buffer, data: Buffer }}
 */
export function parsePayload(value) {
  if (!isYamlockPayload(value)) {
    throw new Error('Value is not a yamlock payload.');
  }

  const parts = value.split(YAMLOCK_DELIMITER);
  if (parts.length !== 5) {
    throw new Error('Malformed yamlock payload.');
  }

  const [, algorithm, salt, ivBase64, dataBase64] = parts;
  if (!algorithm || !salt || !ivBase64 || !dataBase64) {
    throw new Error('Malformed yamlock payload segments.');
  }

  return {
    algorithm,
    salt,
    iv: Buffer.from(ivBase64, 'base64'),
    data: Buffer.from(dataBase64, 'base64')
  };
}
