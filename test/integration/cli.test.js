import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
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
    env: { ...process.env, ...env, YAMLOCK_TEST_SOURCE: '1' },
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

test('CLI launcher uses explicit source mode instead of stale dist', () => {
  const root = mkdtempSync(join(tmpdir(), 'yamlock-launcher-'));
  const binDir = join(root, 'bin');
  const distDir = join(root, 'dist', 'cli');
  const sourceDir = join(root, 'src', 'cli');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  copyFileSync(CLI_BIN, join(binDir, 'yamlock'));
  writeFileSync(
    join(distDir, 'cli.js'),
    "export function runCli() { console.log('stale-dist'); }\n"
  );
  writeFileSync(
    join(sourceDir, 'cli.js'),
    "export function runCli() { console.log('current-source'); }\n"
  );

  const regular = spawnSync('node', [join(binDir, 'yamlock')], {
    env: { ...process.env, YAMLOCK_TEST_SOURCE: '0' },
    encoding: 'utf8'
  });
  assert.equal(regular.status, 0, regular.stderr);
  assert.equal(regular.stdout.trim(), 'stale-dist');

  const sourceMode = spawnSync('node', [join(binDir, 'yamlock')], {
    env: { ...process.env, YAMLOCK_TEST_SOURCE: '1' },
    encoding: 'utf8'
  });
  assert.equal(sourceMode.status, 0, sourceMode.stderr);
  assert.equal(sourceMode.stdout.trim(), 'current-source');
});

test('CLI encrypts and decrypts JSON configs', () => {
  const input = {
    db: {
      password: 'swordfish'
    }
  };

  const filePath = createTempFile(input);
  chmodSync(filePath, 0o640);
  const originalInode = statSync(filePath).ino;
  const encryptResult = runCli(['encrypt', filePath, '--key', KEY]);
  assert.equal(encryptResult.status, 0, encryptResult.stderr);

  const afterEncrypt = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.match(afterEncrypt.db.password, /^yl\|2\|/);
  const encryptedStat = statSync(filePath);
  assert.equal(encryptedStat.mode & 0o777, 0o640);
  assert.notEqual(encryptedStat.ino, originalInode);

  const decryptResult = runCli(['decrypt', filePath, '--key', KEY]);
  assert.equal(decryptResult.status, 0, decryptResult.stderr);

  const finalContent = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(finalContent, input);
  const decryptedStat = statSync(filePath);
  assert.equal(decryptedStat.mode & 0o777, 0o640);
  assert.notEqual(decryptedStat.ino, encryptedStat.ino);
});

test('CLI repeated encrypt preserves authenticated payloads without rewriting the file', () => {
  const filePath = createTempFile({ value: 'secret' });
  const first = runCli(['encrypt', filePath, '--key', KEY]);
  assert.equal(first.status, 0, first.stderr);
  const encryptedRaw = readFileSync(filePath, 'utf8');

  const repeated = runCli(['encrypt', filePath, '--key', KEY]);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /No plaintext values required encryption/);
  assert.match(repeated.stdout, /No files were modified/);
  assert.equal(readFileSync(filePath, 'utf8'), encryptedRaw);

  const strict = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--error-on-encrypted'
  ]);
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /\[yamlock:ERR_ALREADY_ENCRYPTED]/);
  assert.equal(readFileSync(filePath, 'utf8'), encryptedRaw);

  const wrongKey = runCli(['encrypt', filePath, '--key', 'wrong-key']);
  assert.equal(wrongKey.status, 1);
  assert.match(wrongKey.stderr, /\[yamlock:ERR_AUTHENTICATION_FAILED]/);
  assert.equal(readFileSync(filePath, 'utf8'), encryptedRaw);

  const conflicting = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--error-on-encrypted',
    '--force-encrypt'
  ]);
  assert.equal(conflicting.status, 1);
  assert.match(conflicting.stderr, /\[yamlock:ERR_INVALID_OPTION]/);
  assert.equal(readFileSync(filePath, 'utf8'), encryptedRaw);

  const forced = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--force-encrypt'
  ]);
  assert.equal(forced.status, 0, forced.stderr);
  const forcedConfig = JSON.parse(readFileSync(filePath, 'utf8'));
  const originalPayload = JSON.parse(encryptedRaw).value;
  assert.notEqual(forcedConfig.value, originalPayload);
  assert.equal(decryptValue(forcedConfig.value, KEY, 'value'), originalPayload);
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

