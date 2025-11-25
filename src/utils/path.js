/**
 * Builds a dot/bracket path string that uniquely identifies a value
 * inside a nested object/array structure.
 * Example: ["db", "users", 0, "password"] => "db.users[0].password"
 *
 * @param {Array<string|number>} segments
 * @returns {string}
 */
export function serializePath(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('serializePath requires a non-empty segments array.');
  }

  return segments
    .map((segment, index) => {
      if (typeof segment === 'number') {
        return `[${segment}]`;
      }

      if (typeof segment === 'string' && segment.length > 0) {
        return index === 0 ? segment : `.${segment}`;
      }

      throw new Error('Path segments must be non-empty strings or numbers.');
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
