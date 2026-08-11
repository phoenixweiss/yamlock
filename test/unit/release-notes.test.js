import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { extractReleaseNotes } from '../../scripts/release-notes.js';

test('release notes extract the current changelog section', () => {
  const notes = extractReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), '1.0.0');

  assert.match(notes, /^### Added$/m);
  assert.match(notes, /Authenticated payload v2/);
  assert.doesNotMatch(notes, /## \[0\.3\.0\]/);
});

test('release notes trim blank lines and stop at the next release', () => {
  const changelog = `# Changelog

## [Unreleased]

## [1.2.3] - 2026-08-11

### Added
- A release note.

## [1.2.2] - 2026-08-10
- An older note.
`;

  assert.equal(
    extractReleaseNotes(changelog, '1.2.3'),
    '### Added\n- A release note.'
  );
});

test('release notes reject invalid, missing, duplicate, and empty sections', () => {
  assert.throws(
    () => extractReleaseNotes('# Changelog\n', 'v1.0.0'),
    /invalid release version/i
  );
  assert.throws(
    () => extractReleaseNotes('# Changelog\n', '1.0.0'),
    /does not contain a 1\.0\.0 release section/i
  );
  assert.throws(
    () => extractReleaseNotes('## [1.0.0]\nA\n## [1.0.0]\nB\n', '1.0.0'),
    /duplicate 1\.0\.0 release sections/i
  );
  assert.throws(
    () => extractReleaseNotes('## [1.0.0] - 2026-08-11\n\n## [0.9.0]\n', '1.0.0'),
    /section for 1\.0\.0 is empty/i
  );
});
