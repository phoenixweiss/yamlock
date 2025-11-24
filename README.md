# yamlock

Value-level encryption for YAML and JSON configuration files. The project is at the very first scaffolding step and no crypto logic is live yet.

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
- `yarn test` — runs Node built-in test runner (no tests yet).
- `yarn lint` — executes ESLint with the provided config.

## Project layout

```txt
yamlock/
├── src/            # Source files (API, CLI, utilities)
├── bin/            # Published executables (CLI entry point)
├── test/           # Unit and integration suites
├── examples/       # Usage demos (TBD)
├── README.md       # This file
└── LICENSE         # MIT License
```

## Roadmap snapshot

The roadmap is tracked outside of the git history while the project is still taking shape.

## License

MIT © PAVEL TKACHEV
