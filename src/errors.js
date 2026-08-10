const ERROR_CODE_PATTERN = /^ERR_[A-Z0-9_]+$/;

export const YAMLOCK_ERROR_CODES = Object.freeze({
  ALREADY_ENCRYPTED: 'ERR_ALREADY_ENCRYPTED',
  AUTHENTICATION_FAILED: 'ERR_AUTHENTICATION_FAILED',
  CIRCULAR_CONFIG: 'ERR_CIRCULAR_CONFIG',
  DECRYPTION_FAILED: 'ERR_DECRYPTION_FAILED',
  FIELD_PATH_MISMATCH: 'ERR_FIELD_PATH_MISMATCH',
  INVALID_CONFIG_OPTIONS: 'ERR_INVALID_CONFIG_OPTIONS',
  INVALID_CONFIG_ROOT: 'ERR_INVALID_CONFIG_ROOT',
  INVALID_EXISTING_PAYLOAD_POLICY: 'ERR_INVALID_EXISTING_PAYLOAD_POLICY',
  INVALID_FIELD_PATH: 'ERR_INVALID_FIELD_PATH',
  INVALID_KEY: 'ERR_INVALID_KEY',
  INVALID_MODE: 'ERR_INVALID_MODE',
  INVALID_NON_STRING_POLICY: 'ERR_INVALID_NON_STRING_POLICY',
  INVALID_OPTIONS: 'ERR_INVALID_OPTIONS',
  INVALID_PATH_SEGMENTS: 'ERR_INVALID_PATH_SEGMENTS',
  INVALID_PATH_SERIALIZER: 'ERR_INVALID_PATH_SERIALIZER',
  INVALID_PATHS: 'ERR_INVALID_PATHS',
  INVALID_PAYLOAD: 'ERR_INVALID_PAYLOAD',
  INVALID_VALUE: 'ERR_INVALID_VALUE',
  NON_STRING_VALUE: 'ERR_NON_STRING_VALUE',
  PATH_COLLISION: 'ERR_PATH_COLLISION',
  PAYLOAD_TOO_LARGE: 'ERR_PAYLOAD_TOO_LARGE',
  UNSUPPORTED_ALGORITHM: 'ERR_UNSUPPORTED_ALGORITHM',
  UNSUPPORTED_CONFIG_VALUE: 'ERR_UNSUPPORTED_CONFIG_VALUE',
  UNSUPPORTED_PAYLOAD: 'ERR_UNSUPPORTED_PAYLOAD',
  UNSUPPORTED_PAYLOAD_VERSION: 'ERR_UNSUPPORTED_PAYLOAD_VERSION',
  VALUE_TOO_LARGE: 'ERR_VALUE_TOO_LARGE'
});

export class YamlockError extends Error {
  constructor(message, { code, cause } = {}) {
    if (typeof code !== 'string' || !ERROR_CODE_PATTERN.test(code)) {
      throw new TypeError('YamlockError requires an ERR_* code.');
    }

    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.code = code;
  }
}

export class YamlockValidationError extends YamlockError {}

export class YamlockPayloadError extends YamlockError {}

export class YamlockAuthenticationError extends YamlockPayloadError {
  constructor(message = 'Payload authentication failed.', options = {}) {
    super(message, {
      ...options,
      code: YAMLOCK_ERROR_CODES.AUTHENTICATION_FAILED
    });
  }
}

export class YamlockDecryptionError extends YamlockError {}

export class YamlockConfigError extends YamlockValidationError {}
