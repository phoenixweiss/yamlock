# Public Node.js API

yamlock `1.x` exposes one ESM entry point. The supported package exports are:

- `encryptValue(value, key, fieldPath, options?)`
- `decryptValue(payload, key, fieldPath, options?)`
- `processConfig(config, options)`
- `serializePath(segments)`
- `getSupportedAlgorithms()`
- `YAMLOCK_ERROR_CODES` and the documented `YamlockError` class hierarchy

The package includes TypeScript declarations for these values and for their
options, path segments, keys, config containers, and error codes. Internal files
under `dist/` are implementation details and are intentionally unavailable as
package subpath exports.

## Stability contract for 1.x

- The default writer produces authenticated v2 payloads. Their serialized
  fields, KDF profile, limits, and field-path binding remain compatible
  throughout `1.x`.
- Legacy payload reading remains available throughout `1.x`. Explicit legacy
  writing through `formatVersion: 1`, legacy algorithm options, or CLI
  `--legacy` is a deprecated compatibility path, but will not be removed before
  a future major release.
- Canonical path serialization and the legacy-path read fallback remain
  compatible throughout `1.x`.
- Existing exports, documented option names, return types, error classes, and
  error codes will not be removed or incompatibly redefined in a minor or patch
  release.
- New optional exports, options, and error codes may be added in a minor
  release. Human-readable error messages may be clarified without changing the
  stable error code.
- The synchronous API remains supported. A future async API, if added, will be
  additive rather than replacing the synchronous functions in `1.x`.

## Crypto options

With no crypto options, `encryptValue` and `processConfig` write v2 payloads.
V2 accepts `formatVersion: 2` and the fixed `aes-256-gcm` profile; free-form
algorithm sizing is rejected.

Legacy compatibility accepts `formatVersion: 1`, an algorithm string, or an
options object with `algorithm`, `keyLength`, `ivLength`, and `authTagLength`.
The algorithm stored in a payload is authoritative during decryption; sizing
overrides exist only for low-level legacy compatibility.

`processConfig` additionally accepts exact `paths`, `parentPath`, a custom
`pathSerializer`, `nonStringPolicy`, and encrypt-only
`existingPayloadPolicy`. It returns a new config container and does not mutate
the input. With `nonStringPolicy: 'stringify'`, selected finite JSON primitives
may become strings, so the TypeScript return type is intentionally widened.

`paths` remains exact throughout the `1.x` line. Structural subtree and
wildcard selection is not implemented yet; it is specified separately in the
[path pattern design proposal](design/path-patterns.md) so a future additive
API does not reinterpret existing selectors.

See the [Node.js error contract](errors.md) and the
[payload v2 design](design/payload-v2.md) for the security and serialization
details.
