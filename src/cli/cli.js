#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { exit } from 'node:process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

import yaml from 'js-yaml';

import { processConfig } from '../utils/config.js';
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
  version              Print the yamlock CLI version.
  algorithms           Print the list of supported cipher algorithms.
  keygen               Generate a random YAMLOCK_KEY.

Options:
  -k, --key <value>        Encryption key (or use YAMLOCK_KEY env).
  -a, --algorithm <value>  Cipher algorithm (default: aes-256-cbc).
  -o, --output <file>      Write the result to a different file (otherwise overwrites the input file).
  -p, --paths <p1,p2>      Comma-separated list of field paths to process (dot/bracket notation).
  -d, --dry-run             Show the diff without modifying files.
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
  const content = readFileSync(filePath, 'utf8');
  const format = detectFormat(filePath);

  if (format === 'yaml') {
    return { format, data: yaml.load(content) ?? {}, raw: content };
  }

  return { format, data: JSON.parse(content), raw: content };
}

function serializeConfig(format, data) {
  if (format === 'yaml') {
    return yaml.dump(data, { lineWidth: 120 });
  }

  return `${JSON.stringify(data, null, 2)}\n`;
}

function writeConfigFile(filePath, serialized) {
  writeFileSync(filePath, serialized, 'utf8');
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
    options: { dryRun: false }
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

  writeConfigFile(outputPath, serialized);
  print(`${operation === 'encrypt' ? 'Encrypted' : 'Decrypted'} values in ${outputPath}`);
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

    print('Tested algorithms (covered by yamlock fixtures):');
    tested.forEach((name) => print(`- ${name}`));

    if (additional.length > 0) {
      print('\nAdditional algorithms available in this runtime:');
      additional.forEach((name) => print(`- ${name}`));
      print('\nUse at your own risk; these ciphers are not part of the official test matrix yet.');
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
    if (command === 'encrypt') {
      const result = processConfig(config.data, {
        mode: 'encrypt',
        key,
        algorithm: options.algorithm,
        paths: options.paths
      });
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
      const result = processConfig(config.data, {
        mode: 'decrypt',
        key,
        algorithm: options.algorithm,
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
    return fail('ERR_PROCESS_FAILED', `Operation failed: ${error.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
