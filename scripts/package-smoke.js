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
const TYPESCRIPT_COMMAND = join(
  PROJECT_ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc'
);
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

function listRelativeFiles(root, relativeDirectory = '') {
  return readdirSync(join(root, relativeDirectory), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = join(relativeDirectory, entry.name);
      return entry.isDirectory()
        ? listRelativeFiles(root, relativePath)
        : [relativePath];
    });
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
      `${JSON.stringify({ name: 'yamlock-package-smoke', private: true, type: 'module' }, null, 2)}\n`
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
      ['dist', 'index.d.ts'],
      ['dist', 'cli', 'cli.js'],
      ['bin', 'yamlock'],
      ['docs', 'api.md'],
      ['docs', 'errors.md'],
      ['examples', 'basic.js'],
      ['examples', 'docs', 'ci-cd.md'],
      ['examples', 'docs', 'key-rotation.md'],
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
    const forbiddenFiles = listRelativeFiles(installedRoot).filter((filePath) => {
      const fileName = basename(filePath);
      return (
        fileName === '.DS_Store' ||
        fileName === 'AGENTS.md' ||
        fileName.endsWith('.tmp.md')
      );
    });
    assert.deepEqual(
      forbiddenFiles,
      [],
      `Installed package contains ignored local files: ${forbiddenFiles.join(', ')}`
    );

    const apiSmoke = `
      import assert from 'node:assert/strict';
      import {
        decryptValue,
        encryptValue,
        processConfig,
        serializePath,
        YAMLOCK_ERROR_CODES,
        YamlockValidationError
      } from 'yamlock';

      const key = '${SMOKE_KEY}';
      const fieldPath = serializePath(['db.primary', 'token']);
      assert.equal(fieldPath, String.raw\`db\\.primary.token\`);

      assert.throws(
        () => encryptValue(123, key, 'direct'),
        (error) => (
          error instanceof YamlockValidationError &&
          error.code === YAMLOCK_ERROR_CODES.INVALID_VALUE
        )
      );

      const direct = encryptValue('fake-direct-secret', key, 'direct');
      assert.equal(decryptValue(direct, key, 'direct'), 'fake-direct-secret');

      const frozenLegacy = 'yl|aes-256-cbc|c2VydmljZXMuZGIucGFzc3dvcmQ=|E886OCFEAQv+T29mFkDTJg==|ufswWXlx35Y230s/dIXCiUZxi8RlgcrtjqOzLq/Ew9Y=';
      assert.equal(
        decryptValue(
          frozenLegacy,
          'unit-test-secret-key',
          'services.db.password'
        ),
        'legacy-fixture-value'
      );

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

    writeFileSync(
      join(projectDirectory, 'consumer.ts'),
      readFileSync(join(PROJECT_ROOT, 'fixtures', 'types', 'consumer.ts'), 'utf8')
    );
    writeFileSync(
      join(projectDirectory, 'tsconfig.json'),
      `${JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2022',
          typeRoots: [join(PROJECT_ROOT, 'node_modules', '@types')],
          types: ['node']
        },
        files: ['consumer.ts']
      }, null, 2)}\n`
    );
    run(TYPESCRIPT_COMMAND, ['--project', 'tsconfig.json'], {
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

    const helpResult = run(process.execPath, [installedCli, '--help'], {
      cwd: projectDirectory,
      env: cliEnvironment
    });
    assert.match(helpResult.stdout, /Usage:\s+yamlock <command>/);

    const versionResult = run(process.execPath, [installedCli, 'version'], {
      cwd: projectDirectory,
      env: cliEnvironment
    });
    assert.equal(versionResult.stdout.trim(), `yamlock ${sourcePackage.version}`);

    const algorithmsResult = run(process.execPath, [installedCli, 'algorithms'], {
      cwd: projectDirectory,
      env: cliEnvironment
    });
    assert.match(algorithmsResult.stdout, /Default v2 profile: aes-256-gcm with scrypt/);

    const exampleResult = run(process.execPath, [join(installedRoot, 'examples', 'basic.js')], {
      cwd: projectDirectory,
      env: {
        ...cliEnvironment,
        YAMLOCK_KEY: 'example-package-smoke-key'
      }
    });
    assert.match(exampleResult.stdout, /Encrypted payload: yl\|2\|/);
    assert.match(exampleResult.stdout, /Decrypted value: swordfish/);

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
