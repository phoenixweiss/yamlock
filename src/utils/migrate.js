import { decryptValue } from '../crypto/decrypt.js';
import { encryptValue } from '../crypto/encrypt.js';
import {
  detectPayloadVersion,
  V2_FORMAT_VERSION
} from '../crypto/payload-v2.js';
import { isYamlockPayload } from '../crypto/utils.js';
import { buildPath } from './path.js';

function createMigrationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizePaths(paths) {
  return Array.isArray(paths) && paths.length > 0
    ? new Set(paths.map((path) => String(path).trim()).filter(Boolean))
    : null;
}

function setResultValue(result, key, value) {
  Object.defineProperty(result, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

function traverse(node, context) {
  const isArrayNode = Array.isArray(node);
  const result = isArrayNode ? [] : {};

  Object.entries(node).forEach(([rawKey, value]) => {
    const segment = isArrayNode ? Number(rawKey) : rawKey;
    const targetKey = isArrayNode ? segment : rawKey;
    const pathSegments = [...context.parentPath, segment];
    const currentPath = buildPath(context.parentPath, segment);

    if (value !== null && typeof value === 'object') {
      setResultValue(result, targetKey, traverse(value, {
        ...context,
        parentPath: pathSegments
      }));
      return;
    }

    const selected = !context.paths || context.paths.has(currentPath);
    if (!selected) {
      setResultValue(result, targetKey, value);
      return;
    }

    context.stats.selected += 1;

    if (typeof value !== 'string') {
      throw createMigrationError(
        'ERR_MIGRATION_NON_STRING',
        `Selected value at ${currentPath} is not a string.`
      );
    }

    if (!isYamlockPayload(value)) {
      throw createMigrationError(
        'ERR_MIGRATION_PLAINTEXT',
        `Selected value at ${currentPath} is not encrypted; narrow --paths to legacy payloads.`
      );
    }

    const version = detectPayloadVersion(value);
    if (version === V2_FORMAT_VERSION) {
      if (!context.allowMixed) {
        throw createMigrationError(
          'ERR_MIGRATION_ALREADY_V2',
          `Selected value at ${currentPath} is already v2; use --allow-mixed to authenticate and preserve it.`
        );
      }

      decryptValue(value, context.key, currentPath);
      setResultValue(result, targetKey, value);
      context.stats.preservedV2 += 1;
      return;
    }

    if (version !== 1) {
      throw createMigrationError(
        'ERR_MIGRATION_UNSUPPORTED_VERSION',
        `Selected value at ${currentPath} uses unsupported payload version ${version}.`
      );
    }

    const plaintext = decryptValue(value, context.key, currentPath);
    setResultValue(
      result,
      targetKey,
      encryptValue(plaintext, context.key, currentPath, {
        formatVersion: V2_FORMAT_VERSION
      })
    );
    context.stats.migrated += 1;
  });

  return result;
}

/**
 * Validates selected encrypted values and migrates legacy payloads to v2.
 * The input object is not mutated.
 * @param {Object|Array} node
 * @param {Object} options
 * @param {string|Buffer} options.key
 * @param {string[]} [options.paths]
 * @param {boolean} [options.allowMixed=false]
 * @returns {{ data: Object|Array, changed: boolean, stats: { selected: number, migrated: number, preservedV2: number } }}
 */
export function migrateConfig(node, options) {
  if (typeof node !== 'object' || node === null) {
    throw createMigrationError(
      'ERR_MIGRATION_INPUT',
      'migrateConfig expects a non-null object or array.'
    );
  }

  if (typeof options !== 'object' || options === null) {
    throw createMigrationError(
      'ERR_MIGRATION_OPTIONS',
      'migrateConfig expects an options object.'
    );
  }

  const stats = {
    selected: 0,
    migrated: 0,
    preservedV2: 0
  };
  const data = traverse(node, {
    key: options.key,
    paths: normalizePaths(options.paths),
    allowMixed: options.allowMixed === true,
    parentPath: [],
    stats
  });

  if (stats.migrated === 0 && stats.preservedV2 === 0) {
    throw createMigrationError(
      'ERR_MIGRATION_NOTHING_TO_DO',
      'No selected encrypted values were found to migrate.'
    );
  }

  return {
    data,
    changed: stats.migrated > 0,
    stats
  };
}
