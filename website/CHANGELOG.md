# Website changelog

The website is versioned independently from the yamlock npm package.
Its initial configuration baseline was `0.0.0`; independent releases start at `0.0.1`.

## [Unreleased]

## [0.0.1] - 2026-10-14

### Security

- Update Vue to 3.5.42 and refresh vulnerable brace expansion, source map, and selector parser dependencies within their existing compatible ranges.

### Changed

- Adopt independent Bumpster package releases and `website/vX.Y.Z` tags for GitHub Pages.
- Emit `version.json` with the website version and the yamlock CLI version documented by the site.
