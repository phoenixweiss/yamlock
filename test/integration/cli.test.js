import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const CLI_PATH = new URL('../../dist/cli/cli.js', import.meta.url).pathname;
const KEY = 'integration-secret-key';

function runCli(args, env = {}) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  return result;
}

function createTempFile(content) {
  const dir = mkdtempSync(join(tmpdir(), 'yamlock-'));
  const filePath = join(dir, `${randomUUID()}.json`);
  writeFileSync(filePath, JSON.stringify(content, null, 2));
  return filePath;
}

test('CLI encrypts and decrypts JSON configs', () => {
  const input = {
    db: {
      password: 'swordfish'
    }
  };

  const filePath = createTempFile(input);
  const encryptResult = runCli(['encrypt', filePath, '--key', KEY]);
  assert.equal(encryptResult.status, 0, encryptResult.stderr);

  const afterEncrypt = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.notEqual(afterEncrypt.db.password, input.db.password);

  const decryptResult = runCli(['decrypt', filePath, '--key', KEY]);
  assert.equal(decryptResult.status, 0, decryptResult.stderr);

  const finalContent = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(finalContent, input);
});

test('CLI fails when key is missing', () => {
  const filePath = createTempFile({ value: 'secret' });
  const result = runCli(['encrypt', filePath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Encryption key is required/);
});
