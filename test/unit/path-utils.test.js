import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPath, serializePath } from '../../src/utils/path.js';

test('serializePath combines string segments with dot notation', () => {
  const result = serializePath(['root', 'child', 'leaf']);
  assert.equal(result, 'root.child.leaf');
});

test('serializePath handles array indices with bracket notation', () => {
  const result = serializePath(['db', 'users', 0, 'password']);
  assert.equal(result, 'db.users[0].password');
});

test('serializePath escapes reserved characters in object keys', () => {
  const result = serializePath([
    'db.primary',
    'items[0]',
    'comma,key',
    'slash\\key'
  ]);

  assert.equal(
    result,
    String.raw`db\.primary.items\[0\].comma\,key.slash\\key`
  );
});

test('serializePath distinguishes object keys from nested fields and array indices', () => {
  assert.notEqual(serializePath(['a.b']), serializePath(['a', 'b']));
  assert.notEqual(serializePath(['items[0]']), serializePath(['items', 0]));
});

test('buildPath extends parent segments gracefully', () => {
  const base = ['root', 'child'];
  const result = buildPath(base, 'leaf');

  assert.equal(result, 'root.child.leaf');
  assert.deepEqual(base, ['root', 'child']);
});

test('serializePath validates inputs', () => {
  assert.throws(() => serializePath([]), /non-empty segments/);
  assert.throws(() => serializePath(['ok', '']), /non-empty strings or non-negative integers/);
  assert.throws(() => serializePath(['ok', -1]), /non-empty strings or non-negative integers/);
});
