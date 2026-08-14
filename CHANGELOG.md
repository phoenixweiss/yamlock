# Changelog

All notable changes to this project will be documented in this file. Release versions are finalized in dedicated commits and use matching numeric Git tags.

## [Unreleased]

### Added
- Tag-gated GitHub Release automation that reuses the full CI matrix, validates the tag against `main`, derives notes from the matching changelog section, verifies a draft, and publishes the release as latest.
- Structural `pathPatterns` / `--path-patterns` selectors for `processConfig` and CLI encrypt/decrypt/migrate workflows, with whole-segment `*`, `[*]`, and `**` matching, exact-path authentication, and fail-closed validation without reinterpreting existing `paths`.

## [1.0.0] - 2026-08-11

### Added
- Authenticated payload v2 for the Node.js API, using AES-256-GCM, scrypt, strict parsing, and authenticated field-path metadata.
- Frozen legacy payload fixtures and v2 regression tests for deterministic vectors, tampering, malformed input, mixed-format configs, and resource limits.
- Payload v2 design documentation covering the threat model, serialized format, compatibility, and staged migration.
- Safe `yamlock migrate` workflow with dry-run summaries, selective paths, mixed-format validation, explicit backups, separate outputs, and atomic permission-preserving writes.
- Explicit CLI legacy-write compatibility through `yamlock encrypt --legacy`; custom encryption algorithms require this mode.
- Strict repeated-encryption checks through CLI `--error-on-encrypted` and Node.js `existingPayloadPolicy: 'error'`.
- Explicit `--force-encrypt` / `existingPayloadPolicy: 'encrypt'` handling for intentional `yl|...` plaintext or nested encryption.
- YAML rewrite documentation and regression coverage for comments, formatting, anchors, aliases, merge keys, and explicit/custom tags.
- Public `serializePath(segments)` helper for constructing canonical field paths without string ambiguity.
- Edge-case regression coverage for empty containers, sparse arrays, special and Unicode keys, empty strings, and large values.
- Automated npm tarball smoke coverage for package contents, public API imports, and the installed distribution-first CLI.
- Stable public Node.js error classes and `ERR_*` codes for validation, payload, authentication, legacy decryption, and config-processing failures.
- Bundled TypeScript declarations and a documented `1.x` stability contract for the public Node.js API.
- Built-in coverage thresholds plus automated Markdown-link and release-metadata checks.
- Packaged runnable API and CI/CD examples with regression coverage against the installed distribution.
- Conventional `help`, `-h`, and `--help` CLI entry points with installed-package smoke coverage.
- Tracked Bumpster configuration, synchronized `VERSION` metadata, and a pre-bump release gate.

### Changed
- Updated `js-yaml` to 4.3.1 to address merge-key, alias, and ordered-map denial-of-service advisories; refreshed ESLint 9 tooling within the existing major version.
- Package builds now exclude ignored local dotfiles, and tarball smoke checks recursively for local workflow artifacts.
- CI now covers supported Node.js releases on Linux and macOS, uses current Node 24-based GitHub Actions, and performs a tag-gated package preflight.
- Development and dependency updates now target `dev`; Bumpster releases atomically synchronize `dev`, `main`, and `vX.Y.Z` tags.
- `encryptValue`, `processConfig`, and `yamlock encrypt` now write authenticated v2 payloads by default.
- `decryptValue` and `processConfig` continue to auto-detect and read both legacy and v2 payloads; API callers can request legacy writing explicitly with `formatVersion: 1` or legacy algorithm options.
- Repeated `processConfig`/CLI encryption now authenticates and preserves existing payloads instead of adding another encryption layer; fully encrypted in-place inputs are not rewritten.
- CLI argument parsing now rejects unknown or duplicate options, missing values, extra positional arguments, and options that do not belong to the selected command before reading input files; `keygen --length` accepts only integers from 1 to 4096 bytes.
- CLI integration tests now force an explicit source mode through the real `bin/yamlock` launcher, preventing stale local `dist` output from masking source changes while preserving distribution-first behavior for normal runs.
- `processConfig` now validates non-string policies, path options, serializer output, collisions, and circular structures; opaque values are preserved by `ignore`, while `stringify` fails closed for values that cannot be converted without type loss.
- Selective processing applies non-string policies only to selected leaves, and YAML timestamp values are no longer collapsed into empty objects during CLI traversal.
- Normal CLI encrypt/decrypt writes now use the shared atomic temporary-file writer, verify that the source did not change after reading, preserve source or existing-output modes, reject symbolic-link paths, and clean up temporary files after failures.
- CLI help now warns that YAML presentation details are normalized during writes and points users toward `--dry-run` or `--output` workflows.
- YAML and JSON parse failures now report sanitized diagnostics without echoing source lines that may contain secrets.
- Default field paths now escape reserved characters in object keys, CLI path lists understand escaped commas, and existing payloads with legacy ambiguous paths remain readable.
- Config processing and migration now preserve sparse-array length and holes; `processConfig` also retains null prototypes and own keys such as `__proto__` without prototype assignment.

## [0.3.0] - 2025-12-01
### Added
- `processConfig` non-string policies (`ignore`, `stringify`, `error`) and optional `pathSerializer` hook.
- Unit tests demonstrating the new policies.

### Changed
- README highlights non-string handling in the advanced usage section.

## [0.2.10] - 2025-12-01
### Added
- README example demonstrating the `--dry-run` workflow (with sample diff output).

### Changed
- Package version bumped to keep documentation in sync.

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
