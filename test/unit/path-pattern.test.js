import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PathPatternSyntaxError,
  compilePathPattern,
  compilePathPatterns,
  matchesAnyPathPattern,
  matchesPathPattern
} from '../../src/utils/path-pattern.js';

function matches(pattern, segments) {
  return matchesPathPattern(compilePathPattern(pattern), segments);
}

test('path patterns compile structural literals and wildcards', () => {
  const compiled = compilePathPattern(String.raw`a\.b.*.users[*].**.\*`);

  assert.equal(compiled.source, String.raw`a\.b.*.users[*].**.\*`);
  assert.deepEqual(compiled.tokens, [
    { type: 'object-key', value: 'a.b' },
    { type: 'object-wildcard' },
    { type: 'object-key', value: 'users' },
    { type: 'array-wildcard' },
    { type: 'globstar' },
    { type: 'object-key', value: '*' }
  ]);
  assert.ok(Object.isFrozen(compiled));
  assert.ok(Object.isFrozen(compiled.tokens));
  assert.ok(compiled.tokens.every(Object.isFrozen));
});

test('path patterns distinguish object keys and array indexes', () => {
  assert.equal(matches('services.*.token', ['services', 'api', 'token']), true);
  assert.equal(matches('services.*.token', ['services', 0, 'token']), false);
  assert.equal(matches('users[*].token', ['users', 12, 'token']), true);
  assert.equal(matches('users[*].token', ['users', 'admin', 'token']), false);
  assert.equal(matches('users[0].token', ['users', 0, 'token']), true);
  assert.equal(matches('users[0].token', ['users', 1, 'token']), false);
  assert.equal(matches('[*].token', [0, 'token']), true);
  assert.equal(matches('[*].token', ['0', 'token']), false);
});

test('globstar matches zero, one, or many mixed structural segments', () => {
  assert.equal(matches('db.**', ['db']), true);
  assert.equal(matches('db.**', ['db', 'password']), true);
  assert.equal(matches('db.**', ['db', 'replicas', 0, 'password']), true);
  assert.equal(matches('db.**', ['database', 'password']), false);
  assert.equal(matches('**.token', ['token']), true);
  assert.equal(matches('**.token', ['api', 'token']), true);
  assert.equal(matches('**.token', ['users', 0, 'token']), true);
  assert.equal(matches('**.token', ['token', 'value']), false);
  assert.equal(matches('matrix[*][*].secret', ['matrix', 0, 1, 'secret']), true);
});

test('multiple globstars match deterministically without recursion', () => {
  const segments = [
    'root',
    ...Array.from({ length: 200 }, (_, index) => index % 2 === 0 ? `key-${index}` : index),
    'secret'
  ];

  assert.equal(matches('**.root.**.secret.**', segments), true);
  assert.equal(matches('**.root.**.missing.**', segments), false);
});

test('path patterns support escaped literal reserved characters and asterisks', () => {
  assert.equal(matches(String.raw`a\.b.**`, ['a.b', 'secret']), true);
  assert.equal(matches(String.raw`labels\,primary`, ['labels,primary']), true);
  assert.equal(matches(String.raw`slash\\key`, ['slash\\key']), true);
  assert.equal(matches(String.raw`\*`, ['*']), true);
  assert.equal(matches(String.raw`\*`, ['other']), false);
  assert.equal(matches('*', ['*']), true);
  assert.equal(matches('*', ['other']), true);
  assert.equal(matches(String.raw`features.\*\.enabled`, ['features', '*.enabled']), true);
  assert.equal(matches(String.raw`items\[\*\]`, ['items[*]']), true);
  assert.equal(matches('ключ.**', ['ключ', '密钥']), true);
});

test('path patterns match complete leaf paths rather than prefixes', () => {
  assert.equal(matches('db', ['db']), true);
  assert.equal(matches('db', ['db', 'password']), false);
  assert.equal(matches('db.*', ['db', 'password']), true);
  assert.equal(matches('db.*', ['db', 'nested', 'password']), false);
  assert.equal(matches('**[*]', ['users', 0]), true);
  assert.equal(matches('**[*]', ['users', 0, 'token']), false);
});

test('path pattern lists normalize whitespace, remove duplicates, and match as a union', () => {
  const compiled = compilePathPatterns([' db.** ', 'users[*].token', 'db.**']);

  assert.equal(compiled.length, 2);
  assert.equal(Object.isFrozen(compiled), true);
  assert.equal(matchesAnyPathPattern(compiled, ['db', 'password']), true);
  assert.equal(matchesAnyPathPattern(compiled, ['users', 0, 'token']), true);
  assert.equal(matchesAnyPathPattern(compiled, ['api', 'url']), false);
  assert.deepEqual(compilePathPatterns(undefined), []);
  assert.deepEqual(compilePathPatterns([]), []);
  assert.equal(Object.isFrozen(compilePathPatterns([])), true);
  assert.equal(matchesAnyPathPattern([], ['db']), false);
});

test('path pattern compiler rejects malformed or ambiguous syntax', () => {
  const invalidPatterns = [
    '',
    '   ',
    '.root',
    'root.',
    'root..secret',
    'root.[*]',
    'service-*.token',
    '***',
    'items[]',
    'items[-1]',
    'items[01]',
    'items[1.2]',
    'items[9007199254740992]',
    'items[0',
    'items[0]]',
    String.raw`bad\q`,
    'bad\\',
    'comma,key',
    '[*]suffix'
  ];

  for (const pattern of invalidPatterns) {
    assert.throws(
      () => compilePathPattern(pattern),
      (error) => (
        error instanceof PathPatternSyntaxError &&
        error.code === 'ERR_INVALID_PATH_PATTERNS' &&
        Number.isInteger(error.offset)
      ),
      pattern
    );
  }

  assert.throws(() => compilePathPattern(42), /pattern must be a string/i);
  assert.throws(() => compilePathPatterns('db.**'), /must be an array/i);
  assert.throws(() => compilePathPatterns([null]), /pattern must be a string/i);
});

test('path pattern matcher validates compiled input and structural segments', () => {
  const compiled = compilePathPattern('db.**');

  assert.throws(() => matchesPathPattern('db.**', ['db']), /compiled path pattern/i);
  assert.throws(() => matchesPathPattern(compiled, 'db'), /segments must be an array/i);
  assert.throws(() => matchesPathPattern(compiled, ['']), /non-empty strings/i);
  assert.throws(() => matchesPathPattern(compiled, [-1]), /non-negative integers/i);
  assert.throws(() => matchesAnyPathPattern('db.**', ['db']), /array of compiled patterns/i);
  assert.throws(() => matchesAnyPathPattern([], ['']), /non-empty strings/i);
});
