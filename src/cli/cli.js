#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { exit } from 'node:process';

import yaml from 'js-yaml';

import { processConfig } from '../utils/config.js';

const HELP_TEXT = `
░█░█░█▀█░█▄░▄█░█░░░█▀█░█▀▀░█░█░
░░█░░█▀█░█░▀░█░█░░░█░█░█░░░█▀▄░
░░▀░░▀░▀░▀░░░▀░▀▀▀░▀▀▀░▀▀▀░▀░▀░

Usage:
yamlock <command> [options]

Commands:
  encrypt <file>   Encrypt string values in the given YAML/JSON file.
  decrypt <file>   Decrypt string values in the given YAML/JSON file.

Options:
  -k, --key <value>        Encryption key (or use YAMLOCK_KEY env).
  -a, --algorithm <value>  Cipher algorithm (default: aes-256-cbc).
`;

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

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    command: args[0],
    file: args[1],
    options: {}
  };

  for (let i = 2; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '-k' || arg === '--key') {
      result.options.key = next;
      i += 1;
    } else if (arg === '-a' || arg === '--algorithm') {
      result.options.algorithm = next;
      i += 1;
    }
  }

  return result;
}

async function main() {
  const { command, file, options } = parseArgs(process.argv);

  if (!command || !file) {
    print(HELP_TEXT.trim());
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

  try {
    if (command === 'encrypt') {
      const result = processConfig(config.data, { mode: 'encrypt', key, algorithm: options.algorithm });
      writeConfigFile(absolutePath, config.format, result);
      print(`Encrypted values in ${file}`);
      return exit(0);
    }

    if (command === 'decrypt') {
      const result = processConfig(config.data, { mode: 'decrypt', key });
      writeConfigFile(absolutePath, config.format, result);
      print(`Decrypted values in ${file}`);
      return exit(0);
    }

    printError(`Unknown command: ${command}`);
    print(HELP_TEXT.trim());
    return exit(1);
  } catch (error) {
    printError(`Operation failed: ${error.message}`);
    return exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
