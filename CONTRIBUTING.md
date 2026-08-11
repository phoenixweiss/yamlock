# Contributing to yamlock

Thanks for your interest in improving yamlock! This document describes how to set up the project, submit issues or pull requests, and cut releases.

## Prerequisites

- Node.js 22.x (via `asdf install nodejs 22`)
- Yarn Classic 1.22.22
- macOS or Linux environment (CLI integration tests spawn subprocesses)
- Bumpster 1.2.0 or newer for maintainer release operations

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

## Branch workflow

- `dev` is the integration branch for normal development, pull requests, and
  dependency updates.
- `main` represents the latest released state and is updated from `dev` by the
  Bumpster release flow.
- Both branches run the complete CI matrix. Release tags run the same matrix
  plus the installed-package preflight through the Release workflow.

## Release process

Maintainer releases use
[Bumpster](https://github.com/phoenixweiss/Bumpster) from a clean, synchronized
`dev` branch. Historical pre-1.0 tags omit the `v` prefix; Bumpster-managed
releases starting with `v1.0.0` use `vX.Y.Z` tags.

1. Finalize the feature set and verify that `dev` contains the current `main`.
2. Move the accumulated notes into a dated target section in `CHANGELOG.md`,
   leave a new empty `[Unreleased]` section, then commit and push that release
   preparation on `dev`.
3. Run the complete local check set above and
   `yarn check:release --next-version <X.Y.Z>`.
4. After explicit release approval, run `bumpster --major`, `--minor`, or
   `--patch`. The project pre-bump hook repeats the release checks before any
   mutation.
5. Bumpster synchronizes `VERSION` and `package.json`, creates
   `bump version to X.Y.Z`, updates `main`, creates `vX.Y.Z`, atomically pushes
   `dev`, `main`, and the tag, then returns to `dev`.
6. The tag-only Release workflow repeats the full CI and installed-package
   preflight, verifies that the tagged commit matches `main`, derives notes from
   the matching changelog section, validates a draft, and publishes the GitHub
   Release as latest. If publication fails after draft creation, inspect the
   retained draft before retrying.
7. Wait for the exact tag's Release workflow and public GitHub Release to pass.
8. After separate publication approval, publish from the verified release
   commit and confirm the npm dist-tag, registry installation, CLI, and API.

Thank you for helping make yamlock better!
