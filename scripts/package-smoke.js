import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const SMOKE_KEY = 'package-smoke-test-key';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? PROJECT_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}${
        output ? `:\n${output}` : '.'
      }`
    );
  }

  return result;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function main() {
  assert.ok(
    existsSync(join(PROJECT_ROOT, 'dist', 'index.js')),
    'dist/index.js is missing; run the package smoke through yarn test:package.'
  );

  const tempRoot = mkdtempSync(join(tmpdir(), 'yamlock-package-smoke-'));
  try {
    const packDirectory = join(tempRoot, 'pack');
    const projectDirectory = join(tempRoot, 'project');
    mkdirSync(packDirectory);
    mkdirSync(projectDirectory);

    run(NPM_COMMAND, [
      'pack',
      '--ignore-scripts',
      '--pack-destination',
      packDirectory,
      '--silent'
    ]);

    const archives = readdirSync(packDirectory)
      .filter((entry) => entry.endsWith('.tgz'));
    assert.equal(archives.length, 1, 'npm pack must create exactly one tarball.');
    const archivePath = join(packDirectory, archives[0]);

    writeFileSync(
      join(projectDirectory, 'package.json'),
      `${JSON.stringify({ name: 'yamlock-package-smoke', private: true }, null, 2)}\n`
    );
    run(NPM_COMMAND, [
      'install',
      archivePath,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--silent'
    ], { cwd: projectDirectory });

    const installedRoot = join(projectDirectory, 'node_modules', 'yamlock');
    const sourcePackage = readJson(join(PROJECT_ROOT, 'package.json'));
    const installedPackage = readJson(join(installedRoot, 'package.json'));
    assert.equal(installedPackage.version, sourcePackage.version);
    for (const requiredPath of [
      ['dist', 'index.js'],
      ['dist', 'cli', 'cli.js'],
      ['bin', 'yamlock'],
      ['README.md'],
      ['LICENSE']
    ]) {
      assert.ok(
        existsSync(join(installedRoot, ...requiredPath)),
        `Installed package is missing ${requiredPath.join('/')}.`
      );
    }
    for (const excludedPath of ['src', 'test', 'scripts', 'AGENTS.md', 'todo.tmp.md']) {
      assert.equal(
        existsSync(join(installedRoot, excludedPath)),
        false,
        `Installed package must not contain ${excludedPath}.`
      );
    }

    const apiSmoke = `
      import assert from 'node:assert/strict';
      import {
        decryptValue,
        encryptValue,
        processConfig,
        serializePath
      } from 'yamlock';

      const key = '${SMOKE_KEY}';
      const fieldPath = serializePath(['db.primary', 'token']);
      assert.equal(fieldPath, String.raw\`db\\.primary.token\`);

      const direct = encryptValue('fake-direct-secret', key, 'direct');
      assert.equal(decryptValue(direct, key, 'direct'), 'fake-direct-secret');

      const input = { 'db.primary': { token: '' }, untouched: {} };
      const encrypted = processConfig(input, {
        mode: 'encrypt',
        key,
        paths: [fieldPath]
      });
      assert.match(encrypted['db.primary'].token, /^yl\\|2\\|/);
      assert.deepEqual(
        processConfig(encrypted, { mode: 'decrypt', key, paths: [fieldPath] }),
        input
      );
    `;
    run(process.execPath, ['--input-type=module', '--eval', apiSmoke], {
      cwd: projectDirectory
    });

    const cliInput = {
      'a.b': 'fake-cli-secret',
      a: { b: 'untouched' }
    };
    const configPath = join(projectDirectory, 'config.json');
    writeFileSync(configPath, `${JSON.stringify(cliInput, null, 2)}\n`);
    const installedCli = join(installedRoot, 'bin', 'yamlock');
    const cliEnvironment = {
      ...process.env,
      YAMLOCK_TEST_SOURCE: '0'
    };
    const escapedPath = String.raw`a\.b`;

    run(process.execPath, [
      installedCli,
      'encrypt',
      configPath,
      '--key',
      SMOKE_KEY,
      '--paths',
      escapedPath
    ], { cwd: projectDirectory, env: cliEnvironment });

    const encryptedConfig = readJson(configPath);
    assert.match(encryptedConfig['a.b'], /^yl\|2\|/);
    assert.equal(encryptedConfig.a.b, 'untouched');

    run(process.execPath, [
      installedCli,
      'decrypt',
      configPath,
      '--key',
      SMOKE_KEY,
      '--paths',
      escapedPath
    ], { cwd: projectDirectory, env: cliEnvironment });
    assert.deepEqual(readJson(configPath), cliInput);

    console.log(`Package smoke passed: ${basename(archivePath)}`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
