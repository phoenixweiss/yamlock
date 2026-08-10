import {
  YAMLOCK_ERROR_CODES,
  YamlockValidationError
} from '../errors.js';

const RESERVED_PATH_CHARACTERS = new Set(['\\', '.', '[', ']', ',']);

function validateSegments(segments, functionName) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new YamlockValidationError(
      `${functionName} requires a non-empty segments array.`,
      { code: YAMLOCK_ERROR_CODES.INVALID_PATH_SEGMENTS }
    );
  }

  const invalid = segments.some((segment) => (
    (typeof segment !== 'string' || segment.length === 0) &&
    (!Number.isInteger(segment) || segment < 0)
  ));
  if (invalid) {
    throw new YamlockValidationError(
      'Path segments must be non-empty strings or non-negative integers.',
      { code: YAMLOCK_ERROR_CODES.INVALID_PATH_SEGMENTS }
    );
  }
}

function escapeStringSegment(segment) {
  return [...segment]
    .map((character) => RESERVED_PATH_CHARACTERS.has(character) ? `\\${character}` : character)
    .join('');
}

/**
 * Builds a canonical dot/bracket path that uniquely identifies a value.
 * Reserved characters in object keys are escaped with a backslash.
 * Example: ["db.settings", "users", 0] => "db\\.settings.users[0]"
 *
 * @param {Array<string|number>} segments
 * @returns {string}
 */
export function serializePath(segments) {
  validateSegments(segments, 'serializePath');

  return segments
    .map((segment, index) => {
      if (typeof segment === 'number') {
        return `[${segment}]`;
      }

      const escaped = escapeStringSegment(segment);
      return index === 0 ? escaped : `.${escaped}`;
    })
    .join('');
}

/**
 * Reproduces the path representation written by yamlock before escaping was
 * introduced. This is used only to read existing payloads.
 *
 * @param {Array<string|number>} segments
 * @returns {string}
 */
export function serializeLegacyPath(segments) {
  validateSegments(segments, 'serializeLegacyPath');

  return segments
    .map((segment, index) => {
      if (typeof segment === 'number') {
        return `[${segment}]`;
      }

      return index === 0 ? segment : `.${segment}`;
    })
    .join('');
}

/**
 * Returns the full path string for a given traversal context.
 * @param {Array<string|number>} parentSegments
 * @param {string|number} currentSegment
 * @returns {string}
 */
export function buildPath(parentSegments, currentSegment) {
  const segments = [...(parentSegments ?? [])];
  segments.push(currentSegment);
  return serializePath(segments);
}
