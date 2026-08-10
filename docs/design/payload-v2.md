# yamlock payload v2 design

Status: Phases A through C are implemented. V2 is the writer default; legacy
writing remains an explicit compatibility mode.

This document defines the security and compatibility contract for the current
yamlock payload format. It complements the usage-oriented README with the
canonical envelope, threat model, limits, and migration design.

## Goals

- Authenticate encrypted values, field paths, and security-critical metadata.
- Derive encryption keys from user-provided secrets with a documented,
  memory-hard KDF.
- Keep each encrypted value self-contained so `encryptValue` and
  `decryptValue` remain useful without a surrounding file format.
- Read existing `yl|algorithm|salt|iv|data` values during migration.
- Reject malformed or resource-exhausting input before expensive work.
- Keep the format implementable with Node.js 22 built-ins and, later, Web
  Crypto-compatible primitives for a local-only website demonstration.

## Non-goals

- Key storage, key distribution, access control, or secret-manager replacement.
- Hiding field names, algorithms, KDF parameters, ciphertext length, or the
  existence of encrypted values.
- In-place authentication of legacy AES-CBC values. They must be decrypted and
  encrypted again to gain v2 protection.
- Accepting arbitrary OpenSSL ciphers or caller-selected key, nonce, and tag
  lengths in v2.

## Threat model

Payload v2 protects confidentiality and detects modification when an attacker
can read or edit a configuration file but does not know the yamlock secret. It
must reject a payload when an attacker changes its path, algorithm, KDF
metadata, salt, nonce, ciphertext, or authentication tag.

The format cannot protect plaintext after the application decrypts it, a secret
captured from the process environment, a compromised runtime, or a weak
passphrase recovered by offline guessing. The KDF raises the cost of guessing;
it does not make a weak passphrase strong.

## Fixed v2 cryptographic profile

The first v2 writer uses one allowlisted profile:

| Property | Value |
| --- | --- |
| AEAD | `aes-256-gcm` |
| Key length | 32 bytes |
| Nonce length | 12 random bytes |
| Authentication tag | 16 bytes |
| KDF | `scrypt` |
| KDF salt | 16 random bytes |
| scrypt `N` | 32768 (`2^15`) |
| scrypt `r` | 8 |
| scrypt `p` | 1 |
| Derived length | 32 bytes |
| scrypt `maxmem` | at least 64 MiB; implementation target 128 MiB |

AES-GCM is chosen instead of ChaCha20-Poly1305 for the first profile because it
is available in Node.js 22 and Web Crypto, which reduces the chance that a
future browser-only demonstration grows a second, incompatible implementation.
The 12-byte nonce and 16-byte tag match the AEAD_AES_256_GCM profile described
by RFC 5116.

Each encryption generates a fresh KDF salt and nonce with
`crypto.randomBytes()`. A new salt produces a new derived key, while a random
nonce protects distinct invocations under that key. Neither value is secret.

The implementation remains sequential by default because unbounded parallel
scrypt calls could exhaust memory. A local Node.js 22.21.1 reference run on
Darwin arm64 on 2026-08-09 averaged 41.5 ms per encryption and 41.8 ms per
decryption across 20 values; encrypting a representative 20-value config took
845 ms. The full hosted Ubuntu Node.js 22 suite exercises the fixed profile;
these local timings are a reference, not a portable performance guarantee.

### Secret input encoding

- A JavaScript string is encoded once as UTF-8 bytes exactly as supplied.
- A `Buffer` is used as its exact byte sequence.
- Base64 and hexadecimal text is not decoded automatically. A value printed by
  `yamlock keygen` is reused as the same text.
- Empty secrets are rejected before KDF execution.

This preserves a predictable CLI/API contract. A future explicit key-encoding
option requires a separate profile or versioned contract.

## Serialized format

V2 is a pipe-delimited ASCII envelope:

```text
yl|2|aes-256-gcm|scrypt|32768|8|1|<kdf_salt>|<nonce>|<path>|<ciphertext>|<tag>
```

Binary segments use unpadded RFC 4648 base64url. The fields are:

1. `yl`: yamlock marker.
2. `2`: payload format version.
3. `aes-256-gcm`: allowlisted AEAD identifier.
4. `scrypt`: allowlisted KDF identifier.
5. `32768`: scrypt `N` in canonical base-10 form.
6. `8`: scrypt `r` in canonical base-10 form.
7. `1`: scrypt `p` in canonical base-10 form.
8. `kdf_salt`: exactly 16 decoded bytes.
9. `nonce`: exactly 12 decoded bytes.
10. `path`: the exact UTF-8 field path encoded as base64url.
11. `ciphertext`: encrypted UTF-8 value; it may be empty for an empty input.
12. `tag`: exactly 16 decoded bytes.

The field path remains visible after decoding, as it is in v1. It is metadata,
not a cryptographic salt. Naming in code and documentation must use
`fieldPath` and `kdfSalt` rather than calling both values `salt`.

