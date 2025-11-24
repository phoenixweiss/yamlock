import { createCipheriv } from 'node:crypto';

import {
  deriveKey,
  encodeFieldPathSalt,
  ensureAlgorithm,
  formatPayload,
  generateIv
} from './utils.js';

const DEFAULT_ALGORITHM = 'aes-256-cbc';

/**
 * Encrypts a string value for a specific configuration field path.
 * @param {string} value
 * @param {string|Buffer} key
 * @param {string} fieldPath
 * @param {string} [algorithm=DEFAULT_ALGORITHM]
 * @returns {string}
 */
export function encryptValue(value, key, fieldPath, algorithm = DEFAULT_ALGORITHM) {
  if (typeof value !== 'string') {
    throw new Error('encryptValue expects the value to be a string.');
  }

  const normalizedAlgorithm = ensureAlgorithm(algorithm);
  const derivedKey = deriveKey(key, normalizedAlgorithm);
  const iv = generateIv(normalizedAlgorithm);
  const salt = encodeFieldPathSalt(fieldPath);

  const cipher = createCipheriv(normalizedAlgorithm, derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return formatPayload({
    algorithm: normalizedAlgorithm,
    salt,
    iv,
    data: encrypted
  });
}
