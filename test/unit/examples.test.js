import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('CI/CD example is valid YAML and invokes the installed project CLI', () => {
  const markdown = readFileSync(resolve(PROJECT_ROOT, 'examples/docs/ci-cd.md'), 'utf8');
  const fence = markdown.match(/```yaml\n([\s\S]*?)\n```/);

  assert.ok(fence, 'CI/CD guide must contain a YAML workflow example.');
  const workflow = yaml.load(fence[1]);
  const steps = workflow.jobs.deploy.steps;

  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.env.YARN_VERSION, '1.22.22');
  assert.match(steps[0].uses, /^actions\/checkout@[a-f0-9]{40}$/);
  assert.match(steps[1].uses, /^actions\/setup-node@[a-f0-9]{40}$/);

  const commandSteps = steps
    .map((step) => step.run)
    .filter((command) => typeof command === 'string')
    .join('\n');
  assert.match(commandSteps, /yarn yamlock decrypt/);
  assert.match(commandSteps, /yarn yamlock encrypt/);
});
