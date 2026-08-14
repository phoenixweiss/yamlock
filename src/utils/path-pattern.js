const COMPILED_PATTERN = Symbol('yamlock.compiledPathPattern');
const ALLOWED_ESCAPES = new Set(['\\', '.', '[', ']', ',', '*']);
const EMPTY_COMPILED_PATTERNS = Object.freeze([]);

const TOKEN_TYPES = Object.freeze({
  ARRAY_INDEX: 'array-index',
  ARRAY_WILDCARD: 'array-wildcard',
  GLOBSTAR: 'globstar',
  OBJECT_KEY: 'object-key',
  OBJECT_WILDCARD: 'object-wildcard'
});

export class PathPatternSyntaxError extends Error {
  constructor(message, offset = 0) {
    super(`Invalid path pattern at offset ${offset}: ${message}`);
    this.name = 'PathPatternSyntaxError';
    this.code = 'ERR_INVALID_PATH_PATTERNS';
    this.offset = offset;
  }
}

function syntaxError(message, offset) {
  throw new PathPatternSyntaxError(message, offset);
}

function freezeToken(type, value) {
  return Object.freeze(value === undefined ? { type } : { type, value });
}

function parseObjectToken(source, start) {
  let index = start;
  let value = '';
  let hasUnescapedWildcard = false;

  while (index < source.length) {
    const character = source[index];
    if (character === '.' || character === '[') {
      break;
    }

    if (character === '\\') {
      const escaped = source[index + 1];
      if (escaped === undefined) {
        syntaxError('A trailing backslash is not allowed.', index);
      }
      if (!ALLOWED_ESCAPES.has(escaped)) {
        syntaxError(`Unsupported escape \\${escaped}.`, index);
      }
      value += escaped;
      index += 2;
      continue;
    }

    if (character === ']') {
      syntaxError('Unexpected closing bracket.', index);
    }
    if (character === ',') {
      syntaxError('Literal commas must be escaped.', index);
    }
    if (character === '*') {
      hasUnescapedWildcard = true;
    }

    value += character;
    index += 1;
  }

  if (index === start) {
    syntaxError('Object path segments must not be empty.', start);
  }

  const rawSegment = source.slice(start, index);
  if (hasUnescapedWildcard) {
    if (rawSegment === '*') {
      return {
        nextIndex: index,
        token: freezeToken(TOKEN_TYPES.OBJECT_WILDCARD)
      };
    }
    if (rawSegment === '**') {
      return {
        nextIndex: index,
        token: freezeToken(TOKEN_TYPES.GLOBSTAR)
      };
    }
    syntaxError('Wildcards must occupy a complete object segment.', start);
  }

  return {
    nextIndex: index,
    token: freezeToken(TOKEN_TYPES.OBJECT_KEY, value)
  };
}

function parseArrayToken(source, start) {
  const closingBracket = source.indexOf(']', start + 1);
  if (closingBracket === -1) {
    syntaxError('Array segments require a closing bracket.', start);
  }

  const content = source.slice(start + 1, closingBracket);
  if (content === '*') {
    return {
      nextIndex: closingBracket + 1,
      token: freezeToken(TOKEN_TYPES.ARRAY_WILDCARD)
    };
  }

  if (!/^(?:0|[1-9]\d*)$/u.test(content)) {
    syntaxError('Array indexes must be canonical non-negative integers or *.', start);
  }

  const value = Number(content);
  if (!Number.isSafeInteger(value)) {
    syntaxError('Array indexes must be safe integers.', start);
  }

  return {
    nextIndex: closingBracket + 1,
    token: freezeToken(TOKEN_TYPES.ARRAY_INDEX, value)
  };
}

function compileNormalizedPattern(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const parsed = source[index] === '['
      ? parseArrayToken(source, index)
      : parseObjectToken(source, index);
    tokens.push(parsed.token);
    index = parsed.nextIndex;

    if (index === source.length) {
      break;
    }

    if (source[index] === '[') {
      continue;
    }

    if (source[index] !== '.') {
      syntaxError(`Unexpected character ${source[index]}.`, index);
    }

    index += 1;
    if (index === source.length) {
      syntaxError('A pattern must not end with a dot.', index - 1);
    }
    if (source[index] === '[') {
      syntaxError('Array segments must not follow a dot.', index);
    }
  }

  const compiled = {
    source,
    tokens: Object.freeze(tokens)
  };
  Object.defineProperty(compiled, COMPILED_PATTERN, { value: true });
  return Object.freeze(compiled);
}

export function compilePathPattern(pattern) {
  if (typeof pattern !== 'string') {
    syntaxError('A pattern must be a string.', 0);
  }

  const source = pattern.trim();
  if (source.length === 0) {
    syntaxError('A pattern must not be empty.', 0);
  }

  return compileNormalizedPattern(source);
}

export function compilePathPatterns(patterns) {
  if (patterns === undefined || (Array.isArray(patterns) && patterns.length === 0)) {
    return EMPTY_COMPILED_PATTERNS;
  }
  if (!Array.isArray(patterns)) {
    syntaxError('pathPatterns must be an array of non-empty strings.', 0);
  }

  const compiledBySource = new Map();
  for (const pattern of patterns) {
    const compiled = compilePathPattern(pattern);
    compiledBySource.set(compiled.source, compiled);
  }
  return Object.freeze([...compiledBySource.values()]);
}

function validatePathSegments(segments) {
  if (!Array.isArray(segments)) {
    throw new TypeError('Path segments must be an array.');
  }

  const invalid = segments.some((segment) => (
    (typeof segment !== 'string' || segment.length === 0) &&
    (!Number.isInteger(segment) || segment < 0)
  ));
  if (invalid) {
    throw new TypeError('Path segments must be non-empty strings or non-negative integers.');
  }
}

function tokenMatchesSegment(token, segment) {
  switch (token.type) {
    case TOKEN_TYPES.OBJECT_KEY:
      return typeof segment === 'string' && segment === token.value;
    case TOKEN_TYPES.ARRAY_INDEX:
      return typeof segment === 'number' && segment === token.value;
    case TOKEN_TYPES.OBJECT_WILDCARD:
      return typeof segment === 'string';
    case TOKEN_TYPES.ARRAY_WILDCARD:
      return typeof segment === 'number';
    default:
      return false;
  }
}

export function matchesPathPattern(compiledPattern, segments) {
  if (!compiledPattern?.[COMPILED_PATTERN]) {
    throw new TypeError('matchesPathPattern requires a compiled path pattern.');
  }
  validatePathSegments(segments);

  let previous = new Array(segments.length + 1).fill(false);
  previous[0] = true;

  for (const token of compiledPattern.tokens) {
    const current = new Array(segments.length + 1).fill(false);
    if (token.type === TOKEN_TYPES.GLOBSTAR) {
      current[0] = previous[0];
      for (let index = 1; index <= segments.length; index += 1) {
        current[index] = previous[index] || current[index - 1];
      }
    } else {
      for (let index = 1; index <= segments.length; index += 1) {
        current[index] = previous[index - 1] && tokenMatchesSegment(
          token,
          segments[index - 1]
        );
      }
    }
    previous = current;
  }

  return previous[segments.length];
}

export function matchesAnyPathPattern(compiledPatterns, segments) {
  if (!Array.isArray(compiledPatterns)) {
    throw new TypeError('matchesAnyPathPattern requires an array of compiled patterns.');
  }
  validatePathSegments(segments);
  return compiledPatterns.some((pattern) => matchesPathPattern(pattern, segments));
}
