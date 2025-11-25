# Contributing to yamlock

Thanks for your interest in improving yamlock! This document describes how to set up the project, submit issues or pull requests, and cut releases.

## Prerequisites

- Node.js 22.x (via `asdf install nodejs 22`)
- Yarn Classic 1.x
- macOS or Linux environment (CLI integration tests spawn subprocesses)

## Local development

1. Fork and clone the repository.
2. Install dependencies: `yarn install`
3. Use these scripts:
   - `yarn lint` – ESLint flat config
   - `yarn test` – Node test runner for unit + integration suites
   - `yarn build` – temporary copy of `src` into `dist` for CLI entry point

Before submitting code, ensure `yarn test` and `yarn lint` pass locally.

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
3. Bump the `package.json` version (and tag it without the `v` prefix).
4. Run `yarn lint`, `yarn test`, and `yarn build`.
5. Push commits and tags.
6. When a public release is ready, run `npm publish` from a clean main branch.

Thank you for helping make yamlock better!