### Version detection

- A payload whose first two segments are `yl|2` is parsed only as v2.
- A payload beginning with `yl|` whose second segment is a known legacy cipher
  is parsed as v1.
- A numeric version other than `2` is rejected as an unsupported format.
- A malformed v2 payload must never fall back to the legacy parser.

## Additional authenticated data

The authenticated header is the ASCII prefix through the path segment:

```text
yl|2|aes-256-gcm|scrypt|32768|8|1|<kdf_salt>|<nonce>|<path>
```

During encryption, this exact byte sequence is passed to `cipher.setAAD()`
before plaintext processing.

During decryption, yamlock authenticates the exact serialized header, including
the stored path. Only after authentication succeeds does it compare the
authenticated path with the base64url encoding of the caller-provided field
path. Therefore:

- an unchanged payload at its original path authenticates and matches;
- moving the unchanged payload authenticates its stored metadata but fails the
  caller-path comparison;
- editing the stored path changes AAD and fails authentication;
- editing any other header field either fails strict validation or changes the
  derived key/AAD and fails authentication.

The caller-provided path is never trusted from the payload itself. Authentication
failure, a wrong key, a wrong path, and tampering should share a stable public
error code such as `ERR_AUTHENTICATION_FAILED`. Low-level OpenSSL errors must
not be exposed as a security distinction.

## Encryption procedure

1. Validate the plaintext type, secret, field path, profile, and size limits.
2. Generate a 16-byte KDF salt and a 12-byte nonce.
3. Derive a 32-byte key with the exact scrypt parameters stored in the header.
4. Serialize the canonical authenticated header.
5. Create `aes-256-gcm` with `authTagLength: 16`.
6. Call `setAAD()` with the UTF-8 header bytes before `update()`.
7. Encrypt the UTF-8 plaintext and obtain the 16-byte tag.
8. Serialize ciphertext and tag as separate base64url fields.
9. Discard references to derived key material as soon as practical.

## Decryption procedure

1. Apply the serialized-size cap before splitting or decoding.
2. Require exactly 12 fields and canonical literal identifiers/numbers.
3. Strictly validate base64url spelling, decoded lengths, UTF-8 path, and
   ciphertext limits.
4. Resolve KDF parameters only through an allowlist of supported profiles.
   Never pass attacker-controlled unbounded values directly to scrypt.
5. Derive the key from the supplied secret and parsed KDF salt.
6. Reconstruct AAD from the exact validated serialized header.
7. Create the GCM decipher with `authTagLength: 16`, then call `setAAD()` and
   `setAuthTag()` before processing ciphertext.
8. After `decipher.final()` authenticates successfully, compare the
   authenticated stored path with the caller-provided path.
9. Return plaintext only after both authentication and path comparison succeed.
10. Convert all wrong-key, wrong-path, and tampering outcomes to the same public
   authentication error.

No partially decrypted plaintext may be returned or written to disk.

## Strict validation and resource limits

The first implementation should use explicit constants rather than accepting
arbitrary payload sizes:

- maximum serialized payload: 16 MiB;
- maximum decoded ciphertext: 8 MiB;
- maximum decoded field path: 4 KiB;
- KDF salt, nonce, and tag: exact profile lengths;
- KDF parameters: an allowlisted tuple, initially only `(32768, 8, 1)`;
- numeric fields: canonical decimal without sign, whitespace, exponent, or
  leading zeroes;
- base64url: only `A-Z`, `a-z`, `0-9`, `-`, and `_`, with no `=` padding;
- decoded path: valid UTF-8 and non-empty.

These initial limits may become documented options later, but decryption must
always enforce safe hard ceilings before KDF execution.

## API contract

V2 is the default writer:

```js
encryptValue(value, key, fieldPath)
```

For v2, arbitrary `algorithm`, `keyLength`, `ivLength`, and `authTagLength`
overrides are rejected. New secure combinations are added as reviewed profiles,
not as free-form OpenSSL options.

Legacy writing requires explicit compatibility options:

```js
encryptValue(value, key, fieldPath, { formatVersion: 1 })
```

Passing a legacy algorithm string or legacy algorithm options also remains an
explicit v1 request for API compatibility. The CLI requires `--legacy`; its
`--algorithm` option is rejected for encryption without that flag.

High-level configuration encryption is idempotent. Selected values that already
contain a valid yamlock payload are decrypted for key/path validation and then
preserved unchanged. `existingPayloadPolicy: 'error'` and CLI
`--error-on-encrypted` provide a strict failure mode. Encryption never upgrades
legacy payloads implicitly; callers use the migration workflow for that change.
The explicit `existingPayloadPolicy: 'encrypt'` / `--force-encrypt` escape hatch
treats a `yl|...` string as plaintext and may create nested encryption layers.

