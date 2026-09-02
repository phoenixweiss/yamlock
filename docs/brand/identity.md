# yamlock brand identity

This document records the visual direction already established by the project
website. It is a reference for future assets and product surfaces, not a reason
to redesign working material for its own sake.

## Core idea

**Sealed syntax**: yamlock protects selected values while leaving the
configuration recognizable.

The identity combines three visual ideas:

- square brackets define the boundary of a value;
- a vertical beam represents deliberate selection and transformation;
- a small focus ring marks the exact point being protected.

The name may faintly suggest "warlock", but magic is a secondary piece of
personality rather than the main visual metaphor. The primary promise is
precise, local and reviewable encryption.

## Brand character

yamlock should feel:

- precise, not severe;
- technical, not cryptic;
- security-conscious, not fear-driven;
- distinctive, not decorative;
- calm enough to trust in a configuration workflow.

Avoid generic security imagery such as padlocks, shields, fingerprints, binary
rain and anonymous hooded figures. Avoid presenting Base64-like payload text as
decoration when it could be mistaken for a real secret.

## Logo system

### Primary wordmark

The primary wordmark is the lowercase name enclosed in square brackets:
`[yamlock]`.

- Typeface: IBM Plex Mono Medium (500).
- Letters: paper (`#dedbd4`).
- Brackets: violet soft (`#b8a7ff`).
- Keep the spelling lowercase.
- Do not add a padlock to the wordmark or replace either bracket with one.

Use the outlined master at [yamlock-wordmark.svg](yamlock-wordmark.svg) when a
portable asset is required. Live website text may use the same font and colors
to remain accessible and responsive.

### Symbol

The square symbol is the existing favicon motif: violet brackets around a cyan
selection beam and focus ring on a dark rounded tile. It is intended for square
or very small placements where the full wordmark does not fit.

Use [yamlock-symbol.svg](yamlock-symbol.svg) as the master. The deployed
`website/public/favicon.svg` is a delivery copy of this geometry.

### Display treatment

Large campaign or social-preview typography may set `[yamlock]` in Nunito Sans
at a heavier weight, as the current Open Graph image does. This is an editorial
treatment, not a replacement for the primary wordmark. The brackets must remain
violet and the name must remain lowercase.

### Clear space and minimum size

For the wordmark, keep clear space equal to the width of one bracket on every
side. For the symbol, keep clear space equal to one eighth of its tile width.

- Wordmark minimum width: 112 px on screen.
- Symbol minimum size: 16 px on screen.
- At 16 px, use the symbol exactly as supplied; do not add detail or text.

## Color system

| Role               | Token       | Value     | Use                                 |
| ------------------ | ----------- | --------- | ----------------------------------- |
| Primary background | Black       | `#07070a` | Main dark surface                   |
| Raised surface     | Panel       | `#0c0c11` | Cards, symbol tile                  |
| Primary text       | Paper       | `#dedbd4` | Headlines and wordmark letters      |
| Primary brand      | Violet soft | `#b8a7ff` | Brackets, emphasis, section markers |
| Deep brand         | Violet      | `#8b6cff` | Gradients and supporting accents    |
| Active signal      | Cyan        | `#73e7ff` | Beam, focus, encrypted state, links |
| Plaintext signal   | Coral       | `#ff637d` | Unprotected demo values only        |
| Secondary text     | Muted       | `#8b8994` | Supporting copy                     |
| Structure          | Line        | `#32313c` | Rules and grid boundaries           |

Violet carries recognition. Cyan communicates an active or authenticated
state. Coral is semantic and should not become a general decorative accent.

The primary identity is dark-first. On light editorial surfaces, prefer a
single-color black wordmark or place the supplied symbol on its own dark tile;
do not invert the tile to white without a separately tested variant.

## Typography

- **Nunito Sans Variable** is the primary editorial face for headlines and
  prose. Its softer construction keeps the security subject approachable.
- **IBM Plex Mono** is the technical face for the wordmark, code, metadata,
  navigation labels and short controls.

Use mono text selectively. Long explanatory copy should remain in Nunito Sans.
Sentence case is preferred for prose; uppercase with modest tracking is
reserved for short technical labels.

## Graphic language

The established website language is part of the identity:

- restrained dark grids suggest configuration structure;
- vertical scanning or selection lines reveal a before/after state;
- brackets, paths and field boundaries are preferred to abstract cyber motifs;
- motion should explain transformation and remain operable by pointer and
  keyboard;
- reduced-motion preferences must retain a clear static state;
- generous negative space supports the calm, deliberate tone.

The scanner is a product metaphor, not a claim that yamlock scans the system or
uploads data. Supporting copy should make local processing explicit.

## Voice and messaging

The voice is concise, literal and quietly confident. Explain what yamlock does
before how it is implemented. State security boundaries without suggesting an
independent audit or guarantees the project cannot make.

Current anchor lines:

- **Value-level encryption for YAML and JSON configuration files.**
- **Plaintext ends here.**
- **The file stays recognizable. The sensitive values do not.**
- **One package. Your key.**

Prefer terms such as `selected values`, `path-bound`, `authenticated`, `local`
and `reviewable`. Use `magic` sparingly and only as personality copy.

## Asset inventory

| Asset                                                    | Role                                   | Status            |
| -------------------------------------------------------- | -------------------------------------- | ----------------- |
| [yamlock-symbol.svg](yamlock-symbol.svg)                 | Canonical square symbol                | Master            |
| [yamlock-wordmark.svg](yamlock-wordmark.svg)             | Canonical outlined wordmark            | Master            |
| [yamlock-brand-sheet.svg](yamlock-brand-sheet.svg)       | Visual reference sheet                 | Source            |
| [yamlock-brand-sheet.png](yamlock-brand-sheet.png)       | Review-friendly reference              | Generated preview |
| [yamlock-social-card.svg](yamlock-social-card.svg)       | Editable 1200 x 630 social-card master | Source            |
| [yamlock-social-card.png](yamlock-social-card.png)       | Canonical website Open Graph render    | Generated master  |
| [yamlock-github-preview.png](yamlock-github-preview.png) | 1280 x 640 repository preview          | Generated preview |
| `website/public/favicon.svg`                             | Website delivery copy                  | In use            |
| `website/public/og.png`                                  | Website Open Graph delivery copy       | In use            |

The brand masters live in `docs/brand/`. Product directories may contain
delivery copies sized or packaged for that product, but their geometry and
colors should remain traceable to these masters.

## Change policy

Treat the present landing-page direction, favicon geometry and bracketed
wordmark as the approved baseline. Future work may refine spacing, responsive
composition, export formats and accessibility without reopening the concept.
A material change to symbol geometry, wordmark construction or core palette
should be reviewed as a new identity direction.

Run `node docs/brand/scripts/render-social-assets.mjs` from the repository root
to regenerate both social PNG previews and synchronize the website Open Graph
delivery copy. The script uses the website's pinned font and Playwright
dependencies, loads no network resources and runs headless.

GitHub accepts a separate repository preview; the prepared PNG uses its
recommended 1280 x 640 dimensions and a solid background. npm does not expose
an equivalent package-image slot: it renders the published root README, so a
future npm-specific visual would be a deliberate README banner rather than
another upload variant.

Website layout fixes, such as the wide-desktop hero gap, remain separate
implementation work.
