```ascii
░█░█░█▀█░█▄░▄█░█░░░█▀█░█▀▀░█░█░
░░█░░█▀█░█░▀░█░█░░░█░█░█░░░█▀▄░
░░▀░░▀░▀░▀░░░▀░▀▀▀░▀▀▀░▀▀▀░▀░▀░
```

[![npm version](https://img.shields.io/npm/v/yamlock)](https://www.npmjs.com/package/yamlock)
[![Tests](https://img.shields.io/badge/tests-node--test-green)](https://github.com/phoenixweiss/yamlock/actions)

# yamlock

Value-level encryption for YAML and JSON configuration files. The name **yamlock** combines "YAML" and "lock" while also sounding like "warlock", hinting at a little configuration magic.

## Requirements

- Node.js 22.x via `asdf`
- Yarn Classic (1.x)

## Installation

### npm

```bash
npm install -g yamlock      # CLI usage
npm install yamlock         # project dependency
```

### Yarn Classic

```bash
yarn global add yamlock     # CLI usage
yarn add yamlock            # project dependency
```

## Features

- Encrypt/decrypt individual values with authenticated field-path metadata.
- CLI workflow that processes YAML or JSON files in place.
- Safe CLI migration from legacy payloads to authenticated v2 payloads.
- Recursively lock/unlock entire objects via `processConfig`.
- Public API exports that mirror CLI behavior for programmatic use.
- Focus on Node.js 22+, ESM modules, and a lightweight dependency set (`js-yaml`).

## Usage

### CLI

```bash
# Encrypt values in a YAML file
YAMLOCK_KEY="super-secret" yamlock encrypt config.yaml

# Decrypt values in place; the payload determines its format and algorithm
yamlock decrypt settings.json --key "super-secret"

# Encrypt only selected fields into a new file
yamlock encrypt config.json --key "$YAMLOCK_KEY" --paths "db.password,api.token" --output config.secure.json

# Inspect CLI metadata
yamlock version
yamlock algorithms

# Generate a random key for YAMLOCK_KEY
yamlock keygen --length 64 --format base64

# Preview changes without touching files
yamlock encrypt config.yml -o config.enc.yml -p db.password -k "my-secret-key" -d

# Preview a legacy-to-v2 migration without printing config contents
yamlock migrate config.yml -k "$YAMLOCK_KEY" -p db.password -d

# Explicitly write legacy v1 for a temporary compatibility requirement
yamlock encrypt config.yml -k "$YAMLOCK_KEY" --legacy --algorithm aes-256-cbc
```

The CLI detects YAML (`.yaml`/`.yml`) and JSON extensions automatically and
writes the file back in the same format. Normal `encrypt` and `decrypt` writes
use an fsynced temporary file plus an atomic rename. In-place writes preserve
the source mode; a new `--output` inherits the source mode, while an existing
regular output preserves its own mode. Mutating operations reject symbolic-link
inputs and outputs rather than following or replacing their targets.

YAML writes preserve parsed values, not the original syntax tree. Comments,
anchor/alias syntax, merge keys, explicit tags, quoting, and formatting may be
removed or normalized. Review [the YAML rewrite contract](docs/yaml-behavior.md)
and use `--dry-run` or `--output` when presentation details matter.

Options of note:
- `--output <file>` writes the result to a separate file instead of overwriting the input.
- `--paths <path1,path2>` targets only the specified fields using the [escaped path syntax](#field-path-syntax).
- `--dry-run` previews an operation without modifying files; encrypt/decrypt print content changes, while migrate prints only counts and target paths.
- `migrate` decrypts selected legacy payloads and re-encrypts them as authenticated v2 payloads.
- `migrate --allow-mixed` additionally authenticates and preserves selected values that are already v2.
- In-place migration creates `<file>.yamlock.bak` by default; `--no-backup` disables it explicitly.
- `encrypt --legacy` writes the legacy v1 format; `--algorithm` is accepted for encryption only together with `--legacy`.
- `encrypt --error-on-encrypted` fails when a selected value is already encrypted instead of preserving it.
- `encrypt --force-encrypt` explicitly treats selected `yl|...` strings as plaintext and adds another encryption layer.
- Command `keygen` produces a random key of 1–4096 whole bytes and shows how to store it (shell export or `.env`).
- Command `algorithms` prints the fixed v2 profile, tested legacy presets, and additional legacy ciphers available from the runtime.
- Command `version` prints the installed CLI version.

The CLI rejects unknown or duplicate options, missing option values, extra
positional arguments, and options that do not apply to the selected command.
Argument errors use structured `[yamlock:ERR_*]` codes and are reported before
the CLI reads or modifies a configuration file.

### Field path syntax

Default field paths use dots for object nesting and brackets for array indexes:
`db.password` and `users[0].token`. Inside an object key, backslashes, dots,
brackets, and commas are escaped with a backslash. For example,
`db\.primary.token` selects `token` below the literal key `db.primary`, while
`db.primary.token` selects three nested object keys. Quote escaped CLI paths so
the shell passes each backslash unchanged:

```bash
yamlock encrypt config.json --key "$YAMLOCK_KEY" --paths 'db\.primary.token,labels\,primary'
```

Node.js callers can build the same canonical strings from unambiguous segments:

```js
import { processConfig, serializePath } from 'yamlock';

const selectedPath = serializePath(['db.primary', 'token']);
const encrypted = processConfig(config, {
  mode: 'encrypt',
  key: process.env.YAMLOCK_KEY,
  paths: [selectedPath]
});
```

New payloads bind authentication to the escaped canonical path. Payloads written
by older yamlock versions for keys containing reserved characters remain
readable through the default serializer's compatibility path; selecting those
keys now requires the canonical escaped spelling. A custom `pathSerializer`
keeps its own contract and does not use the default compatibility fallback.

### Node.js API

```js
import { encryptValue, decryptValue, processConfig, serializePath } from 'yamlock';

const encrypted = encryptValue('swordfish', process.env.YAMLOCK_KEY, 'db.password');
const decrypted = decryptValue(encrypted, process.env.YAMLOCK_KEY, 'db.password');

const config = { db: { password: 'swordfish' } };
const locked = processConfig(config, { mode: 'encrypt', key: process.env.YAMLOCK_KEY });
const unlocked = processConfig(locked, { mode: 'decrypt', key: process.env.YAMLOCK_KEY });
```

Repeated encryption is safe by default. `processConfig` authenticates selected
existing payloads with the supplied key and field path, preserves them
unchanged, and encrypts only selected plaintext values. Use
`existingPayloadPolicy: 'error'` when existing encrypted values should fail the
operation:

```js
processConfig(config, {
  mode: 'encrypt',
  key: process.env.YAMLOCK_KEY,
  existingPayloadPolicy: 'error'
});
```

Malformed payloads, incorrect keys, and incorrect field paths are never silently
skipped. Re-running `yamlock encrypt` on a fully encrypted input does not rewrite
the source file. Use `yamlock migrate` rather than `encrypt` to convert preserved
legacy values to v2.

If plaintext intentionally begins with `yl|`, use
`existingPayloadPolicy: 'encrypt'` or CLI `--force-encrypt`. This also permits
deliberate nested encryption, so it should not be enabled in routine workflows;
each added layer requires a matching decrypt operation.

See `examples/basic.js` for a runnable end-to-end script (`node examples/basic.js`).

### Legacy algorithm customization

V2 deliberately has no free-form cipher settings. For temporary legacy
compatibility, select format version 1 and provide the old cipher options:

```js
const encrypted = encryptValue('swordfish', KEY, 'db.password', {
  formatVersion: 1,
  algorithm: 'chacha20-poly1305',
  ivLength: 12 // override the IV size used during encryption
});

// When decrypting, the algorithm is inferred from the payload,
// but you can still override key/IV sizes if the cipher requires it.
const decrypted = decryptValue(encrypted, KEY, 'db.password', /* optional overrides */);

// processConfig propagates the same options through every nested field.
const processed = processConfig(
  { db: { password: 'swordfish' }, api: { token: 'secret' } },
  {
    mode: 'encrypt',
    key: KEY,
    formatVersion: 1,
    algorithm: { algorithm: 'aes-192-cbc', ivLength: 24 }
  }
);

// Later you can decrypt with the same options:
const restored = processConfig(processed, {
  mode: 'decrypt',
  key: KEY,
  formatVersion: 1,
  algorithm: { algorithm: 'aes-192-cbc', ivLength: 24 }
});

// Control what happens when encountering non-string values and customize path IDs
const mixedConfig = { db: { password: 'secret', retries: 3 } };
const lockedMixed = processConfig(mixedConfig, {
  mode: 'encrypt',
  key: KEY,
  nonStringPolicy: 'stringify', // stringifies finite numbers, booleans, and null
  pathSerializer: (segments) => segments.join('/') // custom path naming (db/password instead of dot notation)
});

// Example of a path serializer that includes array indexes explicitly
const lockedUsers = processConfig(
  { users: [{ tokens: ['abc'] }] },
  {
    mode: 'encrypt',
    key: KEY,
    pathSerializer: (segments) =>
      segments
        .map((segment, index) =>
          typeof segment === 'number' ? `[${segment}]` : index === 0 ? segment : `/${segment}`
        )
        .join('')
  }
);
```

`processConfig` recursively traverses arrays and plain objects. With the default
`nonStringPolicy: 'ignore'`, selected non-string and opaque values such as
`Date`, `undefined`, or `BigInt` are preserved unchanged. Policy `'error'`
rejects a selected non-string value. Policy `'stringify'` accepts only finite
numbers, booleans, and `null`; values that native JSON conversion could omit or
silently change are rejected instead of being encrypted with lost type
information. Decrypted stringified primitives remain strings.

Circular arrays/objects are rejected. A custom `pathSerializer` must return a
non-empty, unique string for every leaf and the same serializer must be used for
encryption and decryption. Policies apply only to values selected by `paths`;
unselected leaf values are preserved.

### Authenticated payload v2 (default)

`encryptValue`, `processConfig`, and `yamlock encrypt` write authenticated v2
payloads by default. `decryptValue` and `processConfig` automatically read both
v1 and v2.

```js
const encrypted = encryptValue('swordfish', KEY, 'db.password');

const locked = processConfig(
  { db: { password: 'swordfish' } },
  { mode: 'encrypt', key: KEY }
);

// No format or algorithm option is required when decrypting.
const original = decryptValue(encrypted, KEY, 'db.password');
const unlocked = processConfig(locked, { mode: 'decrypt', key: KEY });
```

V2 uses a fixed AES-256-GCM profile, a random 12-byte nonce, a 16-byte
authentication tag, and scrypt with a separate random KDF salt. The field path
and security-critical metadata are authenticated. Free-form cipher and size
overrides are intentionally unavailable for v2.

Existing legacy files can be migrated safely with the CLI:

```bash
# Preview counts and target paths; config contents are not printed.
yamlock migrate config.yaml --key "$YAMLOCK_KEY" --paths "db.password,api.token" --dry-run

# Migrate in place and create config.yaml.yamlock.bak.
yamlock migrate config.yaml --key "$YAMLOCK_KEY" --paths "db.password,api.token"

# Preserve the source and write a new file. Existing outputs are never replaced.
yamlock migrate config.yaml --key "$YAMLOCK_KEY" --paths "db.password,api.token" --output config.v2.yaml
```

Migration validates every selected value and builds the complete result before
writing. Selected plaintext and non-string values are rejected, so use
`--paths` for partially encrypted configs. Selected v2 values are rejected
unless `--allow-mixed` is set; with that flag they are authenticated and kept
unchanged. In-place writes are atomic, preserve the source file mode, and do
not replace an existing backup. To roll back, verify the backup and then copy
`config.yaml.yamlock.bak` over `config.yaml`.

Legacy AES-CBC payloads have no authentication, so migration can only validate
their structure, field path, and successful decryption. Backups use the source
file permissions and match `*.yamlock.bak` in the repository `.gitignore`.
See [the payload v2 design](docs/design/payload-v2.md) for the format, threat
model, limits, and staged migration plan. This design and implementation have
not received a third-party security audit.

## Advanced usage

- **Selective encryption**: combine `--paths` on the CLI or a non-empty `paths: ['db.password']` array in `processConfig` to encrypt only sensitive fields.
- **Repeated encryption**: valid selected payloads are authenticated and preserved; add `--error-on-encrypted` or `existingPayloadPolicy: 'error'` for strict workflows.
- **Non-string handling**: use `nonStringPolicy: 'ignore' | 'stringify' | 'error'` to preserve opaque leaves, stringify finite JSON primitives, or reject selected non-string values; use `pathSerializer` to change path representation (e.g., `db/password` instead of dot notation).
- **CI/CD flows**: see [examples/docs/ci-cd.md](examples/docs/ci-cd.md) for a GitHub Actions job that decrypts configs for builds and re-encrypts them before publishing artifacts.
- **Key rotation**: follow [examples/docs/key-rotation.md](examples/docs/key-rotation.md) for a step-by-step process, including scripting tips for large repos.

### Supported algorithms

| Algorithm | Format | Notes |
|-----------|--------|-------|
| `aes-256-gcm` | v2 default | Fixed authenticated profile with scrypt, a 12-byte nonce, and a 16-byte tag. |
| `aes-128-cbc` | legacy v1 | Compatibility only; ciphertext and metadata are not authenticated. |
| `aes-192-cbc` | legacy v1 | Compatibility only; ciphertext and metadata are not authenticated. |
| `aes-256-cbc` | legacy v1 | Compatibility default when `--legacy` is used without `--algorithm`. |
| `chacha20-poly1305` | legacy v1 | Authenticates ciphertext, but not all serialized metadata protected by v2. |

Additional algorithms exposed by `crypto.getCiphers()` are available only in
explicit legacy mode and are not part of the supported v2 profile. Prefer the
default v2 writer for new data.

## Release information

- The badges at the top show the latest npm version and the status of the Node test suite.
- See [CHANGELOG.md](CHANGELOG.md) for detailed release notes; install a specific tag via `npm install yamlock@<version>`.

### Encrypted value formats

New values use the authenticated v2 envelope:

```txt
yl|2|aes-256-gcm|scrypt|32768|8|1|<kdf_salt>|<nonce>|<path>|<ciphertext>|<tag>
```

Legacy values remain readable and can still be written explicitly:

```txt
yl|<algorithm>|<salt_base64>|<iv_base64>|<data_base64>
```

The legacy name `<salt_base64>` is historical: that segment is only the
Base64-encoded field path and is not a random salt or KDF input.

See [the payload v2 design](docs/design/payload-v2.md) for the canonical field
definitions, limits, compatibility rules, and legacy security limitations.

### Key rotation

See [the key rotation guide](examples/docs/key-rotation.md) for a step-by-step
workflow that re-encrypts values with v2 and a new `YAMLOCK_KEY`.

## Inspiration and motivation

I have worked with Ruby on Rails apps for more than ten years and appreciated how its secret management evolved between 4.2 and 6.x. That flow influenced **yamlock**, but I also explored modern tools such as:

- [autoapply/yaml-crypt](https://github.com/autoapply/yaml-crypt)
- [huwtl/secure_yaml](https://github.com/huwtl/secure_yaml)
- [bitnami-labs/sealed-secrets](https://github.com/bitnami-labs/sealed-secrets)
- [getsops/sops](https://github.com/getsops/sops)

Each of those projects solves secure config storage differently, yet none fit my exact needs. **yamlock** is the bicycle I am building for my own projects to add an extra layer of encryption for sensitive YAML/JSON values while keeping the workflow lightweight.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, available scripts, and release instructions.

## Exit codes

`yamlock` returns `0` when encryption/decryption completes successfully and `1` on validation or runtime errors (missing keys, malformed payloads, failed file reads). Use these exit codes to gate CI jobs or deployment steps.

## Future work

- Stable public error classes and codes for the Node.js API.
- An async encryption API with bounded scrypt concurrency for large configs.
- Stricter file-format validation and preservation rules for advanced YAML features.

## Author

Created and maintained by [Pavel Tkachev (@phoenixweiss)](https://github.com/phoenixweiss).

## License

MIT © PAVEL TKACHEV
