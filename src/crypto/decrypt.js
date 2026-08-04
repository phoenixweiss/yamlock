import { createDecipheriv } from 'node:crypto';

import {
  decodeFieldPathSalt,
  deriveKey,
  isYamlockPayload,
  parsePayload,
  resolveAlgorithmOptions
} from './utils.js';
import {
  decryptValueV2,
  detectPayloadVersion,
  V2_ALGORITHM,
  V2_FORMAT_VERSION
} from './payload-v2.js';

function validateV2Options(input) {
  if (input === undefined) {
    return;
  }

  if (typeof input === 'string') {
    if (input !== V2_ALGORITHM) {
      throw new Error(`yamlock v2 only supports ${V2_ALGORITHM}.`);
    }
    return;
  }

  if (typeof input !== 'object' || input === null) {
    throw new Error('yamlock v2 options must be an object or algorithm string.');
  }

  if (input.algorithm !== undefined && input.algorithm !== V2_ALGORITHM) {
    throw new Error(`yamlock v2 only supports ${V2_ALGORITHM}.`);
  }

  if (
    input.formatVersion !== undefined &&
    input.formatVersion !== V2_FORMAT_VERSION
  ) {
    throw new Error(`Payload format version does not match yamlock v2.`);
  }

  const unsupportedOverrides = ['keyLength', 'ivLength', 'authTagLength'];
  const override = unsupportedOverrides.find((name) => input[name] !== undefined);
  if (override) {
    throw new Error(`yamlock v2 does not support the ${override} override.`);
  }
}

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

  const payloadVersion = detectPayloadVersion(encryptedValue);
  if (payloadVersion === V2_FORMAT_VERSION) {
    validateV2Options(algorithmOptions);
    return decryptValueV2(encryptedValue, key, fieldPath);
  }

  if (payloadVersion !== 1) {
    throw new Error(`Unsupported yamlock payload version: ${payloadVersion}`);
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
