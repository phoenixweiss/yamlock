#!/usr/bin/env node
import {
  lstatSync,
  readFileSync
} from 'node:fs';
import { extname, resolve } from 'node:path';
import { exit } from 'node:process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import yaml from 'js-yaml';

import { processConfig } from '../utils/config.js';
import { writeFileAtomically } from '../utils/file.js';
import { migrateConfig } from '../utils/migrate.js';
import { compilePathPatterns } from '../utils/path-pattern.js';
import { listSupportedAlgorithms, TESTED_ALGORITHMS } from '../crypto/utils.js';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

const BANNER = `
[yamlock]
Plaintext ends here.
`;

const KEYGEN_MIN_LENGTH = 1;
const KEYGEN_MAX_LENGTH = 4096;
const FILE_COMMANDS = new Set(['encrypt', 'decrypt', 'migrate']);
const OPTION_SPECS = [
  { key: 'key', names: ['-k', '--key'], takesValue: true },
  { key: 'algorithm', names: ['-a', '--algorithm'], takesValue: true },
  { key: 'output', names: ['-o', '--output'], takesValue: true },
  { key: 'paths', names: ['-p', '--paths'], takesValue: true },
  { key: 'pathPatterns', names: ['--path-patterns'], takesValue: true },
  { key: 'dryRun', names: ['-d', '--dry-run'], takesValue: false },
  { key: 'allowMixed', names: ['--allow-mixed'], takesValue: false },
  { key: 'noBackup', names: ['--no-backup'], takesValue: false },
  { key: 'legacy', names: ['--legacy'], takesValue: false },
  { key: 'errorOnEncrypted', names: ['--error-on-encrypted'], takesValue: false },
  { key: 'forceEncrypt', names: ['--force-encrypt'], takesValue: false },
  { key: 'length', names: ['--length'], takesValue: true },
  { key: 'format', names: ['--format'], takesValue: true }
];
const OPTION_BY_NAME = new Map(
  OPTION_SPECS.flatMap((spec) => spec.names.map((name) => [name, spec]))
);
const OPTION_LABELS = new Map(
  OPTION_SPECS.map((spec) => [spec.key, spec.names.at(-1)])
);
const COMMAND_OPTIONS = new Map([
  ['encrypt', new Set([
    'key',
    'algorithm',
    'output',
    'paths',
    'pathPatterns',
    'dryRun',
    'legacy',
    'errorOnEncrypted',
    'forceEncrypt'
  ])],
  ['decrypt', new Set(['key', 'output', 'paths', 'pathPatterns', 'dryRun'])],
  ['migrate', new Set([
    'key',
    'output',
    'paths',
    'pathPatterns',
    'dryRun',
    'allowMixed',
    'noBackup'
  ])],
  ['keygen', new Set(['length', 'format'])],
  ['help', new Set()],
  ['version', new Set()],
  ['algorithms', new Set()]
]);

