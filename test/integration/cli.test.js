import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import yaml from 'js-yaml';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

const CLI_BIN = new URL('../../bin/yamlock', import.meta.url).pathname;
const KEY = 'integration-secret-key';

function runCli(args, env = {}) {
  const result = spawnSync('node', [CLI_BIN, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  return result;
}

function createTempFile(content, extension = '.json') {
  const dir = mkdtempSync(join(tmpdir(), 'yamlock-'));
  const filePath = join(dir, `${randomUUID()}${extension}`);

  if (extension === '.yaml' || extension === '.yml') {
    writeFileSync(filePath, yaml.dump(content));
  } else {
    writeFileSync(filePath, JSON.stringify(content, null, 2));
  }

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

test('CLI encrypts and decrypts YAML configs', () => {
  const input = {
    services: {
      api: {
        token: 'secret-token'
      }
    }
  };

  const filePath = createTempFile(input, '.yaml');
  const encryptResult = runCli(['encrypt', filePath, '--key', KEY]);
  assert.equal(encryptResult.status, 0, encryptResult.stderr);

  const afterEncrypt = yaml.load(readFileSync(filePath, 'utf8'));
  assert.notEqual(afterEncrypt.services.api.token, input.services.api.token);

  const decryptResult = runCli(['decrypt', filePath, '--key', KEY]);
  assert.equal(decryptResult.status, 0, decryptResult.stderr);

  const finalContent = yaml.load(readFileSync(filePath, 'utf8'));
  assert.deepEqual(finalContent, input);
});

test('CLI fails when key is missing', () => {
  const filePath = createTempFile({ value: 'secret' });
  const result = runCli(['encrypt', filePath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Encryption key is required/);
});

test('CLI encrypts only specified paths when --paths is provided', () => {
  const input = {
    db: {
      user: 'app',
      password: 'secret'
    },
    api: {
      token: 'abc123',
      url: 'https://example.com'
    }
  };

  const filePath = createTempFile(input);
  const encryptResult = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--paths',
    'db.password,api.token'
  ]);
  assert.equal(encryptResult.status, 0, encryptResult.stderr);

  const afterEncrypt = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.equal(afterEncrypt.db.user, input.db.user);
  assert.equal(afterEncrypt.api.url, input.api.url);
  assert.notEqual(afterEncrypt.db.password, input.db.password);
  assert.notEqual(afterEncrypt.api.token, input.api.token);
});

test('CLI writes to a separate file when --output is used', () => {
  const input = {
    db: {
      password: 'secret'
    }
  };

  const filePath = createTempFile(input);
  const outputPath = `${filePath}.enc`;
  const originalContent = readFileSync(filePath, 'utf8');

  const encryptResult = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--output',
    outputPath
  ]);
  assert.equal(encryptResult.status, 0, encryptResult.stderr);

  const sourceAfter = readFileSync(filePath, 'utf8');
  const outputContent = readFileSync(outputPath, 'utf8');

  assert.equal(sourceAfter, originalContent);
  assert.notEqual(outputContent, originalContent);
});

test('CLI version command prints package version', () => {
  const result = runCli(['version']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim(), new RegExp(`^yamlock ${packageJson.version}`));
});

test('CLI algorithms command separates tested vs available lists', () => {
  const result = runCli(['algorithms']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('Tested algorithms'));
  assert.ok(result.stdout.includes('aes-256-cbc'));
  assert.ok(result.stdout.includes('Additional algorithms'));
});

test('CLI keygen outputs base64 key by default', () => {
  const result = runCli(['keygen']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Generated key \(base64/);
  assert.match(result.stdout, /export YAMLOCK_KEY=".+"/);
});

test('CLI keygen respects length and format overrides', () => {
  const result = runCli(['keygen', '--length', '16', '--format', 'hex']);
  assert.equal(result.status, 0, result.stderr);
  const match = result.stdout.match(/[a-f0-9]{32}/i);
  assert.ok(match);
});