test('CLI preserves YAML timestamps as opaque values', () => {
  const createdAt = new Date('2025-12-01T12:34:56.000Z');
  const filePath = createTempFile({ createdAt, secret: 'value' }, '.yaml');
  const result = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--paths',
    'secret'
  ]);
  assert.equal(result.status, 0, result.stderr);

  const encrypted = yaml.load(readFileSync(filePath, 'utf8'));
  assert.equal(encrypted.createdAt instanceof Date, true);
  assert.equal(encrypted.createdAt.toISOString(), createdAt.toISOString());
  assert.match(encrypted.secret, /^yl\|2\|/);
});

test('CLI documents and applies YAML rewrite normalization', () => {
  const root = mkdtempSync(join(tmpdir(), 'yamlock-yaml-rewrite-'));
  const filePath = join(root, 'config.yaml');
  const source = `# top comment
defaults: &defaults
  token: secret # inline comment
  retries: 3
service:
  <<: *defaults
  label: "quoted"
alias: *defaults
flow: { enabled: true, values: [one, two] }
explicit: !!str 123
folded: >
  folded
  value
`;
  writeFileSync(filePath, source);

  const result = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--paths',
    'defaults.token'
  ]);
  assert.equal(result.status, 0, result.stderr);

  const rewritten = readFileSync(filePath, 'utf8');
  assert.doesNotMatch(rewritten, /# top comment|# inline comment/);
  assert.doesNotMatch(rewritten, /&defaults|\*defaults|<<:|!!str/);
  assert.doesNotMatch(rewritten, /flow: \{/);

  const parsed = yaml.load(rewritten);
  assert.match(parsed.defaults.token, /^yl\|2\|/);
  assert.equal(parsed.defaults.retries, 3);
  assert.equal(parsed.service.token, 'secret');
  assert.equal(parsed.alias.token, 'secret');
  assert.equal(parsed.service.label, 'quoted');
  assert.deepEqual(parsed.flow, { enabled: true, values: ['one', 'two'] });
  assert.equal(parsed.explicit, '123');
  assert.equal(parsed.folded, 'folded value\n');
});

test('CLI preserves raw YAML bytes when encryption is a no-op', () => {
  const root = mkdtempSync(join(tmpdir(), 'yamlock-yaml-noop-'));
  const filePath = join(root, 'config.yaml');
  const source = `# keep this comment
defaults: &defaults
  token: secret
alias: *defaults
`;
  writeFileSync(filePath, source);

  const result = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--paths',
    'missing.path'
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No files were modified/);
  assert.equal(readFileSync(filePath, 'utf8'), source);
});

test('CLI rejects unknown custom YAML tags without rewriting the source', () => {
  const root = mkdtempSync(join(tmpdir(), 'yamlock-yaml-tag-'));
  const filePath = join(root, 'config.yaml');
  const source = 'value: !vault secret\n';
  writeFileSync(filePath, source);

  const result = runCli(['encrypt', filePath, '--key', KEY]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[yamlock:ERR_READ_FAILED]/);
  assert.match(result.stderr, /unknown tag/i);
  assert.doesNotMatch(result.stderr, /secret/);
  assert.equal(readFileSync(filePath, 'utf8'), source);
});

test('CLI parse errors do not echo invalid JSON contents', () => {
  const root = mkdtempSync(join(tmpdir(), 'yamlock-json-error-'));
  const filePath = join(root, 'config.json');
  const source = '{"value":"secret-marker", invalid}';
  writeFileSync(filePath, source);

  const result = runCli(['encrypt', filePath, '--key', KEY]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[yamlock:ERR_READ_FAILED]/);
  assert.match(result.stderr, /Invalid JSON syntax/);
  assert.doesNotMatch(result.stderr, /secret-marker|invalid}/);
  assert.equal(readFileSync(filePath, 'utf8'), source);
});

