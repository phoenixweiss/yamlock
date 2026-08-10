import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync
} from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LINK_PATTERN = /!?\[[^\]]*\]\(([^)]+)\)/g;

function listMarkdownFiles() {
  const output = execFileSync('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    '*.md'
  ], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8'
  });

  return output
    .split('\0')
    .filter(Boolean)
    .map((filePath) => resolve(PROJECT_ROOT, filePath));
}

function headingSlugs(markdown) {
  return new Set(
    [...markdown.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)]
      .map((match) => match[1]
        .replace(/<[^>]*>/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-'))
  );
}

function parseTarget(rawTarget) {
  const withoutTitle = rawTarget.trim().match(/^<?([^\s>]+)>?/u)?.[1] ?? '';
  const [pathPart, anchor] = withoutTitle.split('#', 2);
  return {
    pathPart: decodeURIComponent(pathPart),
    anchor: anchor ? decodeURIComponent(anchor).toLowerCase() : null
  };
}

function isExternalTarget(target) {
  return /^(?:https?:|mailto:)/i.test(target);
}

function validateMarkdownLinks(files) {
  const failures = [];
  let linkCount = 0;

  for (const sourcePath of files) {
    const markdown = readFileSync(sourcePath, 'utf8');
    for (const match of markdown.matchAll(LINK_PATTERN)) {
      const rawTarget = match[1].trim();
      if (isExternalTarget(rawTarget)) {
        continue;
      }

      linkCount += 1;
      const line = markdown.slice(0, match.index).split('\n').length;
      let target;
      try {
        target = parseTarget(rawTarget);
      } catch {
        failures.push(`${relative(PROJECT_ROOT, sourcePath)}:${line}: invalid URL encoding in ${rawTarget}`);
        continue;
      }

      const targetPath = target.pathPart
        ? resolve(dirname(sourcePath), target.pathPart)
        : sourcePath;
      if (!existsSync(targetPath)) {
        failures.push(`${relative(PROJECT_ROOT, sourcePath)}:${line}: missing ${rawTarget}`);
        continue;
      }

      if (target.anchor && extname(targetPath).toLowerCase() === '.md') {
        const targetMarkdown = readFileSync(targetPath, 'utf8');
        if (!headingSlugs(targetMarkdown).has(target.anchor)) {
          failures.push(`${relative(PROJECT_ROOT, sourcePath)}:${line}: missing anchor #${target.anchor}`);
        }
      }
    }
  }

  assert.deepEqual(failures, [], `Broken local Markdown links:\n${failures.join('\n')}`);
  return linkCount;
}

const markdownFiles = listMarkdownFiles();
const linkCount = validateMarkdownLinks(markdownFiles);
console.log(`Checked ${linkCount} local Markdown links across ${markdownFiles.length} files.`);
