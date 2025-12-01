import { encryptValue } from '../crypto/encrypt.js';
import { decryptValue } from '../crypto/decrypt.js';
import { buildPath } from './path.js';

const MODES = {
  ENCRYPT: 'encrypt',
  DECRYPT: 'decrypt'
};

/**
 * Recursively processes a config object or array, encrypting/decrypting string values.
 * @param {Object|Array} node
 * @param {Object} options
 * @param {'encrypt'|'decrypt'} options.mode
 * @param {string|Buffer} options.key
 * @param {string|object} [options.algorithm]
 * @param {object} [options.algorithmOptions]
 * @param {"ignore"|"stringify"|"error"} [options.nonStringPolicy]
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

  const normalizedPaths = Array.isArray(options.paths) && options.paths.length > 0
    ? new Set(options.paths.map((path) => String(path).trim()).filter(Boolean))
    : null;

  return traverseConfig(node, {
    ...options,
    mode,
    parentPath: options.parentPath ?? [],
    normalizedPaths,
    nonStringPolicy: options.nonStringPolicy ?? 'ignore',
    pathSerializer: options.pathSerializer
  });
}

function traverseConfig(node, { mode, key, algorithm, algorithmOptions, parentPath, normalizedPaths, nonStringPolicy, pathSerializer }) {
  const isArrayNode = Array.isArray(node);
  const result = isArrayNode ? [] : {};
  const cryptoOptions = algorithmOptions ?? algorithm;

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
      result[targetKey] = encryptValue(value, key, currentPath, cryptoOptions);
    } else {
      result[targetKey] = decryptValue(value, key, currentPath, cryptoOptions);
    }
  });

  return result;
}
