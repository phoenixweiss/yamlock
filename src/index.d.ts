import type { Buffer } from 'node:buffer';

export type YamlockKey = string | Buffer;
export type YamlockPathSegment = string | number;
export type YamlockFormatVersion = 1 | 2;
export type YamlockNonStringPolicy = 'ignore' | 'stringify' | 'error';
export type YamlockExistingPayloadPolicy = 'preserve' | 'error' | 'encrypt';
export type YamlockConfig = Record<string, unknown> | unknown[];

export interface YamlockCryptoOptions {
  algorithm?: string;
  keyLength?: number;
  ivLength?: number;
  authTagLength?: number;
  formatVersion?: YamlockFormatVersion;
}

export type YamlockCryptoOptionsInput = string | YamlockCryptoOptions;

export interface ProcessConfigCommonOptions {
  key: YamlockKey;
  algorithm?: YamlockCryptoOptionsInput;
  algorithmOptions?: YamlockCryptoOptions;
  formatVersion?: YamlockFormatVersion;
  nonStringPolicy?: YamlockNonStringPolicy;
  pathSerializer?: (segments: YamlockPathSegment[]) => string;
  paths?: string[];
  pathPatterns?: string[];
  parentPath?: YamlockPathSegment[];
}

export interface EncryptProcessConfigOptions extends ProcessConfigCommonOptions {
  mode: 'encrypt';
  existingPayloadPolicy?: YamlockExistingPayloadPolicy;
}

export interface DecryptProcessConfigOptions extends ProcessConfigCommonOptions {
  mode: 'decrypt';
  existingPayloadPolicy?: never;
}

export type ProcessConfigOptions =
  | EncryptProcessConfigOptions
  | DecryptProcessConfigOptions;

export const YAMLOCK_ERROR_CODES: Readonly<{
  ALREADY_ENCRYPTED: 'ERR_ALREADY_ENCRYPTED';
  AUTHENTICATION_FAILED: 'ERR_AUTHENTICATION_FAILED';
  CIRCULAR_CONFIG: 'ERR_CIRCULAR_CONFIG';
  DECRYPTION_FAILED: 'ERR_DECRYPTION_FAILED';
  FIELD_PATH_MISMATCH: 'ERR_FIELD_PATH_MISMATCH';
  INVALID_CONFIG_OPTIONS: 'ERR_INVALID_CONFIG_OPTIONS';
  INVALID_CONFIG_ROOT: 'ERR_INVALID_CONFIG_ROOT';
  INVALID_EXISTING_PAYLOAD_POLICY: 'ERR_INVALID_EXISTING_PAYLOAD_POLICY';
  INVALID_FIELD_PATH: 'ERR_INVALID_FIELD_PATH';
  INVALID_KEY: 'ERR_INVALID_KEY';
  INVALID_MODE: 'ERR_INVALID_MODE';
  INVALID_NON_STRING_POLICY: 'ERR_INVALID_NON_STRING_POLICY';
  INVALID_OPTIONS: 'ERR_INVALID_OPTIONS';
  INVALID_PATH_SEGMENTS: 'ERR_INVALID_PATH_SEGMENTS';
  INVALID_PATH_PATTERNS: 'ERR_INVALID_PATH_PATTERNS';
  INVALID_PATH_SERIALIZER: 'ERR_INVALID_PATH_SERIALIZER';
  INVALID_PATHS: 'ERR_INVALID_PATHS';
  INVALID_PAYLOAD: 'ERR_INVALID_PAYLOAD';
  INVALID_VALUE: 'ERR_INVALID_VALUE';
  NON_STRING_VALUE: 'ERR_NON_STRING_VALUE';
  PATH_COLLISION: 'ERR_PATH_COLLISION';
  PAYLOAD_TOO_LARGE: 'ERR_PAYLOAD_TOO_LARGE';
  UNSUPPORTED_ALGORITHM: 'ERR_UNSUPPORTED_ALGORITHM';
  UNSUPPORTED_CONFIG_VALUE: 'ERR_UNSUPPORTED_CONFIG_VALUE';
  UNSUPPORTED_PAYLOAD: 'ERR_UNSUPPORTED_PAYLOAD';
  UNSUPPORTED_PAYLOAD_VERSION: 'ERR_UNSUPPORTED_PAYLOAD_VERSION';
  VALUE_TOO_LARGE: 'ERR_VALUE_TOO_LARGE';
}>;

export type YamlockErrorCode =
  (typeof YAMLOCK_ERROR_CODES)[keyof typeof YAMLOCK_ERROR_CODES];

export interface YamlockErrorOptions {
  code: YamlockErrorCode | `ERR_${string}`;
  cause?: unknown;
}

export class YamlockError extends Error {
  constructor(message: string, options: YamlockErrorOptions);
  code: YamlockErrorCode | `ERR_${string}`;
}

export class YamlockValidationError extends YamlockError {}
export class YamlockPayloadError extends YamlockError {}

export class YamlockAuthenticationError extends YamlockPayloadError {
  constructor(message?: string, options?: { cause?: unknown });
  code: 'ERR_AUTHENTICATION_FAILED';
}

export class YamlockDecryptionError extends YamlockError {}
export class YamlockConfigError extends YamlockValidationError {}

export function encryptValue(
  value: string,
  key: YamlockKey,
  fieldPath: string,
  algorithmOptions?: YamlockCryptoOptionsInput
): string;

export function decryptValue(
  encryptedValue: string,
  key: YamlockKey,
  fieldPath: string,
  algorithmOptions?: YamlockCryptoOptionsInput
): string;

export function processConfig<T extends YamlockConfig>(
  node: T,
  options: ProcessConfigOptions & { nonStringPolicy: 'stringify' }
): YamlockConfig;

export function processConfig<T extends YamlockConfig>(
  node: T,
  options: ProcessConfigOptions
): T;

export function serializePath(segments: YamlockPathSegment[]): string;
export function getSupportedAlgorithms(): string[];
