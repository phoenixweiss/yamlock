# Changelog

All notable changes to this project will be documented in this file. Each step in the execution plan increments the version and should be tagged accordingly.

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
