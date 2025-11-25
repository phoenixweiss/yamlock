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

test('buildPath extends parent segments gracefully', () => {
  const base = ['root', 'child'];
  const result = buildPath(base, 'leaf');

  assert.equal(result, 'root.child.leaf');
  assert.deepEqual(base, ['root', 'child']);
});

test('serializePath validates inputs', () => {
  assert.throws(() => serializePath([]), /non-empty segments/);
  assert.throws(() => serializePath(['ok', '']), /non-empty strings or numbers/);
});
