export const TEST_KEY = 'unit-test-secret-key';
export const TEST_FIELD_PATH = 'services.db.password';

export const ALGORITHM_CASES = [
  { name: 'aes-128-cbc', ivLength: 16 },
  { name: 'aes-192-cbc', ivLength: 16 },
  { name: 'aes-256-cbc', ivLength: 16 },
  { name: 'chacha20-poly1305', ivLength: 12 }
];

export const ALGORITHM_NAMES = ALGORITHM_CASES.map((entry) => entry.name);

export const LEGACY_PAYLOAD_FIXTURES = {
  'aes-128-cbc': 'yl|aes-128-cbc|c2VydmljZXMuZGIucGFzc3dvcmQ=|3P+3C58wFNcHikYG5u1nbw==|yfVQ5JV0v78OjxPmpytpwE2bfflqPtmm1YEXhEp7hLI=',
  'aes-192-cbc': 'yl|aes-192-cbc|c2VydmljZXMuZGIucGFzc3dvcmQ=|FHXwWn+nqWmeuOOEawDnAw==|uuUUP1GT+UN1DaxHu0KkRlvpTGMF45XB1MdwF9F2bCc=',
  'aes-256-cbc': 'yl|aes-256-cbc|c2VydmljZXMuZGIucGFzc3dvcmQ=|E886OCFEAQv+T29mFkDTJg==|ufswWXlx35Y230s/dIXCiUZxi8RlgcrtjqOzLq/Ew9Y=',
  'chacha20-poly1305': 'yl|chacha20-poly1305|c2VydmljZXMuZGIucGFzc3dvcmQ=|xvD6vehqaL0v1gKn|wAiIhzMDX77n9l+1TSEpfYN0CR0iDgLQpHR2H4n9VW6p2C2x'
};

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
