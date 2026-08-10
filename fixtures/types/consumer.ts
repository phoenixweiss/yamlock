import { Buffer } from 'node:buffer';

import {
  decryptValue,
  encryptValue,
  getSupportedAlgorithms,
  processConfig,
  serializePath,
  YAMLOCK_ERROR_CODES,
  YamlockAuthenticationError,
  YamlockError,
  type ProcessConfigOptions,
  type YamlockErrorCode,
  type YamlockKey
} from 'yamlock';

function consumePublicApi() {
  const key: YamlockKey = Buffer.from('type-smoke-key');
  const path = serializePath(['services', 'db.primary', 0, 'password']);
  const payload = encryptValue('value', key, path);
  const plaintext: string = decryptValue(payload, key, path);
  const algorithms: string[] = getSupportedAlgorithms();

  const input = { services: { password: 'value' }, retries: 3 };
  const options: ProcessConfigOptions = {
    mode: 'encrypt',
    key,
    paths: ['services.password']
  };
  const encrypted = processConfig(input, options);
  const password: string = encrypted.services.password;
  const stringified = processConfig(input, {
    mode: 'encrypt',
    key,
    nonStringPolicy: 'stringify'
  });

  const code: YamlockErrorCode = YAMLOCK_ERROR_CODES.AUTHENTICATION_FAILED;
  const customError = new YamlockError('Consumer error', { code: 'ERR_CONSUMER' });

  try {
    decryptValue(payload, 'wrong-key', path);
  } catch (error) {
    if (error instanceof YamlockAuthenticationError) {
      const authenticationCode: 'ERR_AUTHENTICATION_FAILED' = error.code;
      void authenticationCode;
    }
  }

  // @ts-expect-error yamlock supports only payload versions 1 and 2.
  encryptValue('value', key, path, { formatVersion: 3 });
  // @ts-expect-error processConfig requires a supported mode.
  processConfig(input, { mode: 'rotate', key });
  // @ts-expect-error decrypt mode does not accept an existing-payload policy.
  processConfig(input, { mode: 'decrypt', key, existingPayloadPolicy: 'preserve' });
  // @ts-expect-error path segments cannot be booleans.
  serializePath(['services', true]);

  void plaintext;
  void algorithms;
  void password;
  void stringified;
  void code;
  void customError;
}

void consumePublicApi;
