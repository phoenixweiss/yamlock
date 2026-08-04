import { createCipheriv } from 'node:crypto';

import {
  DEFAULT_ALGORITHM,
  deriveKey,
  encodeFieldPathSalt,
  formatPayload,
  generateIv,
  resolveAlgorithmOptions
} from './utils.js';
import {
  encryptValueV2,
  V2_ALGORITHM,
  V2_FORMAT_VERSION
} from './payload-v2.js';

function isV2Request(input) {
  return typeof input === 'object' && input !== null && input.formatVersion === V2_FORMAT_VERSION;
}

function validateV2Options(input) {
  if (input.algorithm !== undefined && input.algorithm !== V2_ALGORITHM) {
    throw new Error(`yamlock v2 only supports ${V2_ALGORITHM}.`);
  }

  const unsupportedOverrides = ['keyLength', 'ivLength', 'authTagLength'];
  const override = unsupportedOverrides.find((name) => input[name] !== undefined);
  if (override) {
    throw new Error(`yamlock v2 does not support the ${override} override.`);
  }
}

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

  if (isV2Request(algorithmOptions)) {
    validateV2Options(algorithmOptions);
    return encryptValueV2(value, key, fieldPath);
  }

  if (
    typeof algorithmOptions === 'object' &&
    algorithmOptions !== null &&
    algorithmOptions.formatVersion !== undefined &&
    algorithmOptions.formatVersion !== 1
  ) {
    throw new Error(`Unsupported yamlock payload version: ${algorithmOptions.formatVersion}`);
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
