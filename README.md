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

## Current status

- Package metadata, linting config, and MIT license are in place.
- Core crypto helpers (`encryptValue`, `decryptValue`, and supporting utils) work with per-field salts and have unit tests.
- `processConfig` can walk nested objects/arrays and apply encryption/decryption to every string value.
- Public API exports (`encryptValue`, `decryptValue`, `processConfig`, `getSupportedAlgorithms`) are wired and verified by tests.
- Directory structure for source, CLI, tests, and examples exists.
- CLI binary can encrypt/decrypt YAML and JSON files by calling `processConfig`.

## Working locally

1. Install the toolchain: `asdf install nodejs 22` and `yarn set version classic` if needed.
2. Install dependencies with `yarn install`.
3. Use the scripts below during development.

## Available scripts

- `yarn build` — copies the current `src` tree into `dist` (temporary until a real build pipeline appears).
- `yarn prepare` — invokes `yarn build` automatically when installing from git.
- `yarn test` — runs Node built-in test runner.
- `yarn lint` — executes ESLint with the provided config.

## Usage

### CLI

```bash
# Encrypt values in a YAML file
YAMLOCK_KEY="super-secret" yamlock encrypt config.yaml

# Decrypt values in place using explicit key/algorithm flags
yamlock decrypt settings.json --key "super-secret" --algorithm aes-256-cbc
```

The CLI detects YAML (`.yaml`/`.yml`) and JSON extensions automatically and writes the file back in the same format.

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

### Encrypted value format

Every locked string follows the format:

```txt
yl|<algorithm>|<salt_base64>|<iv_base64>|<data_base64>
```

where the salt is derived from the full field path. Moving or renaming the field invalidates the salt, preventing accidental decryption in the wrong location.

### Key rotation

See [docs/key-rotation.md](docs/key-rotation.md) for a step-by-step guide to rotating `YAMLOCK_KEY` without losing data.

## Project structure

```txt
yamlock/
├── src/            # Source files (API, CLI, utilities)
├── dist/           # Build output created by `yarn build`
├── bin/            # CLI entry point (loads dist/cli/cli.js)
├── test/           # Unit and integration suites
├── examples/       # Usage demos (TBD)
├── CHANGELOG.md    # Step-by-step release history
└── README.md / LICENSE
```

## Inspiration and motivation

I have worked with Ruby on Rails apps for more than ten years and appreciated how its secret management evolved between 4.2 and 6.x. That flow influenced **yamlock**, but I also explored modern tools such as:

- [autoapply/yaml-crypt](https://github.com/autoapply/yaml-crypt)
- [huwtl/secure_yaml](https://github.com/huwtl/secure_yaml)
- [bitnami-labs/sealed-secrets](https://github.com/bitnami-labs/sealed-secrets)
- [getsops/sops](https://github.com/getsops/sops)

Each of those projects solves secure config storage differently, yet none fit my exact needs. **yamlock** is the bicycle I am building for my own projects to add an extra layer of encryption for sensitive YAML/JSON values while keeping the workflow lightweight.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and release instructions.

## Exit codes

`yamlock` returns `0` when encryption/decryption completes successfully and `1` on validation or runtime errors (missing keys, malformed payloads, failed file reads). Use these exit codes to gate CI jobs or deployment steps.

## License

MIT © PAVEL TKACHEV
