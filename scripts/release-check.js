import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateReleaseState({ packageVersion, changelog, tag }) {
  assert.match(
    packageVersion,
    SEMVER_PATTERN,
    `package.json contains an invalid semantic version: ${packageVersion}`
  );
  assert.match(changelog, /^## \[Unreleased\]\s*$/m, 'CHANGELOG.md is missing [Unreleased].');
  assert.match(
    changelog,
    new RegExp(`^## \\[${escapeRegExp(packageVersion)}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`, 'm'),
    `CHANGELOG.md is missing a dated ${packageVersion} release heading.`
  );

  if (tag !== undefined) {
    assert.equal(
      tag,
      packageVersion,
      `Release tag ${tag} does not match package version ${packageVersion}.`
    );
  }
}

function parseTag(argv) {
  if (argv.length === 0) {
    return undefined;
  }

  if (argv.length !== 2 || argv[0] !== '--tag' || argv[1].length === 0) {
    throw new Error('Usage: yarn check:release [--tag <version>]');
  }

  return argv[1];
}

function main() {
  const packageJson = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'package.json'), 'utf8'));
  const changelog = readFileSync(resolve(PROJECT_ROOT, 'CHANGELOG.md'), 'utf8');
  const tag = parseTag(process.argv.slice(2));

  validateReleaseState({
    packageVersion: packageJson.version,
    changelog,
    tag
  });

  console.log(
    tag === undefined
      ? `Release metadata is consistent for ${packageJson.version}.`
      : `Release tag ${tag} matches package metadata and changelog.`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
