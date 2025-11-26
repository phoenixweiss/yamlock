import { createCipheriv } from 'node:crypto';

import {
  DEFAULT_ALGORITHM,
  deriveKey,
  encodeFieldPathSalt,
  formatPayload,
  generateIv,
  resolveAlgorithmOptions
} from './utils.js';

function resolveOptions(input) {
  if (typeof input === 'string' || input === undefined) {
    return resolveAlgorithmOptions({ algorithm: input ?? DEFAULT_ALGORITHM });
  }
  return resolveAlgorithmOptions(input);
}

/**
 * Encrypts a string value for a specific configuration field path.
 * @param {string} value
 * @param {string|Buffer} key
 * @param {string} fieldPath
 * @param {string|object} [algorithmOptions=DEFAULT_ALGORITHM]
 * @returns {string}
 */
export function encryptValue(value, key, fieldPath, algorithmOptions = DEFAULT_ALGORITHM) {
  if (typeof value !== 'string') {
    throw new Error('encryptValue expects the value to be a string.');
  }

  const resolvedOptions = resolveOptions(algorithmOptions);
  const derivedKey = deriveKey(key, resolvedOptions);
  const iv = generateIv(resolvedOptions);
  const salt = encodeFieldPathSalt(fieldPath);

  const cipherOptions = resolvedOptions.authTagLength ? { authTagLength: resolvedOptions.authTagLength } : undefined;
  const cipher = createCipheriv(resolvedOptions.algorithm, derivedKey, iv, cipherOptions);
  let encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  if (resolvedOptions.authTagLength) {
    if (typeof cipher.getAuthTag !== 'function') {
      throw new Error(`Algorithm ${resolvedOptions.algorithm} requires auth tags but getAuthTag is unavailable.`);
    }
    const authTag = cipher.getAuthTag();
    encrypted = Buffer.concat([encrypted, authTag]);
  }

  return formatPayload({
    algorithm: resolvedOptions.algorithm,
    salt,
    iv,
    data: encrypted
  });
}
