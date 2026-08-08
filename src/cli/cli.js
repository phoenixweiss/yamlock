#!/usr/bin/env node
import {
  closeSync,
  fchmodSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { exit } from 'node:process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import yaml from 'js-yaml';

import { processConfig } from '../utils/config.js';
import { migrateConfig } from '../utils/migrate.js';
import { listSupportedAlgorithms, TESTED_ALGORITHMS } from '../crypto/utils.js';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

const BANNER = `
░█░█░█▀█░█▄░▄█░█░░░█▀█░█▀▀░█░█░
░░█░░█▀█░█░▀░█░█░░░█░█░█░░░█▀▄░
░░▀░░▀░▀░▀░░░▀░▀▀▀░▀▀▀░▀▀▀░▀░▀░`;

function getHelpText() {
  return `${BANNER}
Version: ${packageJson.version}

Usage:
yamlock <command> [options]

Commands:
  encrypt <file>       Encrypt string values in the given YAML/JSON file.
  decrypt <file>       Decrypt string values in the given YAML/JSON file.
  migrate <file>       Migrate selected legacy payloads to authenticated v2.
  version              Print the yamlock CLI version.
  algorithms           Print the list of supported cipher algorithms.
  keygen               Generate a random YAMLOCK_KEY.

Options:
  -k, --key <value>        Encryption key (or use YAMLOCK_KEY env).
  -a, --algorithm <value>  Legacy cipher algorithm (encrypt --legacy only).
  -o, --output <file>      Write the result to a different file (otherwise overwrites the input file).
  -p, --paths <p1,p2>      Comma-separated list of field paths to process (dot/bracket notation).
  -d, --dry-run             Preview the operation without modifying files.
  --allow-mixed            (migrate) Authenticate and preserve selected v2 values.
  --no-backup              (migrate) Replace the input without creating <file>.yamlock.bak.
  --legacy                 (encrypt) Write the legacy v1 format for compatibility.
  --error-on-encrypted     (encrypt) Fail if a selected value is already encrypted.
  --force-encrypt          (encrypt) Encrypt selected yl|... strings as plaintext.
  --length <bytes>         (keygen) Number of random bytes to generate (default: 32).
  --format <hex|base64>    (keygen) Output format (default: base64).
`;
}

function print(message) {
  console.log(message);
}

function printError(message) {
  console.error(message);
}

function detectFormat(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.yaml' || extension === '.yml') {
    return 'yaml';
  }

  return 'json';
}

function readConfigFile(filePath) {
  const stat = lstatSync(filePath);
  const content = readFileSync(filePath, 'utf8');
  const format = detectFormat(filePath);

  if (format === 'yaml') {
    return { format, data: yaml.load(content) ?? {}, raw: content, stat };
  }

  return { format, data: JSON.parse(content), raw: content, stat };
}

function serializeConfig(format, data) {
  if (format === 'yaml') {
    return yaml.dump(data, { lineWidth: 120 });
  }

  return `${JSON.stringify(data, null, 2)}\n`;
}

function writeConfigFileAtomically(filePath, serialized, { mode, refuseExisting = false } = {}) {
  const temporaryPath = join(
    dirname(filePath),
    `.${basename(filePath)}.yamlock-${process.pid}-${randomBytes(8).toString('hex')}.tmp`
  );
  let fileDescriptor;

  try {
    fileDescriptor = openSync(temporaryPath, 'wx', 0o600);
    writeFileSync(fileDescriptor, serialized, 'utf8');
    if (mode !== undefined) {
      fchmodSync(fileDescriptor, mode);
    }
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;

    if (refuseExisting) {
      linkSync(temporaryPath, filePath);
      unlinkSync(temporaryPath);
      return;
    }

    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }

    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temporary file may already have been renamed or removed.
    }
    throw error;
  }
}

