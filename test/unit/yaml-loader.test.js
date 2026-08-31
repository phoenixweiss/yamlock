import test from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';

test('YAML loader counts empty merge sources toward its total work limit', () => {
  const source = 'first: { <<: [{}, {}] }\nsecond: { <<: [{}] }\n';

  assert.deepEqual(yaml.load(source, { maxTotalMergeKeys: 3 }), {
    first: {},
    second: {}
  });
  assert.throws(
    () => yaml.load(source, { maxTotalMergeKeys: 2 }),
    (error) => error instanceof yaml.YAMLException && /maxTotalMergeKeys/.test(error.reason)
  );
});
