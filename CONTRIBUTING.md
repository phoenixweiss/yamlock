# Contributing to yamlock

Thanks for your interest in improving yamlock! This document describes how to set up the project, submit issues or pull requests, and cut releases.

## Prerequisites

- Node.js 24.20.0 (pinned in `.nvmrc` and `.tool-versions`; use `asdf install`
  or `nvm install && nvm use` from the repository root)
- Yarn Classic 1.22.22
- macOS or Linux environment (CLI integration tests spawn subprocesses)
- Bumpster 1.3.0 or newer for maintainer release operations

## Local development

1. Fork and clone the repository.
2. Select the pinned Node.js version and install dependencies: `yarn install --frozen-lockfile`
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

Node.js 24 is the development and release-check environment, not the minimum
runtime. Keep `engines.node` at `>=22.0.0` and `@types/node` on major 22 so type
checks do not silently allow newer Node.js APIs. CI runs the full quality gate
on the pinned development version and compatibility tests on Node.js 22/24/26
across Linux and macOS, including installed-package checks on Node.js 22.
The Bumpster hook uses the selected local Node.js environment; select the
pinned version before running release checks.

Check both `node --version` and `yarn node --version` after selecting the
environment. If another installation (for example Homebrew) takes precedence
over asdf shims in `PATH`, use `asdf exec yarn <command>` to run scripts with
the project's selected Node.js version instead of changing global defaults.

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

## Independent website releases

The CLI/npm package keeps root `VERSION`, root `package.json`, `CHANGELOG.md`,
and `vX.Y.Z` tags. Website releases use `.bumpster/packages/website.json`,
`website/VERSION`, `website/package.json`, `website/CHANGELOG.md`, and
`website/vX.Y.Z` tags. Both targets retain the `dev` → `main` → `dev` flow;
`main` contains releases of either component, so its HEAD may be newer than
the latest CLI tag. Publishing a website does not publish an npm package or
create a GitHub Release. CLI tags no longer trigger Pages.

The website starts at its existing manifest version `0.0.0`. This baseline
does not create a release. Its footer continues to show the documented CLI
version; `version.json` exposes both `cli` and `website` versions.

Before the first independent deployment, allow tags matching `website/v*`
in the repository's `github-pages` environment deployment rules. Keep the
existing branch rules; Pages still validates the selected tag and main ancestry.

1. Finalize a dated target section in `website/CHANGELOG.md` and commit the
   website changes on `dev`.
2. Select Node.js 24.20.0 from `website/.nvmrc` / `website/.tool-versions`
   and Yarn Classic 1.22.22. From `website/`, run
   `yarn release:check --next-version X.Y.Z` and `yarn check:full`.
3. From the repository root, inspect `bumpster --package website --status`.
   After release approval, run `bumpster --package website --patch` (or
   `--minor` / `--major`). The project hook validates the selected profile,
   repeats website checks, and preserves the CLI version.
4. Bumpster atomically publishes `dev`, `main`, and the annotated website tag.
   Pages validates the tag's versions, bump commit, remote tag identity and
   ancestry on `origin/main`, then runs the full website checks and deploys.
5. Verify the deployed `version.json` and the displayed CLI version. Manual
   Pages recovery accepts the same published annotated website tags, including
   older tags whose commits remain ancestors of `origin/main`.

Shared brand/content files must be reviewed for effects on both components.
Independent versions do not isolate Git history: review all commits being
promoted from `dev` to `main` before either release.

Thank you for helping make yamlock better!
