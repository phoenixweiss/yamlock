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
- Directory structure for source, CLI, tests, and examples exists.
- CLI binary is a stub that only prints a placeholder message.

## Working locally

1. Install the toolchain: `asdf install nodejs 22` and `yarn set version classic` if needed.
2. Install dependencies with `yarn install`.
3. Use the scripts below during development.

## Available scripts

- `yarn build` — copies the current `src` tree into `dist`.
- `yarn test` — runs Node built-in test runner.
- `yarn lint` — executes ESLint with the provided config.

## Project structure

```txt
yamlock/
├── src/            # Source files (API, CLI, utilities)
├── bin/            # Published executables (CLI entry point)
├── test/           # Unit and integration suites
├── examples/       # Usage demos (TBD)
├── README.md       # This file
└── LICENSE         # MIT License
```

## Inspiration and motivation

I have worked with Ruby on Rails apps for more than ten years and appreciated how its secret management evolved between 4.2 and 6.x. That flow influenced **yamlock**, but I also explored modern tools such as:

- [autoapply/yaml-crypt](https://github.com/autoapply/yaml-crypt)
- [huwtl/secure_yaml](https://github.com/huwtl/secure_yaml)
- [bitnami-labs/sealed-secrets](https://github.com/bitnami-labs/sealed-secrets)
- [getsops/sops](https://github.com/getsops/sops)

Each of those projects solves secure config storage differently, yet none fit my exact needs. **yamlock** is the bicycle I am building for my own projects to add an extra layer of encryption for sensitive YAML/JSON values while keeping the workflow lightweight.

## License

MIT © PAVEL TKACHEV
