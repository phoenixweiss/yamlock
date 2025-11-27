```ascii
░█░█░█▀█░█▄░▄█░█░░░█▀█░█▀▀░█░█░
░░█░░█▀█░█░▀░█░█░░░█░█░█░░░█▀▄░
░░▀░░▀░▀░▀░░░▀░▀▀▀░▀▀▀░▀▀▀░▀░▀░
```

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

- Encrypt/decrypt individual configuration values with deterministic field-path salts.
- CLI workflow that processes YAML or JSON files in place.
- Recursively lock/unlock entire objects via `processConfig`.
- Public API exports that mirror CLI behavior for programmatic use.
- Focus on Node.js 22+, ESM modules, and a lightweight dependency set (`js-yaml`).

## Usage

### CLI

```bash
# Encrypt values in a YAML file
YAMLOCK_KEY="super-secret" yamlock encrypt config.yaml

# Decrypt values in place using explicit key/algorithm flags
yamlock decrypt settings.json --key "super-secret" --algorithm aes-256-cbc

# Encrypt only selected fields into a new file
yamlock encrypt config.json --key "$YAMLOCK_KEY" --paths "db.password,api.token" --output config.secure.json

# Inspect CLI metadata
yamlock version
yamlock algorithms

# Generate a random key for YAMLOCK_KEY
yamlock keygen --length 64 --format base64
```

The CLI detects YAML (`.yaml`/`.yml`) and JSON extensions automatically and writes the file back in the same format.

Options of note:
- `--output <file>` writes the result to a separate file instead of overwriting the input.
- `--paths <path1,path2>` targets only the specified fields (dot/bracket notation like `db.password` or `users[0].token`).
- Command `keygen` produces a random key and shows how to store it (shell export or `.env`).
- Command `algorithms` prints two lists: tested presets (covered by yamlock) and additional ciphers available from the runtime.
- Command `version` prints the installed CLI version.

### Node.js API

```js
import { encryptValue, decryptValue, processConfig } from 'yamlock';

const encrypted = encryptValue('swordfish', process.env.YAMLOCK_KEY, 'db.password');
const decrypted = decryptValue(encrypted, process.env.YAMLOCK_KEY, 'db.password');

const config = { db: { password: 'swordfish' } };
const locked = processConfig(config, { mode: 'encrypt', key: process.env.YAMLOCK_KEY });
const unlocked = processConfig(locked, { mode: 'decrypt', key: process.env.YAMLOCK_KEY });
```

See `examples/basic.js` for a runnable end-to-end script (`node examples/basic.js`).

### Algorithm customization

Each function accepts either a cipher name or an options object:

```js
const encrypted = encryptValue('swordfish', KEY, 'db.password', {
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
    algorithm: { algorithm: 'aes-192-cbc', ivLength: 24 }
  }
);

// Later you can decrypt with the same options:
const restored = processConfig(processed, {
  mode: 'decrypt',
  key: KEY,
  algorithm: { algorithm: 'aes-192-cbc', ivLength: 24 }
});
```

### Supported algorithms

| Algorithm | Type | Notes |
|-----------|------|-------|
| `aes-128-cbc` | Block cipher (CBC) | 128-bit keys, 16-byte IV. Works well for backward-compatibility scenarios. |
| `aes-192-cbc` | Block cipher (CBC) | 192-bit keys, 16-byte IV. Slightly stronger than AES-128 with the same IV requirements. |
| `aes-256-cbc` (default) | Block cipher (CBC) | 256-bit keys, 16-byte IV. Balanced combination of strength and compatibility. |
| `chacha20-poly1305` | AEAD stream cipher | 256-bit keys, 12-byte nonce, 16-byte auth tag. Provides built-in integrity/authentication. |

You can also pass any algorithm supported by the current Node.js runtime (`crypto.getCiphers()`), along with custom `keyLength`, `ivLength`, or `authTagLength` overrides. Only the algorithms above are actively tested; additional presets may be added or revised in future releases.

### Encrypted value format

Every locked string follows the format:

```txt
yl|<algorithm>|<salt_base64>|<iv_base64>|<data_base64>
```

Where:
- `yl` - format marker prefix
- `<algorithm>` - algorithm name (e.g., aes-256-cbc)
- `<salt_base64>` - Base64-encoded field path
- `<iv_base64>` - Base64-encoded initialization vector
- `<data_base64>` - Base64-encoded encrypted data

The salt is derived from the full field path. Moving or renaming the field invalidates the salt, preventing accidental decryption in the wrong location.

### Key rotation

See [docs/key-rotation.md](docs/key-rotation.md) for a step-by-step guide to rotating `YAMLOCK_KEY` without losing data.

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

- Additional cipher presets and stronger default algorithms.
- More CLI/API examples for rotating keys, selective field targeting, and CI automation.
- Configurable behavior for non-string values (skip vs. coerce) and stricter file format validation.

## License

MIT © PAVEL TKACHEV