test('CLI fails when key is missing', () => {
  const filePath = createTempFile({ value: 'secret' });
  const result = runCli(['encrypt', filePath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[yamlock:ERR_MISSING_KEY]/);
});

test('CLI rejects malformed argument lists without modifying input', () => {
  const input = { value: 'secret' };
  const filePath = createTempFile(input);
  const cases = [
    {
      args: ['encrypt', filePath, '--key', KEY, '--unknown'],
      code: 'ERR_UNKNOWN_OPTION'
    },
    {
      args: ['encrypt', filePath, '--key', '--dry-run'],
      code: 'ERR_MISSING_OPTION_VALUE'
    },
    {
      args: ['encrypt', filePath, '--algorithm'],
      code: 'ERR_MISSING_OPTION_VALUE'
    },
    {
      args: ['encrypt', filePath, '--output'],
      code: 'ERR_MISSING_OPTION_VALUE'
    },
    {
      args: ['encrypt', filePath, '--paths'],
      code: 'ERR_MISSING_OPTION_VALUE'
    },
    {
      args: ['keygen', '--format'],
      code: 'ERR_MISSING_OPTION_VALUE'
    },
    {
      args: ['encrypt', filePath, '--key', KEY, '-k', KEY],
      code: 'ERR_DUPLICATE_OPTION'
    },
    {
      args: ['encrypt', filePath, 'extra.json', '--key', KEY],
      code: 'ERR_UNEXPECTED_ARGUMENT'
    },
    {
      args: ['encrypt', filePath, '--key', KEY, '--paths', ','],
      code: 'ERR_INVALID_OPTION_VALUE'
    }
  ];

  for (const scenario of cases) {
    const result = runCli(scenario.args);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, new RegExp(`\\[yamlock:${scenario.code}]`));
    assert.deepEqual(JSON.parse(readFileSync(filePath, 'utf8')), input);
  }
});

test('CLI enforces command-specific options and positional arguments', () => {
  const filePath = createTempFile({ value: 'secret' });
  const cases = [
    ['encrypt', filePath, '--key', KEY, '--allow-mixed'],
    ['decrypt', filePath, '--key', KEY, '--legacy'],
    ['migrate', filePath, '--key', KEY, '--force-encrypt'],
    ['keygen', '--key', KEY],
    ['version', '--dry-run']
  ];

  for (const args of cases) {
    const result = runCli(args);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /\[yamlock:ERR_INVALID_OPTION]/);
  }

  const extraArgument = runCli(['algorithms', 'config.json']);
  assert.equal(extraArgument.status, 1);
  assert.match(extraArgument.stderr, /\[yamlock:ERR_UNEXPECTED_ARGUMENT]/);

  const unknownCommand = runCli(['unknown']);
  assert.equal(unknownCommand.status, 1);
  assert.match(unknownCommand.stderr, /\[yamlock:ERR_UNKNOWN_COMMAND]/);
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

  const completeResult = runCli(['encrypt', filePath, '--key', KEY]);
  assert.equal(completeResult.status, 0, completeResult.stderr);
  const completed = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.equal(completed.db.password, afterEncrypt.db.password);
  assert.equal(completed.api.token, afterEncrypt.api.token);
  assert.match(completed.db.user, /^yl\|2\|/);
  assert.match(completed.api.url, /^yl\|2\|/);
});

test('CLI selects escaped object keys without matching nested paths', () => {
  const input = {
    'a.b': 'root-dot',
    a: { b: 'nested-dot' },
    'items[0]': 'object-brackets',
    items: ['array-index'],
    'comma,key': 'comma'
  };
  const filePath = createTempFile(input);
  const paths = String.raw`a\.b,items\[0\],comma\,key`;

  const encryptedResult = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--paths',
    paths
  ]);
  assert.equal(encryptedResult.status, 0, encryptedResult.stderr);

  const encrypted = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.match(encrypted['a.b'], /^yl\|2\|/);
  assert.match(encrypted['items[0]'], /^yl\|2\|/);
  assert.match(encrypted['comma,key'], /^yl\|2\|/);
  assert.equal(encrypted.a.b, 'nested-dot');
  assert.equal(encrypted.items[0], 'array-index');

  const decryptedResult = runCli([
    'decrypt',
    filePath,
    '--key',
    KEY,
    '--paths',
    paths
  ]);
  assert.equal(decryptedResult.status, 0, decryptedResult.stderr);
  assert.deepEqual(JSON.parse(readFileSync(filePath, 'utf8')), input);
});

