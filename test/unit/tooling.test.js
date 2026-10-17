import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const workflow = (path) => yaml.load(read(`.github/workflows/${path}.yml`));

test('development and website pins agree without raising the runtime or type baseline', () => {
  const version = read('.nvmrc').trim();
  assert.match(version, /^24\.\d+\.\d+$/);
  for (const directory of ['', 'website/']) {
    assert.equal(read(`${directory}.nvmrc`).trim(), version);
    const tools = read(`${directory}.tool-versions`).trim().split('\n');
    assert.ok(tools.includes(`nodejs ${version}`));
    assert.ok(tools.includes('yarn 1.22.22'));
  }
  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.engines.node, '>=22.0.0');
  assert.equal(manifest.devDependencies['@types/node'], '^22.0.0');
  assert.equal(manifest.packageManager, 'yarn@1.22.22');
});

test('quality and release jobs use the development pin while Node 22 keeps package coverage', () => {
  const ci = workflow('ci');
  for (const job of [ci.jobs.quality, ci.jobs['release-package'], workflow('release').jobs.publish]) {
    const setup = job.steps.find((step) => step.uses?.startsWith('actions/setup-node@'));
    assert.equal(setup.with['node-version-file'], '.nvmrc');
    assert.equal(setup.with['node-version'], undefined);
  }
  const compatibility = ci.jobs.compatibility;
  const matrix = compatibility.strategy.matrix;
  assert.deepEqual(matrix.node, ['22', '24', '26']);
  assert.deepEqual(matrix.os, ['ubuntu-latest', 'macos-latest']);
  assert.deepEqual(matrix.exclude, [{ os: 'ubuntu-latest', node: '24' }]);
  assert.ok(compatibility.steps.some((step) => step.run === 'yarn test'));
  assert.ok(compatibility.steps.some((step) =>
    step.run === 'yarn test:package' && step.if === "matrix.node == '22'"));
  for (const job of [workflow('site-ci').jobs.website, workflow('pages').jobs.build]) {
    assert.ok(job, 'website job must exist');
    const setup = job.steps.find((step) => step.uses?.startsWith('actions/setup-node@'));
    assert.equal(setup.with['node-version-file'], 'website/.nvmrc');
  }
});

test('ignore rules protect local output and secrets without hiding source or safe examples', () => {
  const ignored = [
    'AGENTS.md', 'todo.tmp.md', '.env', '.env.production', 'website/.env.local',
    'website/settings.local', 'config.yaml.yamlock.bak', 'yamlock-1.1.6.tgz',
    'node_modules/example/index.js', 'website/node_modules/example/index.js',
    'dist/index.js', 'website/dist/index.html', 'coverage/lcov.info',
    'website/playwright-report/index.html', 'website/test-results/result.json',
    '.yarn-integrity', '.yarn/cache/example.zip', '.DS_Store'
  ];
  const trackable = [
    '.env.example', 'website/.env.example', '.nvmrc', 'website/.nvmrc',
    'yarn.lock', 'website/yarn.lock', '.yarnrc', '.yarn/releases/yarn.cjs',
    '.yarn/patches/example.patch', 'src/index.js', 'src/index.d.ts',
    'website/src/App.vue', 'docs/brand/yamlock-symbol.svg'
  ];
  const output = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: root, input: [...ignored, ...trackable].join('\n') + '\n', encoding: 'utf8'
  });
  assert.deepEqual(output.trim().split('\n'), ignored);
});
