# Website changelog

The website is versioned independently from the yamlock npm package.
Its initial configuration baseline was `0.0.0`; independent releases start at `0.0.1`.

## [Unreleased]

## [0.0.3] - 2026-10-18

### Changed

- Pin development, CI, and Pages to Node.js 24.20.0 for reproducible builds.

## [0.0.2] - 2026-10-14

### Changed

- Update Vue to 3.5.43, Vite to 8.3.4, and the Vue Vite plugin to 6.0.10.
- Update Playwright, Lighthouse, ESLint, Vue lint rules, globals, and Prettier within their current major versions.
- Update the IBM Plex Mono package to 5.3.0; the Latin 400/500 WOFF2 font files used by the site are unchanged.

## [0.0.1] - 2026-10-14

### Security

- Update Vue to 3.5.42 and refresh vulnerable brace expansion, source map, and selector parser dependencies within their existing compatible ranges.

### Changed

- Adopt independent Bumpster package releases and `website/vX.Y.Z` tags for GitHub Pages.
- Emit `version.json` with the website version and the yamlock CLI version documented by the site.
