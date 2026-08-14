# Node.js error contract

yamlock exposes typed errors and stable `ERR_*` codes for expected validation,
payload, authentication, decryption, and config-processing failures. Callers
should branch on `error.code`; messages are written for people and may gain
clarifying detail without a major release.

```js
import {
  decryptValue,
  YamlockAuthenticationError,
  YamlockError
} from 'yamlock';

try {
  decryptValue(payload, key, 'db.password');
} catch (error) {
  if (error instanceof YamlockAuthenticationError) {
    // A v2 key, path, or authenticated payload component did not match.
  } else if (error instanceof YamlockError) {
    console.error(error.code, error.message);
  } else {
    throw error;
  }
}
```

## Classes

- `YamlockError` is the base class for expected public API failures. It extends
  `Error` and exposes a stable `code` property.
- `YamlockValidationError` reports invalid values, keys, options, algorithms,
  field paths, or path segments.
- `YamlockPayloadError` reports malformed, oversized, or unsupported payloads.
- `YamlockAuthenticationError` extends `YamlockPayloadError` and always uses
  `ERR_AUTHENTICATION_FAILED`. V2 intentionally uses the same result for a
  wrong key, wrong field path, or authenticated-data tampering.
- `YamlockDecryptionError` reports legacy decryption and legacy path-matching
  failures. Legacy CBC payloads do not provide authenticated encryption.
- `YamlockConfigError` extends `YamlockValidationError` for `processConfig`
  validation and traversal failures.

`YAMLOCK_ERROR_CODES` exports the supported names without requiring callers to
repeat string literals.

## Common codes

| Code | Meaning |
| --- | --- |
| `ERR_INVALID_VALUE` | A direct API value has the wrong type. |
| `ERR_VALUE_TOO_LARGE` | Plaintext exceeds the supported v2 limit. |
| `ERR_INVALID_KEY` | The encryption key is empty or has an unsupported type. |
| `ERR_INVALID_FIELD_PATH` | The caller supplied an invalid field path. |
| `ERR_INVALID_OPTIONS` | Crypto options have an invalid shape or unsupported override. |
| `ERR_INVALID_MODE` | `processConfig` received an unknown mode. |
| `ERR_INVALID_PATH_PATTERNS` | A path pattern list or pattern syntax is invalid. |
| `ERR_UNSUPPORTED_ALGORITHM` | The requested writer algorithm is unavailable or unsupported. |
| `ERR_UNSUPPORTED_PAYLOAD_VERSION` | The payload or requested writer version is unsupported. |
| `ERR_INVALID_PAYLOAD` | The payload is missing or malformed. |
| `ERR_PAYLOAD_TOO_LARGE` | A serialized payload or payload component exceeds its limit. |
| `ERR_UNSUPPORTED_PAYLOAD` | V2 metadata requests an unsupported algorithm, KDF, or KDF profile. |
| `ERR_AUTHENTICATION_FAILED` | V2 authentication failed; key, path, and tampering are intentionally indistinguishable. |
| `ERR_FIELD_PATH_MISMATCH` | A legacy payload stores a different field path. |
| `ERR_DECRYPTION_FAILED` | A legacy payload could not be decrypted. |

`processConfig` also preserves its specific codes for invalid roots/options,
policies, path serializers, exact path lists, path patterns, circular input, path collisions,
non-string values, unsupported values, and already encrypted values. These are
available through `YAMLOCK_ERROR_CODES` and use `YamlockConfigError`.

The CLI uses the same library codes when available and keeps its existing
`[yamlock:ERR_*]` output format and exit status `1` for failures.
