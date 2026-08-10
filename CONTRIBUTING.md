# Contributing to yamlock

Thanks for your interest in improving yamlock! This document describes how to set up the project, submit issues or pull requests, and cut releases.

## Prerequisites

- Node.js 22.x (via `asdf install nodejs 22`)
- Yarn Classic 1.22.22
- macOS or Linux environment (CLI integration tests spawn subprocesses)

## Local development

1. Fork and clone the repository.
2. Install dependencies: `yarn install`
3. Use these scripts:
   - `yarn lint` – ESLint flat config
   - `yarn check:docs` – verify local Markdown links and anchors
   - `yarn check:release` – verify package/changelog version consistency; add `--tag <version>` for a release tag
   - `yarn test` – Node test runner for unit + integration suites; integration tests invoke `bin/yamlock` in an explicit source mode, so a stale local `dist` cannot affect results
   - `yarn test:coverage` – run the full suite with minimum line, branch, and function coverage thresholds
   - `yarn test:types` – build and type-check a strict TypeScript consumer against the public package entry point
   - `yarn build` – copy `src` into `dist` for package and distribution checks
   - `yarn test:package` – build, pack, install, and smoke-test the public API and installed CLI from an isolated temporary project

Before submitting code, ensure `yarn lint`, `yarn check:docs`,
`yarn check:release`, `yarn test:coverage`, `yarn test:types`, and
`yarn test:package` pass locally. `YAMLOCK_TEST_SOURCE=1` is reserved for the
repository integration suite; the package smoke verifies that the installed CLI
loads `dist` while `src` is absent.

## Issues

- Search existing issues before opening a new one.
- Include reproduction steps, expected vs. actual behavior, environment (OS, Node.js version), and sample configs whenever possible.
- Feature requests should explain the use case and why current behavior is insufficient.

## Pull requests

- Keep PRs focused; split large changes into logical pieces.
- Add or update tests for all code changes.
- Update documentation (`README.md`, `CHANGELOG.md`, etc.) when behavior changes.
- Reference related issues in the PR description (e.g., “Fixes #42”).

## Release process

1. Finalize the planned feature set for the release (e.g., a milestone or issue bundle).
2. Update `CHANGELOG.md` with the new version entry.
3. Bump the `package.json` version and create a matching tag without the `v` prefix.
4. Run the complete local check set above, followed by `yarn check:release --tag <version>`.
5. Push commits and tags.
6. When a public release is ready, run `npm publish` from a clean main branch.

Thank you for helping make yamlock better!
