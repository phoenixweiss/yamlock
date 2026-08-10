import { createDecipheriv } from 'node:crypto';

import {
  YAMLOCK_ERROR_CODES,
  YamlockDecryptionError,
  YamlockPayloadError,
  YamlockValidationError
} from '../errors.js';
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
      throw new YamlockValidationError(
        `yamlock v2 only supports ${V2_ALGORITHM}.`,
        { code: YAMLOCK_ERROR_CODES.UNSUPPORTED_ALGORITHM }
      );
    }
    return;
  }

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new YamlockValidationError(
      'yamlock v2 options must be an object or algorithm string.',
      { code: YAMLOCK_ERROR_CODES.INVALID_OPTIONS }
    );
  }

  if (input.algorithm !== undefined && input.algorithm !== V2_ALGORITHM) {
    throw new YamlockValidationError(
      `yamlock v2 only supports ${V2_ALGORITHM}.`,
      { code: YAMLOCK_ERROR_CODES.UNSUPPORTED_ALGORITHM }
    );
  }

  if (
    input.formatVersion !== undefined &&
    input.formatVersion !== V2_FORMAT_VERSION
  ) {
    throw new YamlockValidationError(
      'Payload format version does not match yamlock v2.',
      { code: YAMLOCK_ERROR_CODES.UNSUPPORTED_PAYLOAD_VERSION }
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
    throw new YamlockPayloadError(
      'decryptValue expects a yamlock-formatted payload.',
      { code: YAMLOCK_ERROR_CODES.INVALID_PAYLOAD }
    );
  }

  const payloadVersion = detectPayloadVersion(encryptedValue);
  if (payloadVersion === V2_FORMAT_VERSION) {
    validateV2Options(algorithmOptions);
    return decryptValueV2(encryptedValue, key, fieldPath);
  }

  if (payloadVersion !== 1) {
    throw new YamlockPayloadError(
      `Unsupported yamlock payload version: ${payloadVersion}`,
      { code: YAMLOCK_ERROR_CODES.UNSUPPORTED_PAYLOAD_VERSION }
    );
  }

  const payload = parsePayload(encryptedValue);
  const resolvedOptions = resolveDecryptOptions(payload.algorithm, algorithmOptions);
  const saltFieldPath = decodeFieldPathSalt(payload.salt);

  if (!fieldPath) {
    throw new YamlockValidationError(
      'Field path is required to decrypt a value.',
      { code: YAMLOCK_ERROR_CODES.INVALID_FIELD_PATH }
    );
  }

  if (saltFieldPath !== fieldPath) {
    throw new YamlockDecryptionError(
      'Field path does not match the encrypted payload.',
      { code: YAMLOCK_ERROR_CODES.FIELD_PATH_MISMATCH }
    );
  }

  const derivedKey = deriveKey(key, resolvedOptions);
  let ciphertext = payload.data;
  let authTag;
  if (resolvedOptions.authTagLength) {
    if (ciphertext.length < resolvedOptions.authTagLength) {
      throw new YamlockPayloadError(
        'Encrypted payload is missing an authentication tag.',
        { code: YAMLOCK_ERROR_CODES.INVALID_PAYLOAD }
      );
    }
    authTag = ciphertext.subarray(ciphertext.length - resolvedOptions.authTagLength);
    ciphertext = ciphertext.subarray(0, ciphertext.length - resolvedOptions.authTagLength);
  }

  try {
    const decipherOptions = resolvedOptions.authTagLength ? { authTagLength: resolvedOptions.authTagLength } : undefined;
    const decipher = createDecipheriv(resolvedOptions.algorithm, derivedKey, payload.iv, decipherOptions);
    if (authTag) {
      if (typeof decipher.setAuthTag !== 'function') {
        throw new YamlockValidationError(
          `Algorithm ${resolvedOptions.algorithm} requires auth tags but setAuthTag is unavailable.`,
          { code: YAMLOCK_ERROR_CODES.UNSUPPORTED_ALGORITHM }
        );
      }
      decipher.setAuthTag(authTag);
    }

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (cause) {
    if (cause instanceof YamlockValidationError) {
      throw cause;
    }

    throw new YamlockDecryptionError('Legacy payload decryption failed.', {
      code: YAMLOCK_ERROR_CODES.DECRYPTION_FAILED,
      cause
    });
  }
}