test('CLI writes to a separate file when --output is used', () => {
  const input = {
    db: {
      password: 'secret'
    }
  };

  const filePath = createTempFile(input);
  chmodSync(filePath, 0o640);
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
  assert.equal(statSync(outputPath).mode & 0o777, 0o640);
});

test('CLI atomically replaces an existing output while preserving its mode', () => {
  const input = { value: 'secret' };
  const filePath = createTempFile(input);
  const outputPath = `${filePath}.enc`;
  const sourceRaw = readFileSync(filePath, 'utf8');
  writeFileSync(outputPath, 'existing-output');
  chmodSync(outputPath, 0o600);
  const outputInode = statSync(outputPath).ino;

  const result = runCli([
    'encrypt',
    filePath,
    '--key',
    KEY,
    '--output',
    outputPath
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(filePath, 'utf8'), sourceRaw);
  assert.equal(statSync(outputPath).mode & 0o777, 0o600);
  assert.notEqual(statSync(outputPath).ino, outputInode);
  assert.match(JSON.parse(readFileSync(outputPath, 'utf8')).value, /^yl\|2\|/);
});

test('CLI refuses symbolic-link inputs and outputs without modifying targets', () => {
  const targetPath = createTempFile({ value: 'target' });
  const inputLink = `${targetPath}.input-link`;
  const targetRaw = readFileSync(targetPath, 'utf8');
  symlinkSync(targetPath, inputLink);

  const unsafeInput = runCli(['encrypt', inputLink, '--key', KEY]);
  assert.equal(unsafeInput.status, 1);
  assert.match(unsafeInput.stderr, /\[yamlock:ERR_UNSAFE_INPUT]/);
  assert.equal(readFileSync(targetPath, 'utf8'), targetRaw);
  assert.equal(lstatSync(inputLink).isSymbolicLink(), true);

  const sourcePath = createTempFile({ value: 'source' });
  const outputTarget = createTempFile({ value: 'output-target' });
  const outputTargetRaw = readFileSync(outputTarget, 'utf8');
  const outputLink = `${sourcePath}.output-link`;
  symlinkSync(outputTarget, outputLink);

  const unsafeOutput = runCli([
    'encrypt',
    sourcePath,
    '--key',
    KEY,
    '--output',
    outputLink
  ]);
  assert.equal(unsafeOutput.status, 1);
  assert.match(unsafeOutput.stderr, /\[yamlock:ERR_UNSAFE_OUTPUT]/);
  assert.equal(readFileSync(outputTarget, 'utf8'), outputTargetRaw);
  assert.equal(lstatSync(outputLink).isSymbolicLink(), true);
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

test('CLI help warns about YAML rewrite normalization', () => {
  const result = runCli([]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /YAML rewrite note:/);
  assert.match(result.stdout, /not\s+preserved byte-for-byte/);
  assert.match(result.stdout, /--dry-run or --output/);
  assert.match(result.stdout, /Path syntax:/);
  assert.match(result.stdout, /db\\\.primary\.token/);
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

test('CLI keygen requires a bounded integer length', () => {
  for (const value of ['0', '-1', '1.5', '1e2', '4097', '9007199254740993']) {
    const result = runCli(['keygen', '--length', value]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /\[yamlock:ERR_INVALID_LENGTH]/);
  }

  const missing = runCli(['keygen', '--length']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /\[yamlock:ERR_MISSING_OPTION_VALUE]/);

  const minimum = runCli(['keygen', '--length', '1', '--format', 'hex']);
  assert.equal(minimum.status, 0, minimum.stderr);
  assert.match(minimum.stdout, /Generated key \(hex, 1 bytes of entropy\):/);
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
