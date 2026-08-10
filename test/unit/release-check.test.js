import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateReleaseState } from '../../scripts/release-check.js';

const CURRENT_PACKAGE = JSON.parse(readFileSync('package.json', 'utf8'));
const CURRENT_CHANGELOG = readFileSync('CHANGELOG.md', 'utf8');

test('release metadata accepts the current package and matching tag', () => {
  assert.doesNotThrow(() => validateReleaseState({
    packageVersion: CURRENT_PACKAGE.version,
    changelog: CURRENT_CHANGELOG,
    tag: CURRENT_PACKAGE.version
  }));
});

test('release metadata rejects invalid versions and mismatched tags', () => {
  assert.throws(
    () => validateReleaseState({
      packageVersion: '01.0.0',
      changelog: CURRENT_CHANGELOG
    }),
    /invalid semantic version/i
  );
  assert.throws(
    () => validateReleaseState({
      packageVersion: CURRENT_PACKAGE.version,
      changelog: CURRENT_CHANGELOG,
      tag: `v${CURRENT_PACKAGE.version}`
    }),
    /does not match package version/i
  );
});

test('release metadata requires Unreleased and a dated version heading', () => {
  assert.throws(
    () => validateReleaseState({
      packageVersion: '1.0.0',
      changelog: '# Changelog\n\n## [Unreleased]\n'
    }),
    /missing a dated 1\.0\.0 release heading/i
  );
  assert.throws(
    () => validateReleaseState({
      packageVersion: '1.0.0',
      changelog: '# Changelog\n\n## [1.0.0] - 2026-08-10\n'
    }),
    /missing \[Unreleased\]/i
  );
});
