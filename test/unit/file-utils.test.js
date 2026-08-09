import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeFileAtomically } from '../../src/utils/file.js';

test('writeFileAtomically replaces content with the requested mode', () => {
  const root = mkdtempSync(join(tmpdir(), 'yamlock-atomic-'));
  const filePath = join(root, 'config.json');
  writeFileSync(filePath, 'old');
  chmodSync(filePath, 0o600);

  writeFileAtomically(filePath, 'new', { mode: 0o640 });

  assert.equal(readFileSync(filePath, 'utf8'), 'new');
  assert.equal(statSync(filePath).mode & 0o777, 0o640);
});

test('writeFileAtomically refuses existing destinations without changing them', () => {
  const root = mkdtempSync(join(tmpdir(), 'yamlock-atomic-'));
  const filePath = join(root, 'config.json');
  writeFileSync(filePath, 'keep');

  assert.throws(
    () => writeFileAtomically(filePath, 'replace', { refuseExisting: true }),
    (error) => error.code === 'EEXIST'
  );
  assert.equal(readFileSync(filePath, 'utf8'), 'keep');
  assert.deepEqual(readdirSync(root), ['config.json']);
});

test('writeFileAtomically removes its temporary file after installation failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'yamlock-atomic-'));
  const outputPath = join(root, 'output');
  mkdirSync(outputPath);

  assert.throws(() => writeFileAtomically(outputPath, 'content'));
  assert.equal(statSync(outputPath).isDirectory(), true);
  assert.deepEqual(readdirSync(root), ['output']);
});