function getHelpText() {
  return `${BANNER}
Version: ${packageJson.version}

Usage:
yamlock <command> [options]

Commands:
  encrypt <file>       Encrypt string values in the given YAML/JSON file.
  decrypt <file>       Decrypt string values in the given YAML/JSON file.
  migrate <file>       Migrate selected legacy payloads to authenticated v2.
  help                 Show this help text.
  version              Print the yamlock CLI version.
  algorithms           Print the list of supported cipher algorithms.
  keygen               Generate a random YAMLOCK_KEY.

Options:
  -k, --key <value>        Encryption key (or use YAMLOCK_KEY env).
  -a, --algorithm <value>  Legacy cipher algorithm (encrypt --legacy only).
  -o, --output <file>      Write the result to a different file (otherwise overwrites the input file).
  -p, --paths <p1,p2>      Comma-separated escaped field paths to process (dot/bracket notation).
  --path-patterns <p1,p2>  Structural selectors using *, [*], and ** whole-segment wildcards.
  -d, --dry-run             Preview the operation without modifying files.
  --allow-mixed            (migrate) Authenticate and preserve selected v2 values.
  --no-backup              (migrate) Replace the input without creating <file>.yamlock.bak.
  --legacy                 (encrypt) Write the legacy v1 format for compatibility.
  --error-on-encrypted     (encrypt) Fail if a selected value is already encrypted.
  --force-encrypt          (encrypt) Encrypt selected yl|... strings as plaintext.
  --length <bytes>         (keygen) Random bytes to generate, 1-${KEYGEN_MAX_LENGTH} (default: 32).
  --format <hex|base64>    (keygen) Output format (default: base64).
  -h, --help               Show this help text.

YAML rewrite note:
  Comments, anchors/aliases, explicit tags, quoting, and formatting are not
  preserved byte-for-byte. Use --dry-run or --output before replacing a file.

Path syntax:
  Object-key backslashes, dots, brackets, and commas must be backslash-escaped.
  Example: db\\.primary.token selects { "db.primary": { "token": ... } }.
  Patterns are separate selectors; e.g. services.*.token or users[*].token.
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

function describeReadFailure(error) {
  if (typeof error?.reason === 'string') {
    const line = Number.isInteger(error.mark?.line) ? error.mark.line + 1 : null;
    const column = Number.isInteger(error.mark?.column) ? error.mark.column + 1 : null;
    const location = line && column ? ` at line ${line}, column ${column}` : '';
    return `Invalid YAML: ${error.reason}${location}.`;
  }

  if (error instanceof SyntaxError) {
    return 'Invalid JSON syntax.';
  }

  const fileErrors = {
    EACCES: 'Input file is not readable.',
    EISDIR: 'Input path is a directory, not a file.',
    ENOENT: 'Input file does not exist.'
  };
  return fileErrors[error?.code] ?? 'Unable to read or parse the input file.';
}

function serializeConfig(format, data) {
  if (format === 'yaml') {
    return yaml.dump(data, { lineWidth: 120 });
  }

  return `${JSON.stringify(data, null, 2)}\n`;
}

function splitPathList(value) {
  if (!value) {
    return [];
  }

  const paths = [];
  let current = '';
  let escaped = false;

  for (const character of String(value)) {
    if (character === ',' && !escaped) {
      paths.push(current);
      current = '';
      continue;
    }

    current += character;
    if (escaped) {
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    }
  }
  paths.push(current);

  return paths.map((segment) => segment.trim());
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const commandAliases = new Map([
    ['-h', 'help'],
    ['--help', 'help']
  ]);
  const result = {
    command: commandAliases.get(args[0]) ?? args[0],
    file: undefined,
    options: {
      dryRun: false,
      allowMixed: false,
      noBackup: false,
      legacy: false,
      errorOnEncrypted: false,
      forceEncrypt: false
    },
    specifiedOptions: new Set()
  };

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    const spec = OPTION_BY_NAME.get(arg);

    if (spec) {
      if (result.specifiedOptions.has(spec.key)) {
        throw cliError('ERR_DUPLICATE_OPTION', `Option ${OPTION_LABELS.get(spec.key)} was provided more than once.`);
      }
      result.specifiedOptions.add(spec.key);

      if (!spec.takesValue) {
        result.options[spec.key] = true;
        continue;
      }

      const next = args[i + 1];
      const negativeLength = spec.key === 'length' && /^-\d/.test(next ?? '');
      if (
        next === undefined ||
        next === '' ||
        (next.startsWith('-') && !negativeLength)
      ) {
        throw cliError(
          'ERR_MISSING_OPTION_VALUE',
          `Option ${OPTION_LABELS.get(spec.key)} requires a value.`
        );
      }

      if (spec.key === 'paths' || spec.key === 'pathPatterns') {
        const splitSelectors = splitPathList(next);
        const selectors = spec.key === 'pathPatterns'
          ? splitSelectors
          : splitSelectors.filter((selector) => selector.length > 0);
        if (
          selectors.length === 0 ||
          (spec.key === 'pathPatterns' && selectors.some((selector) => selector.length === 0))
        ) {
          throw cliError(
            spec.key === 'pathPatterns'
              ? 'ERR_INVALID_PATH_PATTERNS'
              : 'ERR_INVALID_OPTION_VALUE',
            `Option ${OPTION_LABELS.get(spec.key)} requires at least one non-empty selector.`
          );
        }
        if (spec.key === 'pathPatterns') {
          compilePathPatterns(selectors);
        }
        result.options[spec.key] = selectors;
      } else {
        result.options[spec.key] = next;
      }
      i += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw cliError('ERR_UNKNOWN_OPTION', `Unknown option: ${arg}`);
    }

    if (result.file !== undefined) {
      throw cliError('ERR_UNEXPECTED_ARGUMENT', `Unexpected argument: ${arg}`);
    }
    result.file = arg;
  }

  return result;
}

function validateCommandLine({ command, file, specifiedOptions }) {
  const allowedOptions = COMMAND_OPTIONS.get(command);
  if (!allowedOptions) {
    throw cliError('ERR_UNKNOWN_COMMAND', `Unknown command: ${command}`);
  }

  for (const option of specifiedOptions) {
    if (!allowedOptions.has(option)) {
      throw cliError(
        'ERR_INVALID_OPTION',
        `${command} does not accept ${OPTION_LABELS.get(option)}.`
      );
    }
  }

  if (!FILE_COMMANDS.has(command) && file !== undefined) {
    throw cliError('ERR_UNEXPECTED_ARGUMENT', `${command} does not accept a file argument.`);
  }
}

function parseKeyLength(value) {
  const rawValue = String(value);
  if (!/^\d+$/.test(rawValue)) {
    throw cliError(
      'ERR_INVALID_LENGTH',
      `Key length must be an integer between ${KEYGEN_MIN_LENGTH} and ${KEYGEN_MAX_LENGTH} bytes.`
    );
  }

  const length = Number(rawValue);
  if (
    !Number.isSafeInteger(length) ||
    length < KEYGEN_MIN_LENGTH ||
    length > KEYGEN_MAX_LENGTH
  ) {
    throw cliError(
      'ERR_INVALID_LENGTH',
      `Key length must be an integer between ${KEYGEN_MIN_LENGTH} and ${KEYGEN_MAX_LENGTH} bytes.`
    );
  }

  return length;
}

function generateRandomKey(length, format) {
  const buffer = randomBytes(length);
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

function validateOperationSource(filePath, config) {
  if (config.stat.isSymbolicLink() || !config.stat.isFile()) {
    throw cliError('ERR_UNSAFE_INPUT', 'Input must be a regular file, not a symbolic link.');
  }

  let currentStat;
  let currentRaw;
  try {
    currentStat = lstatSync(filePath);
    currentRaw = readFileSync(filePath, 'utf8');
  } catch {
    throw cliError('ERR_INPUT_CHANGED', 'Input changed after it was read; no file was replaced.');
  }
  if (
    !currentStat.isFile() ||
    currentStat.isSymbolicLink() ||
    currentStat.dev !== config.stat.dev ||
    currentStat.ino !== config.stat.ino ||
    currentStat.mode !== config.stat.mode ||
    currentRaw !== config.raw
  ) {
    throw cliError('ERR_INPUT_CHANGED', 'Input changed after it was read; no file was replaced.');
  }
}

function resolveOutputMode(outputPath, sourceMode) {
  try {
    const outputStat = lstatSync(outputPath);
    if (outputStat.isSymbolicLink() || !outputStat.isFile()) {
      throw cliError('ERR_UNSAFE_OUTPUT', 'Output must be a regular file, not a symbolic link.');
    }
    return outputStat.mode & 0o7777;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sourceMode;
    }
    throw error;
  }
}

function handleWrite({ dryRun, file, absolutePath, outputPath, config, data, operation }) {
  const serialized = serializeConfig(config.format, data);
  if (dryRun) {
    print(`DRY-RUN (${operation}) ${file}`);
    print('--- original');
    print((config.raw ?? '').trimEnd());
    print('+++ result');
    print(serialized.trimEnd());
    if (outputPath !== absolutePath) {
      print(`(would write to ${outputPath})`);
    }
    print('No files were modified.');
    return;
  }

  const sourceMode = config.stat.mode & 0o7777;
  const inPlace = outputPath === absolutePath;
  validateOperationSource(absolutePath, config);
  const outputMode = inPlace
    ? sourceMode
    : resolveOutputMode(outputPath, sourceMode);

  writeFileAtomically(outputPath, serialized, { mode: outputMode });
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
  validateMigrationSource(absolutePath, config);
  const result = migrateConfig(config.data, {
    key,
    paths: options.paths,
    pathPatterns: options.pathPatterns,
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
      writeFileAtomically(backupPath, config.raw, {
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
    writeFileAtomically(outputPath, serialized, {
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
  let parsed;
  try {
    parsed = parseArgs(argv);
    if (parsed.command) {
      validateCommandLine(parsed);
    }
  } catch (error) {
    const code = typeof error.code === 'string' && error.code.startsWith('ERR_')
      ? error.code
      : 'ERR_INVALID_ARGUMENTS';
    return fail(code, error.message);
  }

  const { command, file, options } = parsed;

  if (!command || command === 'help') {
    print(getHelpText().trimEnd());
    return exit(0);
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
    let desiredLength;
    try {
      desiredLength = options.length === undefined ? 32 : parseKeyLength(options.length);
    } catch (error) {
      return fail(error.code ?? 'ERR_INVALID_LENGTH', error.message);
    }
    const normalizedFormat = (options.format ?? 'base64').toLowerCase();

    if (!['base64', 'hex'].includes(normalizedFormat)) {
      return fail('ERR_INVALID_FORMAT', 'Key format must be either "base64" or "hex".');
    }

    const keyValue = generateRandomKey(desiredLength, normalizedFormat);
    print(`Generated key (${normalizedFormat}, ${desiredLength} bytes of entropy):`);
    print(keyValue);
    print('\nStore it securely, e.g.');
    print(`  export YAMLOCK_KEY="${keyValue}"`);
    print('  # or place in an .env file as YAMLOCK_KEY=your-key');
    return exit(0);
  }

  if (!file) {
    print(getHelpText().trimEnd());
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
    return fail('ERR_READ_FAILED', describeReadFailure(error));
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
        paths: options.paths,
        pathPatterns: options.pathPatterns
      });
      if (outputPath === absolutePath && isDeepStrictEqual(result, config.data)) {
        print('No plaintext values required encryption. No files were modified.');
        return exit(0);
      }
      handleWrite({
        dryRun: options.dryRun,
        file,
        absolutePath,
        outputPath,
        config,
        data: result,
        operation: 'encrypt'
      });
      return exit(0);
    }

    if (command === 'decrypt') {
      const result = processConfig(config.data, {
        mode: 'decrypt',
        key,
        paths: options.paths,
        pathPatterns: options.pathPatterns
      });
      handleWrite({
        dryRun: options.dryRun,
        file,
        absolutePath,
        outputPath,
        config,
        data: result,
        operation: 'decrypt'
      });
      return exit(0);
    }

    print(getHelpText().trimEnd());
    return fail('ERR_UNKNOWN_COMMAND', `Unknown command: ${command}`);
  } catch (error) {
    const structuredCode = typeof error.code === 'string' && error.code.startsWith('ERR_')
      ? error.code
      : null;
    const isMigrationCode = structuredCode === 'ERR_INVALID_PATH_PATTERNS' ||
      structuredCode?.startsWith('ERR_MIGRATION_');
    const code = command === 'migrate'
      ? isMigrationCode
        ? structuredCode
        : 'ERR_MIGRATION_FAILED'
      : structuredCode ?? 'ERR_PROCESS_FAILED';
    return fail(code, `Operation failed: ${error.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