function parsePaths(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    command: args[0],
    file: undefined,
    options: {
      dryRun: false,
      allowMixed: false,
      noBackup: false,
      legacy: false,
      errorOnEncrypted: false,
      forceEncrypt: false
    }
  };

  let index = 1;
  const potentialFile = args[1];
  if (potentialFile && !potentialFile.startsWith('-')) {
    result.file = potentialFile;
    index = 2;
  } else {
    index = 1;
  }

  for (let i = index; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '-k' || arg === '--key') {
      result.options.key = next;
      i += 1;
    } else if (arg === '-a' || arg === '--algorithm') {
      result.options.algorithm = next;
      i += 1;
    } else if (arg === '-o' || arg === '--output') {
      result.options.output = next;
      i += 1;
    } else if (arg === '-p' || arg === '--paths') {
      result.options.paths = parsePaths(next);
      i += 1;
    } else if (arg === '--length') {
      result.options.length = next;
      i += 1;
    } else if (arg === '--format') {
      result.options.format = next;
      i += 1;
    } else if (arg === '-d' || arg === '--dry-run') {
      result.options.dryRun = true;
    } else if (arg === '--allow-mixed') {
      result.options.allowMixed = true;
    } else if (arg === '--no-backup') {
      result.options.noBackup = true;
    } else if (arg === '--legacy') {
      result.options.legacy = true;
    } else if (arg === '--error-on-encrypted') {
      result.options.errorOnEncrypted = true;
    } else if (arg === '--force-encrypt') {
      result.options.forceEncrypt = true;
    }
  }

  if (result.options.dryRun && result.command && !result.file && !['version', 'algorithms', 'keygen'].includes(result.command)) {
    // dry-run without file is invalid, but we'll let later validation handle file requirement
  }

  return result;
}

function generateRandomKey(length, format) {
  const size = Number.isFinite(length) && length > 0 ? Math.floor(length) : 32;
  const buffer = randomBytes(size);
  if (format === 'hex') {
    return buffer.toString('hex');
  }
  return buffer.toString('base64');
}

function fail(code, message) {
  printError(`[yamlock:${code}] ${message}`);
  return exit(1);
}

function cliError(code, message) {
  return Object.assign(new Error(message), { code });
}

function handleWrite({ dryRun, file, outputPath, format, originalRaw, data, operation }) {
  const serialized = serializeConfig(format, data);
  if (dryRun) {
    print(`DRY-RUN (${operation}) ${file}`);
    print('--- original');
    print((originalRaw ?? '').trimEnd());
    print('+++ result');
    print(serialized.trimEnd());
    if (outputPath !== file) {
      print(`(would write to ${outputPath})`);
    }
    print('No files were modified.');
    return;
  }

  writeFileSync(outputPath, serialized, 'utf8');
  print(`${operation === 'encrypt' ? 'Encrypted' : 'Decrypted'} values in ${outputPath}`);
}

function validateMigrationSource(filePath, config) {
  if (config.stat.isSymbolicLink()) {
    throw cliError(
      'ERR_MIGRATION_UNSAFE_INPUT',
      'Migration input must not be a symbolic link.'
    );
  }

  if (!config.stat.isFile()) {
    throw cliError(
      'ERR_MIGRATION_UNSAFE_INPUT',
      'Migration input must be a regular file.'
    );
  }

  const currentStat = lstatSync(filePath);
  const currentRaw = readFileSync(filePath, 'utf8');
  if (
    !currentStat.isFile() ||
    currentStat.isSymbolicLink() ||
    currentStat.dev !== config.stat.dev ||
    currentStat.ino !== config.stat.ino ||
    currentStat.mode !== config.stat.mode ||
    currentRaw !== config.raw
  ) {
    throw cliError(
      'ERR_MIGRATION_INPUT_CHANGED',
      'Migration input changed after it was read.'
    );
  }
}

