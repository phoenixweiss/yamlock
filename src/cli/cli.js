#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { exit } from 'node:process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

import yaml from 'js-yaml';

import { processConfig } from '../utils/config.js';
import { listSupportedAlgorithms } from '../crypto/utils.js';

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
    return { format, data: yaml.load(content) ?? {} };
  }

  return { format, data: JSON.parse(content) };
}

function writeConfigFile(filePath, format, data) {
  if (format === 'yaml') {
    const serialized = yaml.dump(data, { lineWidth: 120 });
    writeFileSync(filePath, serialized, 'utf8');
    return;
  }

  const serialized = JSON.stringify(data, null, 2);
  writeFileSync(filePath, `${serialized}\n`, 'utf8');
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
    options: {}
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
    }
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
    print('Supported algorithms:');
    algorithms.forEach((name) => print(`- ${name}`));
    return exit(0);
  }

  if (command === 'keygen') {
    const desiredLength = options.length ? Number(options.length) : 32;
    const normalizedFormat = (options.format ?? 'base64').toLowerCase();

    if (!Number.isFinite(desiredLength) || desiredLength <= 0) {
      printError('Key length must be a positive number.');
      return exit(1);
    }

    if (!['base64', 'hex'].includes(normalizedFormat)) {
      printError('Key format must be either "base64" or "hex".');
      return exit(1);
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
    printError('A file path is required for this command.');
    print(getHelpText().trim());
    return exit(1);
  }

  const key = options.key ?? process.env.YAMLOCK_KEY;
  if (!key) {
    printError('Encryption key is required via --key or YAMLOCK_KEY.');
    return exit(1);
  }

  const absolutePath = resolve(process.cwd(), file);
  let config;
  try {
    config = readConfigFile(absolutePath);
  } catch (error) {
    printError(`Failed to read config file: ${error.message}`);
    return exit(1);
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
      writeConfigFile(outputPath, config.format, result);
      print(`Encrypted values in ${outputPath === absolutePath ? file : options.output}`);
      return exit(0);
    }

    if (command === 'decrypt') {
      const result = processConfig(config.data, {
        mode: 'decrypt',
        key,
        algorithm: options.algorithm,
        paths: options.paths
      });
      writeConfigFile(outputPath, config.format, result);
      print(`Decrypted values in ${outputPath === absolutePath ? file : options.output}`);
      return exit(0);
    }

    printError(`Unknown command: ${command}`);
    print(getHelpText().trim());
    return exit(1);
  } catch (error) {
    printError(`Operation failed: ${error.message}`);
    return exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
