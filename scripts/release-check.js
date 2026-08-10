import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertDatedReleaseHeading(changelog, version) {
  assert.match(
    changelog,
    new RegExp(`^## \\[${escapeRegExp(version)}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`, 'm'),
    `CHANGELOG.md is missing a dated ${version} release heading.`
  );
}

function compareStableVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

export function validateReleaseState({ packageVersion, versionFile, changelog, tag, nextVersion }) {
  assert.match(
    packageVersion,
    SEMVER_PATTERN,
    `package.json contains an invalid semantic version: ${packageVersion}`
  );
  assert.equal(
    versionFile,
    packageVersion,
    `VERSION ${versionFile} does not match package version ${packageVersion}.`
  );
  assert.match(changelog, /^## \[Unreleased\]\s*$/m, 'CHANGELOG.md is missing [Unreleased].');
  assertDatedReleaseHeading(changelog, packageVersion);

  if (tag !== undefined) {
    assert.equal(
      tag,
      `v${packageVersion}`,
      `Release tag ${tag} does not match expected Bumpster tag v${packageVersion}.`
    );
  }

  if (nextVersion !== undefined) {
    assert.match(nextVersion, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, `Invalid next version: ${nextVersion}`);
    assert.ok(
      compareStableVersions(nextVersion, packageVersion) > 0,
      `Next version ${nextVersion} must be greater than package version ${packageVersion}.`
    );
    assertDatedReleaseHeading(changelog, nextVersion);
  }
}

function parseOptions(argv) {
  if (argv.length === 0) {
    return {};
  }

  if (
    argv.length !== 2 ||
    !['--tag', '--next-version'].includes(argv[0]) ||
    argv[1].length === 0
  ) {
    throw new Error('Usage: yarn check:release [--tag <vX.Y.Z> | --next-version <X.Y.Z>]');
  }

  return argv[0] === '--tag' ? { tag: argv[1] } : { nextVersion: argv[1] };
}

function main() {
  const packageJson = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'package.json'), 'utf8'));
  const versionFile = readFileSync(resolve(PROJECT_ROOT, 'VERSION'), 'utf8').trim();
  const changelog = readFileSync(resolve(PROJECT_ROOT, 'CHANGELOG.md'), 'utf8');
  const options = parseOptions(process.argv.slice(2));

  validateReleaseState({
    packageVersion: packageJson.version,
    versionFile,
    changelog,
    ...options
  });

  if (options.tag !== undefined) {
    console.log(`Release tag ${options.tag} matches VERSION, package metadata, and changelog.`);
  } else if (options.nextVersion !== undefined) {
    console.log(`Release metadata is ready for Bumpster target ${options.nextVersion}.`);
  } else {
    console.log(`Release metadata is consistent for ${packageJson.version}.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