function handleMigration({ file, absolutePath, outputPath, config, key, options }) {
  if (options.algorithm !== undefined) {
    throw cliError('ERR_INVALID_OPTION', 'migrate does not accept --algorithm.');
  }

  if (options.legacy) {
    throw cliError('ERR_INVALID_OPTION', 'migrate does not accept --legacy.');
  }

  if (options.errorOnEncrypted) {
    throw cliError(
      'ERR_INVALID_OPTION',
      'migrate does not accept --error-on-encrypted.'
    );
  }

  if (options.forceEncrypt) {
    throw cliError('ERR_INVALID_OPTION', 'migrate does not accept --force-encrypt.');
  }

  validateMigrationSource(absolutePath, config);
  const result = migrateConfig(config.data, {
    key,
    paths: options.paths,
    allowMixed: options.allowMixed
  });
  const serialized = serializeConfig(config.format, result.data);

  if (!result.changed) {
    print(`No legacy values required migration; authenticated ${result.stats.preservedV2} v2 value(s).`);
    print('No files were modified.');
    return;
  }

  if (options.dryRun) {
    print(`DRY-RUN (migrate) ${file}`);
    print(`Would migrate ${result.stats.migrated} legacy value(s) and preserve ${result.stats.preservedV2} v2 value(s).`);
    if (outputPath === absolutePath && !options.noBackup) {
      print(`Would create backup ${absolutePath}.yamlock.bak.`);
    }
    print(`Would write to ${outputPath}.`);
    print('No files were modified.');
    return;
  }

  validateMigrationSource(absolutePath, config);
  const inPlace = outputPath === absolutePath;
  let backupPath;
  if (inPlace && !options.noBackup) {
    backupPath = `${absolutePath}.yamlock.bak`;
    try {
      writeConfigFileAtomically(backupPath, config.raw, {
        mode: config.stat.mode & 0o7777,
        refuseExisting: true
      });
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw cliError(
          'ERR_MIGRATION_BACKUP_EXISTS',
          `Backup already exists: ${backupPath}`
        );
      }
      throw error;
    }
  }

  try {
    writeConfigFileAtomically(outputPath, serialized, {
      mode: config.stat.mode & 0o7777,
      refuseExisting: !inPlace
    });
  } catch (error) {
    if (!inPlace && error.code === 'EEXIST') {
      throw cliError(
        'ERR_MIGRATION_OUTPUT_EXISTS',
        `Migration output already exists: ${outputPath}`
      );
    }
    throw error;
  }
  print(`Migrated ${result.stats.migrated} legacy value(s) to v2 in ${outputPath}.`);
  if (result.stats.preservedV2 > 0) {
    print(`Authenticated and preserved ${result.stats.preservedV2} existing v2 value(s).`);
  }
  if (backupPath) {
    print(`Backup: ${backupPath}`);
  } else if (inPlace) {
    print('Backup disabled by --no-backup.');
  } else {
    print('Source file was preserved; no backup was created.');
  }
}

