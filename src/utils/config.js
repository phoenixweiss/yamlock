import { encryptValue } from '../crypto/encrypt.js';
import { decryptValue } from '../crypto/decrypt.js';
import { detectPayloadVersion } from '../crypto/payload-v2.js';
import { isYamlockPayload } from '../crypto/utils.js';
import { buildPath } from './path.js';

const MODES = {
  ENCRYPT: 'encrypt',
  DECRYPT: 'decrypt'
};

const EXISTING_PAYLOAD_POLICIES = new Set(['preserve', 'error', 'encrypt']);

function createConfigError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Recursively processes a config object or array, encrypting/decrypting string values.
 * @param {Object|Array} node
 * @param {Object} options
 * @param {'encrypt'|'decrypt'} options.mode
 * @param {string|Buffer} options.key
 * @param {string|object} [options.algorithm]
 * @param {object} [options.algorithmOptions]
 * @param {1|2} [options.formatVersion]
 * @param {"ignore"|"stringify"|"error"} [options.nonStringPolicy]
 * @param {"preserve"|"error"|"encrypt"} [options.existingPayloadPolicy]
 * @param {(segments: Array<string|number>) => string} [options.pathSerializer]
 * @param {string[]} [options.paths]
 * @param {Array<string|number>} [options.parentPath]
 * @returns {Object|Array}
 */
export function processConfig(node, options) {
  if (typeof node !== 'object' || node === null) {
    throw new Error('processConfig expects a non-null object or array.');
  }

  const mode = options.mode;
  if (mode !== MODES.ENCRYPT && mode !== MODES.DECRYPT) {
    throw new Error(`Unknown processConfig mode: ${mode}`);
  }

  if (mode !== MODES.ENCRYPT && options.existingPayloadPolicy !== undefined) {
    throw createConfigError(
      'ERR_INVALID_EXISTING_PAYLOAD_POLICY',
      'existingPayloadPolicy is available only in encrypt mode.'
    );
  }

  const normalizedPaths = Array.isArray(options.paths) && options.paths.length > 0
    ? new Set(options.paths.map((path) => String(path).trim()).filter(Boolean))
    : null;
  const existingPayloadPolicy = options.existingPayloadPolicy ?? 'preserve';
  if (!EXISTING_PAYLOAD_POLICIES.has(existingPayloadPolicy)) {
    throw createConfigError(
      'ERR_INVALID_EXISTING_PAYLOAD_POLICY',
      `Unknown existingPayloadPolicy: ${existingPayloadPolicy}`
    );
  }

  return traverseConfig(node, {
    ...options,
    mode,
    parentPath: options.parentPath ?? [],
    normalizedPaths,
    nonStringPolicy: options.nonStringPolicy ?? 'ignore',
    existingPayloadPolicy,
    pathSerializer: options.pathSerializer
  });
}

function traverseConfig(node, { mode, key, algorithm, algorithmOptions, formatVersion, parentPath, normalizedPaths, nonStringPolicy, existingPayloadPolicy, pathSerializer }) {
  const isArrayNode = Array.isArray(node);
  const result = isArrayNode ? [] : {};
  const selectedCryptoOptions = algorithmOptions ?? algorithm;
  const cryptoOptions = formatVersion === undefined
    ? selectedCryptoOptions
    : typeof selectedCryptoOptions === 'object' && selectedCryptoOptions !== null
      ? { ...selectedCryptoOptions, formatVersion }
      : { algorithm: selectedCryptoOptions, formatVersion };

  Object.entries(node).forEach(([rawKey, value]) => {
    const segment = isArrayNode ? Number(rawKey) : rawKey;
    const targetKey = isArrayNode ? segment : rawKey;
    const currentPath = pathSerializer
      ? pathSerializer([...parentPath, segment])
      : buildPath(parentPath, segment);

    if (value !== null && typeof value === 'object') {
      result[targetKey] = traverseConfig(value, {
        mode,
        key,
        algorithm: cryptoOptions,
        algorithmOptions: cryptoOptions,
        parentPath: [...parentPath, segment],
        normalizedPaths,
        nonStringPolicy,
        existingPayloadPolicy,
        pathSerializer
      });
      return;
    }

    if (typeof value !== 'string') {
      if (nonStringPolicy === 'stringify') {
        value = JSON.stringify(value);
      } else if (nonStringPolicy === 'error') {
        throw new Error(`Non-string value encountered at ${currentPath}`);
      } else {
        result[targetKey] = value;
        return;
      }
    }

    const shouldProcess = !normalizedPaths || normalizedPaths.has(currentPath);
    if (!shouldProcess) {
      result[targetKey] = value;
      return;
    }

    if (mode === MODES.ENCRYPT) {
      if (isYamlockPayload(value)) {
        if (existingPayloadPolicy === 'encrypt') {
          result[targetKey] = encryptValue(value, key, currentPath, cryptoOptions);
          return;
        }

        const payloadVersion = detectPayloadVersion(value);
        decryptValue(
          value,
          key,
          currentPath,
          payloadVersion === 1 ? cryptoOptions : undefined
        );

        if (existingPayloadPolicy === 'error') {
          throw createConfigError(
            'ERR_ALREADY_ENCRYPTED',
            `Selected value at ${currentPath} is already encrypted.`
          );
        }

        result[targetKey] = value;
        return;
      }

      result[targetKey] = encryptValue(value, key, currentPath, cryptoOptions);
    } else {
      result[targetKey] = decryptValue(value, key, currentPath, cryptoOptions);
    }
  });

  return result;
}
