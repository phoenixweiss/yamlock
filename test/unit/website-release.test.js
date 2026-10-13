import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { validateWebsiteState } from '../../website/scripts/release-check.mjs';
import { validateWebsiteRelease } from '../../website/scripts/validate-release.mjs';

const profile = { versionFile: 'website/VERSION', packageJson: 'website/package.json', tagPrefix: 'website/v' };
const state = {
  version: '0.0.1',
  manifest: { version: '0.0.1', private: true },
  profile,
  changelog: '## [Unreleased]\n\n## [0.0.1] - 2026-10-14\n\n### Added\n- Example.\n'
};

test('Pages and CLI release workflows use separate tag namespaces', () => {
  const pages = yaml.load(readFileSync('.github/workflows/pages.yml', 'utf8'));
  const cli = yaml.load(readFileSync('.github/workflows/release.yml', 'utf8'));
  assert.deepEqual(pages.on.push.tags, ['website/v*.*.*']);
  assert.equal(pages.on.workflow_run, undefined);
  assert.deepEqual(cli.on.push.tags, ['v*.*.*']);
  assert.equal(cli.jobs['website-checks'], undefined);
  assert.equal(cli.jobs.publish.needs, 'checks');
});

test('website release metadata keeps independent versions and rejects mismatched targets', () => {
  validateWebsiteState({ ...state, tag: 'website/v0.0.1' });
  validateWebsiteState({ ...state, version: '0.0.0', manifest: { version: '0.0.0', private: true }, changelog: '## [Unreleased]\n' });
  validateWebsiteState({ ...state, nextVersion: '0.0.2', changelog: state.changelog + '\n## [0.0.2] - 2026-10-14\n' });
  for (const overrides of [
    { tag: 'v0.0.1' },
    { manifest: { version: '1.1.6', private: true } },
    { profile: { ...profile, versionFile: 'VERSION' } },
    { nextVersion: '0.0.1' },
    { nextVersion: '0.0.2' },
    { manifest: { version: '0.0.1', private: false } },
    { changelog: '## [Unreleased]\n' }
  ]) assert.throws(() => validateWebsiteState({ ...state, ...overrides }));
});

test('website deployment validates published annotated tags and allows main to advance', () => {
  const root = mkdtempSync(join(tmpdir(), 'yamlock-website-release-'));
  const repo = join(root, 'repo');
  const remote = join(root, 'remote.git');
  mkdirSync(repo);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'release-test@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'tag.gpgsign', 'false');
    git('init', '--bare', remote);
    git('remote', 'add', 'origin', remote);
    mkdirSync(join(repo, 'website'));
    mkdirSync(join(repo, '.bumpster', 'packages'), { recursive: true });
    writeFileSync(join(repo, 'website', 'VERSION'), state.version + '\n');
    writeFileSync(join(repo, 'website', 'package.json'), JSON.stringify(state.manifest));
    writeFileSync(join(repo, 'website', 'CHANGELOG.md'), state.changelog);
    writeFileSync(join(repo, '.bumpster', 'packages', 'website.json'), JSON.stringify(profile));
    git('add', '.');
    git('commit', '-m', 'bump version to 0.0.1');
    const commit = git('rev-parse', 'HEAD');
    const tag = 'website/v0.0.1';
    git('tag', '-a', tag, '-m', tag);
    const validate = (overrides = {}) => validateWebsiteRelease({ cwd: repo, tag, expectedCommit: commit, ...overrides });
    assert.throws(() => validate()); // Unpublished remote tag/main.
    git('push', 'origin', 'main', tag);
    assert.equal(validate(), commit);
    assert.throws(() => validate({ tag: 'v1.1.6' }));
    assert.throws(() => validate({ expectedCommit: '0'.repeat(40) }));
    git('tag', 'website/v0.0.2');
    assert.throws(() => validate({ tag: 'website/v0.0.2' }), /annotated/);
    git('tag', '-a', 'website/v0.0.3', '-m', 'invalid-version');
    assert.throws(() => validate({ tag: 'website/v0.0.3' }));
    git('commit', '--allow-empty', '-m', 'Advance main after CLI release');
    git('push', 'origin', 'main');
    assert.throws(() => validate(), /checked out/);
    git('checkout', '--detach', commit);
    assert.equal(validate(), commit);
    git('checkout', '--orphan', 'unrelated');
    git('commit', '-m', 'Unrelated main');
    git('push', '--force', 'origin', 'HEAD:main');
    git('checkout', '--detach', commit);
    assert.throws(() => validate()); // Tag is no longer an ancestor of main.
    assert.equal(readFileSync(join(repo, 'website', 'VERSION'), 'utf8').trim(), '0.0.1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