export async function runCli(argv = process.argv) {
  const { command, file, options } = parseArgs(argv);

  if (!command) {
    print(getHelpText().trim());
    return exit(1);
  }

  if (command === 'version') {
    print(`yamlock ${packageJson.version}`);
    return exit(0);
  }

  if (command === 'algorithms') {
    const algorithms = listSupportedAlgorithms();
    const tested = TESTED_ALGORITHMS.slice().sort();
    const testedSet = new Set(tested);
    const additional = algorithms.filter((name) => !testedSet.has(name));

    print('Default v2 profile: aes-256-gcm with scrypt.');
    print('\nTested legacy algorithms (covered by yamlock fixtures):');
    tested.forEach((name) => print(`- ${name}`));

    if (additional.length > 0) {
      print('\nAdditional algorithms available in this runtime:');
      additional.forEach((name) => print(`- ${name}`));
      print('\nAdditional ciphers require explicit legacy mode and are not part of the official test matrix.');
    }
    return exit(0);
  }

  if (command === 'keygen') {
    const desiredLength = options.length ? Number(options.length) : 32;
    const normalizedFormat = (options.format ?? 'base64').toLowerCase();

    if (!Number.isFinite(desiredLength) || desiredLength <= 0) {
      return fail('ERR_INVALID_LENGTH', 'Key length must be a positive number.');
    }

    if (!['base64', 'hex'].includes(normalizedFormat)) {
      return fail('ERR_INVALID_FORMAT', 'Key format must be either "base64" or "hex".');
    }

    const keyValue = generateRandomKey(desiredLength, normalizedFormat);
    print(`Generated key (${normalizedFormat}, ${Math.floor(desiredLength)} bytes of entropy):`);
    print(keyValue);
    print('\nStore it securely, e.g.');
    print(`  export YAMLOCK_KEY="${keyValue}"`);
    print('  # or place in an .env file as YAMLOCK_KEY=your-key');
    return exit(0);
  }

  if (!file) {
    print(getHelpText().trim());
    return fail('ERR_FILE_REQUIRED', 'A file path is required for this command.');
  }

  const key = options.key ?? process.env.YAMLOCK_KEY;
  if (!key) {
    return fail('ERR_MISSING_KEY', 'Encryption key is required via --key or YAMLOCK_KEY.');
  }

  const absolutePath = resolve(process.cwd(), file);
  let config;
  try {
    config = readConfigFile(absolutePath);
  } catch (error) {
    return fail('ERR_READ_FAILED', `Failed to read config file: ${error.message}`);
  }

  const outputPath = options.output
    ? resolve(process.cwd(), options.output)
    : absolutePath;

  try {
    if (command === 'migrate') {
      handleMigration({
        file,
        absolutePath,
        outputPath,
        config,
        key,
        options
      });
      return exit(0);
    }

    if (command === 'encrypt') {
      if (options.algorithm !== undefined && !options.legacy) {
        throw cliError(
          'ERR_INVALID_OPTION',
          'encrypt requires --legacy when --algorithm is provided.'
        );
      }
      if (options.errorOnEncrypted && options.forceEncrypt) {
        throw cliError(
          'ERR_INVALID_OPTION',
          'encrypt cannot combine --error-on-encrypted with --force-encrypt.'
        );
      }

      const result = processConfig(config.data, {
        mode: 'encrypt',
        key,
        algorithm: options.algorithm,
        formatVersion: options.legacy ? 1 : 2,
        existingPayloadPolicy: options.forceEncrypt
          ? 'encrypt'
          : options.errorOnEncrypted
            ? 'error'
            : 'preserve',
        paths: options.paths
      });
      if (outputPath === absolutePath && isDeepStrictEqual(result, config.data)) {
        print('No plaintext values required encryption. No files were modified.');
        return exit(0);
      }
      handleWrite({
        dryRun: options.dryRun,
        file,
        outputPath,
        format: config.format,
        originalRaw: config.raw,
        data: result,
        operation: 'encrypt'
      });
      return exit(0);
    }

    if (command === 'decrypt') {
      if (options.legacy) {
        throw cliError('ERR_INVALID_OPTION', 'decrypt does not accept --legacy.');
      }

      if (options.algorithm !== undefined) {
        throw cliError(
          'ERR_INVALID_OPTION',
          'decrypt infers the algorithm from the payload and does not accept --algorithm.'
        );
      }

      if (options.errorOnEncrypted) {
        throw cliError(
          'ERR_INVALID_OPTION',
          'decrypt does not accept --error-on-encrypted.'
        );
      }

      if (options.forceEncrypt) {
        throw cliError('ERR_INVALID_OPTION', 'decrypt does not accept --force-encrypt.');
      }

      const result = processConfig(config.data, {
        mode: 'decrypt',
        key,
        paths: options.paths
      });
      handleWrite({
        dryRun: options.dryRun,
        file,
        outputPath,
        format: config.format,
        originalRaw: config.raw,
        data: result,
        operation: 'decrypt'
      });
      return exit(0);
    }

    print(getHelpText().trim());
    return fail('ERR_UNKNOWN_COMMAND', `Unknown command: ${command}`);
  } catch (error) {
    const code = typeof error.code === 'string' && error.code.startsWith('ERR_')
      ? error.code
      : command === 'migrate'
        ? 'ERR_MIGRATION_FAILED'
        : 'ERR_PROCESS_FAILED';
    return fail(code, `Operation failed: ${error.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
