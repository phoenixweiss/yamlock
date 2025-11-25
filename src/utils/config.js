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
 * @param {string} [options.algorithm]
 * @param {Array<string|number>} [options.parentPath]
 * @returns {Object|Array}
 */
export function processConfig(node, { mode, key, algorithm, parentPath = [] }) {
  if (typeof node !== 'object' || node === null) {
    throw new Error('processConfig expects a non-null object or array.');
  }

  if (mode !== MODES.ENCRYPT && mode !== MODES.DECRYPT) {
    throw new Error(`Unknown processConfig mode: ${mode}`);
  }

  const isArrayNode = Array.isArray(node);
  const result = isArrayNode ? [] : {};

  Object.entries(node).forEach(([rawKey, value]) => {
    const segment = isArrayNode ? Number(rawKey) : rawKey;
    const targetKey = isArrayNode ? segment : rawKey;
    const currentPath = buildPath(parentPath, segment);

    if (value !== null && typeof value === 'object') {
      result[targetKey] = processConfig(value, {
        mode,
        key,
        algorithm,
        parentPath: [...parentPath, segment]
      });
      return;
    }

    if (typeof value !== 'string') {
      result[targetKey] = value;
      return;
    }

    if (mode === MODES.ENCRYPT) {
      result[targetKey] = encryptValue(value, key, currentPath, algorithm);
    } else {
      result[targetKey] = decryptValue(value, key, currentPath);
    }
  });

  return result;
}
