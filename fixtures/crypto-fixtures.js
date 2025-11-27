export const TEST_KEY = 'unit-test-secret-key';
export const TEST_FIELD_PATH = 'services.db.password';

export const ALGORITHM_CASES = [
  { name: 'aes-128-cbc', ivLength: 16 },
  { name: 'aes-192-cbc', ivLength: 16 },
  { name: 'aes-256-cbc', ivLength: 16 },
  { name: 'chacha20-poly1305', ivLength: 12 }
];

export const ALGORITHM_NAMES = ALGORITHM_CASES.map((entry) => entry.name);

export function sampleConfig(value = 'secret') {
  return { value };
}

export function nestedConfig() {
  return {
    db: {
      host: 'localhost',
      password: 'swordfish'
    },
    version: 1,
    features: ['alpha', { flag: 'beta' }]
  };
}
