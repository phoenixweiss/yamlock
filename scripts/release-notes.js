import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function extractReleaseNotes(changelog, version) {
  assert.equal(typeof changelog, 'string', 'Changelog must be a string.');
  assert.match(version, STABLE_VERSION_PATTERN, `Invalid release version: ${version}`);

  const heading = `## [${version}]`;
  const lines = changelog.split(/\r?\n/u);
  const headingIndexes = lines
    .map((line, index) => (
      line === heading || line.startsWith(`${heading} - `) ? index : -1
    ))
    .filter((index) => index !== -1);

  assert.notEqual(
    headingIndexes.length,
    0,
    `CHANGELOG.md does not contain a ${version} release section.`
  );
  assert.equal(
    headingIndexes.length,
    1,
    `CHANGELOG.md contains duplicate ${version} release sections.`
  );

  const sectionLines = [];
  for (let index = headingIndexes[0] + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith('## ')) {
      break;
    }
    sectionLines.push(lines[index]);
  }

  while (sectionLines[0]?.trim() === '') {
    sectionLines.shift();
  }
  while (sectionLines.at(-1)?.trim() === '') {
    sectionLines.pop();
  }

  const notes = sectionLines.join('\n');
  assert.notEqual(notes.trim(), '', `CHANGELOG.md section for ${version} is empty.`);
  return notes;
}

function main() {
  assert.equal(
    process.argv.length,
    3,
    'Usage: node scripts/release-notes.js <X.Y.Z>'
  );

  const changelog = readFileSync(resolve(PROJECT_ROOT, 'CHANGELOG.md'), 'utf8');
  process.stdout.write(`${extractReleaseNotes(changelog, process.argv[2])}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
