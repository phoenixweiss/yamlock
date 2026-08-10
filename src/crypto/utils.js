import { createHash, getCipherInfo, getCiphers, randomBytes } from 'node:crypto';

import {
  YAMLOCK_ERROR_CODES,
  YamlockPayloadError,
  YamlockValidationError
} from '../errors.js';

export const YAMLOCK_PREFIX = 'yl';
export const YAMLOCK_DELIMITER = '|';
export const DEFAULT_ALGORITHM = 'aes-256-cbc';
export const ALGORITHM_PRESETS = {
  'aes-256-cbc': { keyLength: 32, ivLength: 16, authTagLength: 0 },
  'aes-192-cbc': { keyLength: 24, ivLength: 16, authTagLength: 0 },
  'aes-128-cbc': { keyLength: 16, ivLength: 16, authTagLength: 0 },
  'chacha20-poly1305': { keyLength: 32, ivLength: 12, authTagLength: 16 }
};
export const TESTED_ALGORITHMS = Object.keys(ALGORITHM_PRESETS);

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
    throw new YamlockValidationError('Encryption algorithm is required.', {
      code: YAMLOCK_ERROR_CODES.UNSUPPORTED_ALGORITHM
    });
  }

  if (!listSupportedAlgorithms().includes(algorithm)) {
    throw new YamlockValidationError(`Unsupported algorithm: ${algorithm}`, {
      code: YAMLOCK_ERROR_CODES.UNSUPPORTED_ALGORITHM
    });
  }

  return algorithm;
}

function normalizeAlgorithmInput(input) {
  if (input === undefined || typeof input === 'string') {
    return { algorithm: input };
  }

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new YamlockValidationError(
      'Algorithm options must be an object or algorithm string.',
      { code: YAMLOCK_ERROR_CODES.INVALID_OPTIONS }
    );
  }

  return input;
}

/**
 * Resolves algorithm settings with optional key/IV overrides.
 * @param {object|string} [input]
 * @param {string} [input.algorithm]
 * @param {number} [input.keyLength]
 * @param {number} [input.ivLength]
 * @returns {{ algorithm: string, keyLength: number, ivLength: number, authTagLength: number }}
 */
export function resolveAlgorithmOptions(input) {
  const normalized = normalizeAlgorithmInput(input);
  const algorithmName = ensureAlgorithm(normalized.algorithm ?? DEFAULT_ALGORITHM);
  const preset = ALGORITHM_PRESETS[algorithmName] ?? {};
  const cipherInfo = getCipherInfo(algorithmName) ?? {};

  const keyLength = normalized.keyLength ?? preset.keyLength ?? cipherInfo.keyLength ?? 32;
  const ivLength = normalized.ivLength ?? preset.ivLength ?? cipherInfo.ivLength ?? 16;
  const authTagLength = normalized.authTagLength ?? preset.authTagLength ?? 0;

  for (const [name, value, minimum] of [
    ['keyLength', keyLength, 1],
    ['ivLength', ivLength, 0],
    ['authTagLength', authTagLength, 0]
  ]) {
    if (!Number.isInteger(value) || value < minimum) {
      throw new YamlockValidationError(
        `${name} must be an integer greater than or equal to ${minimum}.`,
        { code: YAMLOCK_ERROR_CODES.INVALID_OPTIONS }
      );
    }
  }

  return {
    algorithm: algorithmName,
    keyLength,
    ivLength,
    authTagLength
  };
}

/**
 * Derives a key buffer with the exact size required by the cipher.
 * @param {string|Buffer} secret
 * @param {{ algorithm: string, keyLength: number }} options
 * @returns {Buffer}
 */
export function deriveKey(secret, { algorithm, keyLength }) {
  if (
    (!Buffer.isBuffer(secret) && typeof secret !== 'string') ||
    secret.length === 0
  ) {
    throw new YamlockValidationError(
      'Encryption key must be a non-empty string or Buffer.',
      { code: YAMLOCK_ERROR_CODES.INVALID_KEY }
    );
  }

  const baseBuffer = Buffer.isBuffer(secret)
    ? secret
    : Buffer.from(secret, 'utf8');

  const normalizedAlgorithm = ensureAlgorithm(algorithm);
  const requiredLength = keyLength ?? getCipherInfo(normalizedAlgorithm)?.keyLength ?? 32;
  if (baseBuffer.length === requiredLength) {
    return baseBuffer;
  }

  const hash = createHash('sha512').update(baseBuffer).digest();
  if (hash.length >= requiredLength) {
    return hash.subarray(0, requiredLength);
  }

  const result = Buffer.allocUnsafe(requiredLength);
  let offset = 0;
  let material = hash;
  while (offset < requiredLength) {
    const chunk = material.subarray(0, Math.min(material.length, requiredLength - offset));
    chunk.copy(result, offset);
    offset += chunk.length;
    material = createHash('sha512').update(material).digest();
  }

  return result;
}

/**
 * Generates an IV buffer for the given algorithm configuration.
 * @param {{ algorithm: string, ivLength: number }} options
 * @returns {Buffer}
 */
export function generateIv({ algorithm, ivLength }) {
  const normalizedAlgorithm = ensureAlgorithm(algorithm);
  const length = ivLength ?? getCipherInfo(normalizedAlgorithm)?.ivLength ?? 16;
  if (length === 0) {
    return Buffer.alloc(0);
  }

  return randomBytes(length);
}

/**
 * Creates a deterministic salt (Base64 field path) used when encrypting.
 * @param {string} fieldPath
 * @returns {string}
 */
export function encodeFieldPathSalt(fieldPath) {
  if (typeof fieldPath !== 'string' || fieldPath.length === 0) {
    throw new YamlockValidationError(
      'Field path must be a non-empty string.',
      { code: YAMLOCK_ERROR_CODES.INVALID_FIELD_PATH }
    );
  }

  return Buffer.from(fieldPath, 'utf8').toString('base64');
}

/**
 * Decodes a Base64 salt string back to the original field path.
 * @param {string} salt
 * @returns {string}
 */
export function decodeFieldPathSalt(salt) {
  if (!salt) {
    throw new YamlockPayloadError('Salt value is required.', {
      code: YAMLOCK_ERROR_CODES.INVALID_PAYLOAD
    });
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
    throw new YamlockValidationError(
      'Algorithm, salt, IV, and data are required to format payload.',
      { code: YAMLOCK_ERROR_CODES.INVALID_OPTIONS }
    );
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
    throw new YamlockPayloadError('Value is not a yamlock payload.', {
      code: YAMLOCK_ERROR_CODES.INVALID_PAYLOAD
    });
  }

  const parts = value.split(YAMLOCK_DELIMITER);
  if (parts.length !== 5) {
    throw new YamlockPayloadError('Malformed yamlock payload.', {
      code: YAMLOCK_ERROR_CODES.INVALID_PAYLOAD
    });
  }

  const [, algorithm, salt, ivBase64, dataBase64] = parts;
  if (!algorithm || !salt || !ivBase64 || !dataBase64) {
    throw new YamlockPayloadError('Malformed yamlock payload segments.', {
      code: YAMLOCK_ERROR_CODES.INVALID_PAYLOAD
    });
  }

  return {
    algorithm,
    salt,
    iv: Buffer.from(ivBase64, 'base64'),
    data: Buffer.from(dataBase64, 'base64')
  };
}
