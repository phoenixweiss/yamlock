import { encryptValue } from '../crypto/encrypt.js';
import { decryptValue } from '../crypto/decrypt.js';
import { detectPayloadVersion } from '../crypto/payload-v2.js';
import { isYamlockPayload } from '../crypto/utils.js';
import { serializeLegacyPath, serializePath } from './path.js';

const MODES = {
  ENCRYPT: 'encrypt',
  DECRYPT: 'decrypt'
};

const NON_STRING_POLICIES = new Set(['ignore', 'stringify', 'error']);
const EXISTING_PAYLOAD_POLICIES = new Set(['preserve', 'error', 'encrypt']);

function createConfigError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isConfigContainer(value) {
  if (Array.isArray(value)) {
    return true;
  }

  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function createResultContainer(node) {
  return Array.isArray(node)
    ? new Array(node.length)
    : Object.create(Object.getPrototypeOf(node));
}

function setResultValue(result, key, value) {
  Object.defineProperty(result, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

function validatePathSegments(segments, optionName) {
  if (!Array.isArray(segments)) {
    throw createConfigError(
      'ERR_INVALID_PATH_SEGMENTS',
      `${optionName} must be an array of non-empty strings or non-negative integers.`
    );
  }

  const hasInvalidSegment = segments.some((segment) => (
    (typeof segment !== 'string' || segment.length === 0) &&
    (!Number.isInteger(segment) || segment < 0)
  ));
  if (hasInvalidSegment) {
    throw createConfigError(
      'ERR_INVALID_PATH_SEGMENTS',
      `${optionName} must contain only non-empty strings or non-negative integers.`
    );
  }
}

function normalizePaths(paths) {
  if (paths === undefined || (Array.isArray(paths) && paths.length === 0)) {
    return null;
  }

  if (!Array.isArray(paths)) {
    throw createConfigError('ERR_INVALID_PATHS', 'paths must be an array of non-empty strings.');
  }

  const normalized = paths.map((path) => {
    if (typeof path !== 'string' || path.trim().length === 0) {
      throw createConfigError('ERR_INVALID_PATHS', 'paths must contain only non-empty strings.');
    }
    return path.trim();
  });
  return new Set(normalized);
}

function resolveCurrentPaths(segments, pathSerializer) {
  let currentPath;
  try {
    currentPath = pathSerializer
      ? pathSerializer([...segments])
      : serializePath(segments);
  } catch (error) {
    throw createConfigError(
      pathSerializer ? 'ERR_INVALID_PATH_SERIALIZER' : 'ERR_INVALID_PATH_SEGMENTS',
      `Failed to serialize config path: ${error.message}`
    );
  }

  if (typeof currentPath !== 'string' || currentPath.length === 0) {
    throw createConfigError(
      'ERR_INVALID_PATH_SERIALIZER',
      'pathSerializer must return a non-empty string.'
    );
  }

  return {
    currentPath,
    legacyPath: pathSerializer ? null : serializeLegacyPath(segments)
  };
}

function decryptConfigValue(value, key, currentPath, legacyPath, cryptoOptions) {
  try {
    return decryptValue(value, key, currentPath, cryptoOptions);
  } catch (error) {
    if (!legacyPath || legacyPath === currentPath) {
      throw error;
    }

    return decryptValue(value, key, legacyPath, cryptoOptions);
  }
}

function stringifyConfigLeaf(value, currentPath) {
  const isJsonPrimitive = (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
  if (!isJsonPrimitive) {
    throw createConfigError(
      'ERR_UNSUPPORTED_CONFIG_VALUE',
      `Value at ${currentPath} cannot be stringified without an explicit conversion.`
    );
  }

  return JSON.stringify(value);
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
  if (!isConfigContainer(node)) {
    throw createConfigError(
      'ERR_INVALID_CONFIG_ROOT',
      'processConfig expects an array or plain object.'
    );
  }

  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw createConfigError('ERR_INVALID_CONFIG_OPTIONS', 'processConfig options must be an object.');
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

  const nonStringPolicy = options.nonStringPolicy ?? 'ignore';
  if (!NON_STRING_POLICIES.has(nonStringPolicy)) {
    throw createConfigError(
      'ERR_INVALID_NON_STRING_POLICY',
      `Unknown nonStringPolicy: ${nonStringPolicy}`
    );
  }

  if (options.pathSerializer !== undefined && typeof options.pathSerializer !== 'function') {
    throw createConfigError(
      'ERR_INVALID_PATH_SERIALIZER',
      'pathSerializer must be a function.'
    );
  }

  const parentPath = options.parentPath ?? [];
  validatePathSegments(parentPath, 'parentPath');
  const normalizedPaths = normalizePaths(options.paths);
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
    parentPath,
    normalizedPaths,
    nonStringPolicy,
    existingPayloadPolicy,
    pathSerializer: options.pathSerializer,
    ancestors: new WeakSet(),
    seenPaths: new Set()
  });
}

function traverseConfig(node, { mode, key, algorithm, algorithmOptions, formatVersion, parentPath, normalizedPaths, nonStringPolicy, existingPayloadPolicy, pathSerializer, ancestors, seenPaths }) {
  const isArrayNode = Array.isArray(node);
  const result = createResultContainer(node);
  const selectedCryptoOptions = algorithmOptions ?? algorithm;
  const cryptoOptions = formatVersion === undefined
    ? selectedCryptoOptions
    : typeof selectedCryptoOptions === 'object' && selectedCryptoOptions !== null
      ? { ...selectedCryptoOptions, formatVersion }
      : { algorithm: selectedCryptoOptions, formatVersion };

  ancestors.add(node);
  try {
    for (const [rawKey, originalValue] of Object.entries(node)) {
      const segment = isArrayNode ? Number(rawKey) : rawKey;
      const targetKey = isArrayNode ? segment : rawKey;
      const pathSegments = [...parentPath, segment];
      const { currentPath, legacyPath } = resolveCurrentPaths(pathSegments, pathSerializer);

      if (isConfigContainer(originalValue)) {
        if (ancestors.has(originalValue)) {
          throw createConfigError(
            'ERR_CIRCULAR_CONFIG',
            `Circular reference encountered at ${currentPath}.`
          );
        }

        setResultValue(result, targetKey, traverseConfig(originalValue, {
          mode,
          key,
          algorithm: cryptoOptions,
          algorithmOptions: cryptoOptions,
          parentPath: pathSegments,
          normalizedPaths,
          nonStringPolicy,
          existingPayloadPolicy,
          pathSerializer,
          ancestors,
          seenPaths
        }));
        continue;
      }

      if (seenPaths.has(currentPath)) {
        throw createConfigError(
          'ERR_PATH_COLLISION',
          `Multiple config values resolve to the path ${currentPath}.`
        );
      }
      seenPaths.add(currentPath);

      const shouldProcess = !normalizedPaths || normalizedPaths.has(currentPath);
      if (!shouldProcess) {
        setResultValue(result, targetKey, originalValue);
        continue;
      }

      let value = originalValue;
      if (typeof value !== 'string') {
        if (nonStringPolicy === 'ignore') {
          setResultValue(result, targetKey, value);
          continue;
        }

        if (nonStringPolicy === 'error' || mode === MODES.DECRYPT) {
          throw createConfigError(
            'ERR_NON_STRING_VALUE',
            `Non-string value encountered at ${currentPath}.`
          );
        }

        value = stringifyConfigLeaf(value, currentPath);
      }

      if (mode === MODES.ENCRYPT) {
        if (isYamlockPayload(value)) {
          if (existingPayloadPolicy === 'encrypt') {
            setResultValue(
              result,
              targetKey,
              encryptValue(value, key, currentPath, cryptoOptions)
            );
            continue;
          }

          const payloadVersion = detectPayloadVersion(value);
          decryptConfigValue(
            value,
            key,
            currentPath,
            legacyPath,
            payloadVersion === 1 ? cryptoOptions : undefined
          );

          if (existingPayloadPolicy === 'error') {
            throw createConfigError(
              'ERR_ALREADY_ENCRYPTED',
              `Selected value at ${currentPath} is already encrypted.`
            );
          }

          setResultValue(result, targetKey, value);
          continue;
        }

        setResultValue(result, targetKey, encryptValue(value, key, currentPath, cryptoOptions));
      } else {
        setResultValue(result, targetKey, decryptConfigValue(
          value,
          key,
          currentPath,
          legacyPath,
          cryptoOptions
        ));
      }
    }

    return result;
  } finally {
    ancestors.delete(node);
  }
}
