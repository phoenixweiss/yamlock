import { createCipheriv } from 'node:crypto';

import {
  YAMLOCK_ERROR_CODES,
  YamlockValidationError
} from '../errors.js';
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
  if (input === undefined) {
    return true;
  }

  if (typeof input !== 'object' || input === null) {
    return false;
  }

  if (input.formatVersion !== undefined) {
    return input.formatVersion === V2_FORMAT_VERSION;
  }

  return !['algorithm', 'keyLength', 'ivLength', 'authTagLength']
    .some((name) => input[name] !== undefined);
}

function validateV2Options(input) {
  if (input === undefined) {
    return;
  }

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new YamlockValidationError(
      'yamlock v2 options must be an object.',
      { code: YAMLOCK_ERROR_CODES.INVALID_OPTIONS }
    );
  }

  if (input.algorithm !== undefined && input.algorithm !== V2_ALGORITHM) {
    throw new YamlockValidationError(
      `yamlock v2 only supports ${V2_ALGORITHM}.`,
      { code: YAMLOCK_ERROR_CODES.UNSUPPORTED_ALGORITHM }
    );
  }

  const unsupportedOverrides = ['keyLength', 'ivLength', 'authTagLength'];
  const override = unsupportedOverrides.find((name) => input[name] !== undefined);
  if (override) {
    throw new YamlockValidationError(
      `yamlock v2 does not support the ${override} override.`,
      { code: YAMLOCK_ERROR_CODES.INVALID_OPTIONS }
    );
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
 * @param {string|object} [algorithmOptions]
 * @returns {string}
 */
export function encryptValue(value, key, fieldPath, algorithmOptions) {
  if (typeof value !== 'string') {
    throw new YamlockValidationError(
      'encryptValue expects the value to be a string.',
      { code: YAMLOCK_ERROR_CODES.INVALID_VALUE }
    );
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
    throw new YamlockValidationError(
      `Unsupported yamlock payload version: ${algorithmOptions.formatVersion}`,
      { code: YAMLOCK_ERROR_CODES.UNSUPPORTED_PAYLOAD_VERSION }
    );
  }

  const resolvedOptions = resolveOptions(algorithmOptions);
  const derivedKey = deriveKey(key, resolvedOptions);
  const iv = generateIv(resolvedOptions);
  const salt = encodeFieldPathSalt(fieldPath);

  try {
    const cipherOptions = resolvedOptions.authTagLength ? { authTagLength: resolvedOptions.authTagLength } : undefined;
    const cipher = createCipheriv(resolvedOptions.algorithm, derivedKey, iv, cipherOptions);
    let encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    if (resolvedOptions.authTagLength) {
      if (typeof cipher.getAuthTag !== 'function') {
        throw new YamlockValidationError(
          `Algorithm ${resolvedOptions.algorithm} requires auth tags but getAuthTag is unavailable.`,
          { code: YAMLOCK_ERROR_CODES.UNSUPPORTED_ALGORITHM }
        );
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
  } catch (cause) {
    if (cause instanceof YamlockValidationError) {
      throw cause;
    }

    throw new YamlockValidationError('Legacy encryption options are invalid.', {
      code: YAMLOCK_ERROR_CODES.INVALID_OPTIONS,
      cause
    });
  }
}
