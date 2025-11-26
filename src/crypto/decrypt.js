import { createDecipheriv } from 'node:crypto';

import {
  decodeFieldPathSalt,
  deriveKey,
  isYamlockPayload,
  parsePayload,
  resolveAlgorithmOptions
} from './utils.js';

function resolveDecryptOptions(payloadAlgorithm, overrides) {
  if (typeof overrides === 'string' || overrides === undefined) {
    return resolveAlgorithmOptions({ algorithm: payloadAlgorithm });
  }

  return resolveAlgorithmOptions({
    ...overrides,
    algorithm: payloadAlgorithm
  });
}

/**
 * Decrypts a yamlock payload for the provided field path.
 * @param {string} encryptedValue
 * @param {string|Buffer} key
 * @param {string} fieldPath
 * @param {string|object} [algorithmOptions]
 * @returns {string}
 */
export function decryptValue(encryptedValue, key, fieldPath, algorithmOptions) {
  if (!isYamlockPayload(encryptedValue)) {
    throw new Error('decryptValue expects a yamlock-formatted payload.');
  }

  const payload = parsePayload(encryptedValue);
  const resolvedOptions = resolveDecryptOptions(payload.algorithm, algorithmOptions);
  const saltFieldPath = decodeFieldPathSalt(payload.salt);

  if (!fieldPath) {
    throw new Error('Field path is required to decrypt a value.');
  }

  if (saltFieldPath !== fieldPath) {
    throw new Error('Field path does not match the encrypted payload.');
  }

  const derivedKey = deriveKey(key, resolvedOptions);
  let ciphertext = payload.data;
  let authTag;
  if (resolvedOptions.authTagLength) {
    if (ciphertext.length < resolvedOptions.authTagLength) {
      throw new Error('Encrypted payload is missing an authentication tag.');
    }
    authTag = ciphertext.subarray(ciphertext.length - resolvedOptions.authTagLength);
    ciphertext = ciphertext.subarray(0, ciphertext.length - resolvedOptions.authTagLength);
  }

  const decipherOptions = resolvedOptions.authTagLength ? { authTagLength: resolvedOptions.authTagLength } : undefined;
  const decipher = createDecipheriv(resolvedOptions.algorithm, derivedKey, payload.iv, decipherOptions);
  if (authTag) {
    if (typeof decipher.setAuthTag !== 'function') {
      throw new Error(`Algorithm ${resolvedOptions.algorithm} requires auth tags but setAuthTag is unavailable.`);
    }
    decipher.setAuthTag(authTag);
  }

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString('utf8');
}
