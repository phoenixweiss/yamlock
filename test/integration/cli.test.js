import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import yaml from 'js-yaml';

import { decryptValue } from '../../src/crypto/decrypt.js';
import { encryptValue } from '../../src/crypto/encrypt.js';

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

function encryptLegacy(value, fieldPath, algorithm = 'aes-256-cbc') {
  return encryptValue(value, KEY, fieldPath, {
    formatVersion: 1,
    algorithm
  });
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
  assert.match(afterEncrypt.db.password, /^yl\|2\|/);

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
  assert.match(afterEncrypt.services.api.token, /^yl\|2\|/);

  const decryptResult = runCli(['decrypt', filePath, '--key', KEY]);
  assert.equal(decryptResult.status, 0, decryptResult.stderr);

  const finalContent = yaml.load(readFileSync(filePath, 'utf8'));
  assert.deepEqual(finalContent, input);
});

test('CLI fails when key is missing', () => {
  const filePath = createTempFile({ value: 'secret' });
  const result = runCli(['encrypt', filePath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[yamlock:ERR_MISSING_KEY]/);
});

test('CLI requires explicit legacy mode for legacy algorithm selection', () => {
  const input = { value: 'secret' };
  const filePath = createTempFile(input);

  const refused = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--algorithm',
    'aes-256-cbc'
  ]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /\[yamlock:ERR_INVALID_OPTION]/);
  assert.deepEqual(JSON.parse(readFileSync(filePath, 'utf8')), input);

  const legacy = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--legacy'
  ]);
  assert.equal(legacy.status, 0, legacy.stderr);
  const encrypted = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.match(encrypted.value, /^yl\|aes-256-cbc\|/);
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