`decryptValue` detects v1/v2 from the payload. A caller must not need to supply
the algorithm for v2. `processConfig` propagates the format option and supports
mixed v1/v2 input during migration.

The synchronous public API can initially use `scryptSync` to avoid an immediate
breaking change. An async API may be added separately after measuring config
size and concurrency behavior; it must cap scrypt concurrency.

## Legacy compatibility

Legacy payloads remain readable:

```text
yl|<algorithm>|<base64_field_path>|<base64_iv>|<base64_data>
```

Important limitations must be documented accurately:

- legacy AES-CBC payloads do not authenticate ciphertext or metadata;
- legacy field-path Base64 is a location check, not a KDF salt;
- legacy ChaCha20-Poly1305 authenticates ciphertext but does not authenticate
  the serialized field path or algorithm metadata as v2 does;
- changing the text envelope cannot add authentication to legacy ciphertext.

Legacy writing stays available only as an explicit compatibility mode during a
defined transition. New v2 code must be isolated from legacy free-form cipher
options so insecure settings cannot leak into the new profile.

## Migration and release sequence

Migration is decrypt-then-encrypt; it is never a header-only rewrite.

### Phase A: dual reader, opt-in v2 writer

- Add frozen legacy fixtures before changing crypto utilities.
- Add v2 parser/formatter, KDF, AEAD, and tamper tests.
- Keep current encryption output unchanged unless `formatVersion: 2` is set.
- Make decryption auto-detect both formats.
- Document the security difference and the future default change.

### Phase B: safe migration workflow

- [x] Add a CLI migration path with `--dry-run`, selective `--paths`, and a
  separate output option.
- [x] Refuse double encryption and already-v2 values unless `--allow-mixed` is
  explicitly requested; authenticated v2 values are then preserved unchanged.
- [x] Read the whole input, decrypt every selected legacy value, construct the
  complete v2 result in memory, and only then replace the target atomically
  while preserving file permissions.
- [x] Support mixed v1/v2 files and report counts without printing plaintext or
  keys. Selected plaintext and non-string values fail closed.
- [x] Create an exclusive `<file>.yamlock.bak` for in-place migration unless
  `--no-backup` is explicit. Separate output preserves the source and refuses
  to replace an existing path.

Legacy AES-CBC values cannot be authenticated because their original format
does not contain an authentication tag. Migration validates their envelope,
field path, and successful decryption before wrapping the recovered value in
v2. Legacy authenticated ciphers and existing v2 values fail when integrity or
the key is wrong.

### Phase C: v2 becomes the writer default

- [x] Switch the API and CLI writer defaults after local migration and installed
  package smoke tests pass.
- [x] Keep explicit `formatVersion: 1` API compatibility and CLI `--legacy` for
  a limited transition window.
- [x] Continue legacy reads so repositories can migrate incrementally.
- [x] Update README, changelog, examples, test fixtures, and key-rotation
  guidance for the default change.
- [x] Confirm the default writer and migration suite in hosted Ubuntu CI.
- [ ] Perform the separately approved version, changelog finalization, tag, and
  release steps.

### Phase D: legacy write retirement

- Remove legacy writing only after a separately announced deprecation period.
- Retain legacy decryption unless a future major release deliberately drops it
  with an external migration tool.

## Required tests before implementation is considered complete

- Frozen v1 fixtures for every currently tested legacy algorithm.
- Deterministic v2 vectors with injected KDF salt and nonce at a low-level test
  seam; production APIs must always generate them randomly.
- Round trips for empty strings, Unicode, arrays, and custom field paths.
- Rejection after single-field changes to version, algorithm, KDF, each KDF
  parameter, salt, nonce, path, ciphertext, and tag.
- Wrong secret and wrong caller-provided path.
- Missing, extra, padded, non-canonical, invalid-UTF-8, oversized, and truncated
  segments.
- Empty ciphertext with a valid tag and rejection of an empty tag.
- Mixed v1/v2 configuration traversal and selective paths.
- Migration all-or-nothing behavior, atomic writes, permission preservation,
  dry-run, and absence of plaintext in stdout/stderr.
- npm tarball smoke test proving the installed package reads v1 and v2 without
  falling back to repository `src` files.

## Release status and limitations

- The fixed profile, migration paths, legacy fixtures, and full test suite pass
  in hosted Ubuntu CI on Node.js 22.
- Stable public library error classes and codes are documented and tested.
- This design and implementation have not received a third-party security
  audit; passing tests alone is not one.

## References

- [Node.js 22 Crypto API](https://nodejs.org/docs/latest-v22.x/api/crypto.html)
- [NIST SP 800-38D: GCM and GMAC](https://csrc.nist.gov/pubs/sp/800/38/d/final)
- [RFC 5116: Authenticated Encryption](https://www.rfc-editor.org/rfc/rfc5116.html)
- [RFC 7914: scrypt](https://www.rfc-editor.org/rfc/rfc7914.html)
