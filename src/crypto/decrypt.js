import { createDecipheriv } from 'node:crypto';

import {
  decodeFieldPathSalt,
  deriveKey,
  ensureAlgorithm,
  isYamlockPayload,
  parsePayload
} from './utils.js';

/**
 * Decrypts a yamlock payload for the provided field path.
 * @param {string} encryptedValue
 * @param {string|Buffer} key
 * @param {string} fieldPath
 * @returns {string}
 */
export function decryptValue(encryptedValue, key, fieldPath) {
  if (!isYamlockPayload(encryptedValue)) {
    throw new Error('decryptValue expects a yamlock-formatted payload.');
  }

  const payload = parsePayload(encryptedValue);
  const normalizedAlgorithm = ensureAlgorithm(payload.algorithm);
  const saltFieldPath = decodeFieldPathSalt(payload.salt);

  if (!fieldPath) {
    throw new Error('Field path is required to decrypt a value.');
  }

  if (saltFieldPath !== fieldPath) {
    throw new Error('Field path does not match the encrypted payload.');
  }

  const derivedKey = deriveKey(key, normalizedAlgorithm);
  const decipher = createDecipheriv(normalizedAlgorithm, derivedKey, payload.iv);
  const decrypted = Buffer.concat([decipher.update(payload.data), decipher.final()]);

  return decrypted.toString('utf8');
}
