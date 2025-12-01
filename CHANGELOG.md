# Changelog

All notable changes to this project will be documented in this file. Each step in the execution plan increments the version and should be tagged accordingly.

## [0.2.9] - 2025-12-01
### Added
- CLI `--dry-run` flag prints the diff without touching files.
- Structured error codes (e.g., `[yamlock:ERR_MISSING_KEY]`) for machine-readable failure handling.
- Integration tests covering dry-run and the new error format.

### Changed
- README documents the `--dry-run` flag and behavior.

## [0.2.8] - 2025-12-01
### Added
- Advanced usage docs: selective path tips, CI/CD workflow example (`examples/docs/ci-cd.md`), and an expanded key-rotation guide with scripting advice.
- README now links to the new docs and highlights selective encryption in a dedicated section.

### Changed
- Package version bumped to keep documentation in sync.

## [0.2.7] - 2025-12-01
### Added
- README badges for npm version and Node test status, plus a release information section summarizing install options.

### Changed
- Package version bumped to keep documentation in sync.

## [0.2.6] - 2025-11-28
### Added
- Unit tests covering `processConfig` path filters and CLI integration tests for custom algorithms/decrypt paths.

### Changed
- README/CLI behavior unchanged.

## [0.2.5] - 2025-11-28
### Added
- `yamlock algorithms` now distinguishes between tested presets and other OpenSSL-provided ciphers.
- Integration tests updated to confirm the new output format.

### Changed
- README notes that the algorithms command shows both tested and additional cipher lists.

## [0.2.4] - 2025-11-28
### Added
- `yamlock keygen` command generates random keys with configurable length and format, including guidance on storing them.
- Integration tests covering key generation.

### Changed
- README documents the key generator usage.

## [0.2.3] - 2025-11-27
### Added
- `yamlock version` command prints the installed CLI version.
- `yamlock algorithms` lists all ciphers available in the current runtime.
- Integration tests cover the new commands.

### Changed
- CLI help and README highlight the new commands.
- Moved shared fixtures under `fixtures/` so the test runner skips them as standalone suites.

## [0.2.2] - 2025-11-27
### Added
- CLI support for `--paths` (partial encryption/decryption) and `--output` (separate destination files).
- `processConfig` now accepts targeted path lists so API/CLI share the same behavior.

### Changed
- README documents the new CLI options with examples.

## [0.2.1] - 2025-11-26
### Changed
- Unified unit tests around shared fixtures/helpers to remove duplication and ensure every supported algorithm is exercised consistently.

## [0.2.0] - 2025-11-26
### Added
- Algorithm presets with override support (e.g., `chacha20-poly1305` with auth tags, configurable key/IV lengths).
- API support for passing algorithm options through `encryptValue`, `decryptValue`, and `processConfig`.
- Additional unit coverage for presets and algorithm-aware config processing.

## [0.1.2] - 2025-11-26
### Fixed
- CLI binary now falls back to the source entry during development, ensuring `yamlock` works when installed globally or run via `node bin/yamlock`.
- Integration tests call the published bin, catching future regressions.

## [0.1.1] - 2025-11-26
### Added
- Key rotation guide under `docs/key-rotation.md` and README link.
- Documented CLI exit codes and reference to the example script.

## [0.1.0] - 2025-11-26
### Added
- Example script under `examples/basic.js` demonstrating encrypt/decrypt flows.
- GitHub Actions CI workflow to lint, test, and build on pushes/PRs.
- README now links to the example script.

## [0.0.10] - 2025-11-26
### Added
- Expanded README with usage examples, encrypted format description, and contributing link.
- CONTRIBUTING guide plus GitHub issue and pull request templates.

## [0.0.9] - 2025-11-26
### Added
- CLI now auto-detects YAML vs JSON, loads via js-yaml, and writes back preserving the original format.
- Integration tests covering YAML encrypt/decrypt flows.

## [0.0.8] - 2025-11-26
### Added
- CLI skeleton capable of encrypting/decrypting JSON files with `--key` and `--algorithm` options.
- Integration tests covering CLI encrypt/decrypt flows and key validation.

## [0.0.7] - 2025-11-26
### Added
- Public API exports for `encryptValue`, `decryptValue`, `processConfig`, and `getSupportedAlgorithms`.
- Unit tests ensuring the API surface is available and round-trips data correctly.

## [0.0.6] - 2025-11-25
### Added
- `processConfig` helper to walk objects/arrays and encrypt or decrypt every string value based on field paths.
- Unit tests covering nested traversal, arrays, round-trips, and validation errors.

## [0.0.5] - 2025-11-25
### Added
- Field path utilities that serialize nested object/array locations (`src/utils/path.js`).
- Unit tests covering dot/bracket formatting and invalid input handling.

## [0.0.4] - 2025-11-25
### Added
- `decryptValue` support with field-path validation and yamlock payload parsing.
- Unit tests for decrypt flow, mismatch handling, and invalid payload detection.

## [0.0.3] - 2025-11-24
### Added
- `encryptValue` function that encrypts string fields with per-path salts and random IVs.
- Unit tests covering payload structure, IV randomness, and validation checks.

## [0.0.2] - 2025-11-24
### Added
- Crypto utility helpers for key derivation, IV generation, salt encoding, and payload formatting/parsing.
- Unit tests covering the utility layer and yamlock payload parsing.

## [0.0.1] - 2025-11-24
### Added
- Initial project scaffold: package metadata, README baseline, ESLint config, CLI stub, and directory structure.