test('CLI dry-run prints diff without modifying files', () => {
  const input = { value: 'secret' };
  const filePath = createTempFile(input);

  const result = runCli(['encrypt', filePath, '--key', KEY, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  const contentAfter = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(contentAfter, input);
  assert.ok(result.stdout.includes('DRY-RUN'));
  assert.ok(result.stdout.includes('--- original'));
  assert.ok(result.stdout.includes('+++ result'));
});

test('CLI version command prints package version', () => {
  const result = runCli(['version']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim(), new RegExp(`^yamlock ${packageJson.version}`));
});

test('CLI algorithms command separates tested vs available lists', () => {
  const result = runCli(['algorithms']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('Default v2 profile'));
  assert.ok(result.stdout.includes('Tested legacy algorithms'));
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

test('CLI decrypt infers an explicitly selected legacy encryption algorithm', () => {
  const input = {
    db: {
      password: 'custom'
    }
  };

  const filePath = createTempFile(input);
  const encryptResult = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--legacy',
    '--algorithm',
    'chacha20-poly1305'
  ]);
  assert.equal(encryptResult.status, 0, encryptResult.stderr);

  const decryptResult = runCli([
    'decrypt',
    filePath,
    '--key',
    KEY
  ]);
  assert.equal(decryptResult.status, 0, decryptResult.stderr);

  const finalContent = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(finalContent, input);
});

test('CLI decrypt rejects algorithm overrides because payload metadata is authoritative', () => {
  const filePath = createTempFile({ value: 'secret' });
  const result = runCli([
    'decrypt',
    filePath,
    '--key',
    KEY,
    '--algorithm',
    'chacha20-poly1305'
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[yamlock:ERR_INVALID_OPTION]/);
});

test('CLI decrypts only specified paths when --paths is provided', () => {
  const input = {
    db: { password: 'secret', host: 'localhost' },
    api: { token: 'abc', url: 'https://example.com' }
  };

  const filePath = createTempFile(input);
  runCli(['encrypt', filePath, '--key', KEY, '--paths', 'db.password,api.token']);

  const decryptResult = runCli([
    'decrypt',
    filePath,
    '--key',
    KEY,
    '--paths',
    'db.password'
  ]);
  assert.equal(decryptResult.status, 0, decryptResult.stderr);

  const afterDecrypt = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.equal(afterDecrypt.db.password, input.db.password);
  assert.notEqual(afterDecrypt.api.token, input.api.token);
});

test('CLI migrates legacy payloads in place with backup and preserved permissions', () => {
  const legacy = encryptLegacy('secret', 'db.password');
  const filePath = createTempFile({ db: { password: legacy, user: 'app' } });
  const backupPath = `${filePath}.yamlock.bak`;
  chmodSync(filePath, 0o640);
  const originalRaw = readFileSync(filePath, 'utf8');

  const result = runCli([
    'migrate',
    filePath,
    '--key',
    KEY,
    '--paths',
    'db.password'
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Migrated 1 legacy value/);
  assert.equal(readFileSync(backupPath, 'utf8'), originalRaw);
  assert.equal(statSync(backupPath).mode & 0o777, 0o640);
  assert.equal(statSync(filePath).mode & 0o777, 0o640);

  const migrated = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.match(migrated.db.password, /^yl\|2\|/);
  assert.equal(decryptValue(migrated.db.password, KEY, 'db.password'), 'secret');
  assert.equal(migrated.db.user, 'app');
});

test('CLI migration dry-run leaves input and backups untouched', () => {
  const legacy = encryptLegacy('dry-run-secret', 'value');
  const filePath = createTempFile({ value: legacy, note: 'visible-plaintext' });
  const originalRaw = readFileSync(filePath, 'utf8');

  const result = runCli([
    'migrate',
    filePath,
    '--key',
    KEY,
    '--paths',
    'value',
    '--dry-run'
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY-RUN \(migrate\)/);
  assert.match(result.stdout, /Would migrate 1 legacy value/);
  assert.match(result.stdout, /No files were modified/);
  assert.doesNotMatch(result.stdout, /dry-run-secret|visible-plaintext/);
  assert.equal(readFileSync(filePath, 'utf8'), originalRaw);
  assert.equal(existsSync(`${filePath}.yamlock.bak`), false);
});

test('CLI migration handles mixed legacy and v2 payloads only with explicit permission', () => {
  const legacy = encryptLegacy('old-secret', 'legacy');
  const v2 = encryptValue('new-secret', KEY, 'modern', { formatVersion: 2 });
  const filePath = createTempFile({ legacy, modern: v2 });
  const originalRaw = readFileSync(filePath, 'utf8');

  const refused = runCli(['migrate', filePath, '--key', KEY]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /\[yamlock:ERR_MIGRATION_ALREADY_V2]/);
  assert.doesNotMatch(refused.stderr, /old-secret|new-secret/);
  assert.equal(readFileSync(filePath, 'utf8'), originalRaw);
  assert.equal(existsSync(`${filePath}.yamlock.bak`), false);

  const allowed = runCli([
    'migrate',
    filePath,
    '--key',
    KEY,
    '--allow-mixed'
  ]);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /Migrated 1 legacy value/);
  assert.match(allowed.stdout, /preserved 1 existing v2 value/);

  const migrated = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.match(migrated.legacy, /^yl\|2\|/);
  assert.equal(migrated.modern, v2);
});

test('CLI migration validates every selected value before creating files', () => {
  const legacy = encryptLegacy('first-secret', 'first');
  const filePath = createTempFile({ first: legacy, second: 'plaintext' });
  const originalRaw = readFileSync(filePath, 'utf8');

  const result = runCli(['migrate', filePath, '--key', KEY]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[yamlock:ERR_MIGRATION_PLAINTEXT]/);
  assert.doesNotMatch(result.stderr, /first-secret/);
  assert.equal(readFileSync(filePath, 'utf8'), originalRaw);
  assert.equal(existsSync(`${filePath}.yamlock.bak`), false);
});

test('CLI migration fails closed on an authenticated legacy payload with the wrong key', () => {
  const legacy = encryptLegacy('authenticated-secret', 'value', 'chacha20-poly1305');
  const filePath = createTempFile({ value: legacy });
  const originalRaw = readFileSync(filePath, 'utf8');

  const result = runCli(['migrate', filePath, '--key', 'wrong-key']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[yamlock:ERR_MIGRATION_FAILED]/);
  assert.doesNotMatch(result.stderr, /authenticated-secret/);
  assert.equal(readFileSync(filePath, 'utf8'), originalRaw);
  assert.equal(existsSync(`${filePath}.yamlock.bak`), false);
});

test('CLI migration can write a separate output without changing the source', () => {
  const legacy = encryptLegacy('output-secret', 'value');
  const filePath = createTempFile({ value: legacy }, '.yaml');
  const outputPath = `${filePath}.migrated.yaml`;
  const originalRaw = readFileSync(filePath, 'utf8');

  const result = runCli([
    'migrate',
    filePath,
    '--key',
    KEY,
    '--output',
    outputPath
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(filePath, 'utf8'), originalRaw);
  assert.equal(existsSync(`${filePath}.yamlock.bak`), false);
  const migrated = yaml.load(readFileSync(outputPath, 'utf8'));
  assert.match(migrated.value, /^yl\|2\|/);

  const refused = runCli([
    'migrate',
    filePath,
    '--key',
    KEY,
    '--output',
    outputPath
  ]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /\[yamlock:ERR_MIGRATION_OUTPUT_EXISTS]/);
  assert.equal(readFileSync(filePath, 'utf8'), originalRaw);
});

test('CLI migration refuses to replace an existing backup', () => {
  const legacy = encryptLegacy('backup-secret', 'value');
  const filePath = createTempFile({ value: legacy });
  const backupPath = `${filePath}.yamlock.bak`;
  const originalRaw = readFileSync(filePath, 'utf8');
  writeFileSync(backupPath, 'keep-existing-backup');

  const result = runCli(['migrate', filePath, '--key', KEY]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[yamlock:ERR_MIGRATION_BACKUP_EXISTS]/);
  assert.equal(readFileSync(filePath, 'utf8'), originalRaw);
  assert.equal(readFileSync(backupPath, 'utf8'), 'keep-existing-backup');
});

test('CLI migration supports explicit no-backup and leaves all-v2 input unchanged', () => {
  const legacy = encryptLegacy('no-backup-secret', 'value');
  const filePath = createTempFile({ value: legacy });

  const migrated = runCli([
    'migrate',
    filePath,
    '--key',
    KEY,
    '--no-backup'
  ]);
  assert.equal(migrated.status, 0, migrated.stderr);
  assert.match(migrated.stdout, /Backup disabled by --no-backup/);
  assert.equal(existsSync(`${filePath}.yamlock.bak`), false);

  const migratedRaw = readFileSync(filePath, 'utf8');
  const noOp = runCli([
    'migrate',
    filePath,
    '--key',
    KEY,
    '--allow-mixed'
  ]);
  assert.equal(noOp.status, 0, noOp.stderr);
  assert.match(noOp.stdout, /No legacy values required migration/);
  assert.match(noOp.stdout, /No files were modified/);
  assert.equal(readFileSync(filePath, 'utf8'), migratedRaw);
  assert.equal(existsSync(`${filePath}.yamlock.bak`), false);
});

test('CLI migration refuses symbolic-link inputs', () => {
  const legacy = encryptLegacy('link-secret', 'value');
  const filePath = createTempFile({ value: legacy });
  const linkPath = `${filePath}.link.json`;
  const originalRaw = readFileSync(filePath, 'utf8');
  symlinkSync(filePath, linkPath);

  const result = runCli(['migrate', linkPath, '--key', KEY]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[yamlock:ERR_MIGRATION_UNSAFE_INPUT]/);
  assert.equal(readFileSync(filePath, 'utf8'), originalRaw);
  assert.equal(existsSync(`${linkPath}.yamlock.bak`), false);
});
