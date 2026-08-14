# Path pattern design

Status: proposed for a future `1.x` minor release; not implemented.

## Goals

- Select a config subtree without listing every leaf.
- Select repeated object fields and array elements with structural wildcards.
- Keep the existing exact `paths` contract fully backward compatible.
- Keep selector syntax separate from the exact field path authenticated by a
  payload.
- Share the same selection behavior across `processConfig` and the CLI
  `encrypt`, `decrypt`, and `migrate` commands.
- Reject malformed or ambiguous patterns before reading or modifying a config
  file.

## Non-goals

- Changing `serializePath`, payload metadata, key derivation, or authenticated
  field paths.
- Treating existing `paths` strings as globs.
- Regular expressions, partial-segment wildcards, character classes, braces,
  negation, or exclusion rules.
- Selecting containers as values. yamlock continues to process leaves only.
- Pattern matching against a custom `pathSerializer` in the first release.

## Compatibility decision

The Node.js API will add a separate `pathPatterns?: string[]` option. The CLI
will add `--path-patterns <pattern1,pattern2>`. Existing `paths` and `--paths`
remain exact selectors, including strings containing literal `*` characters.

Exact selectors and patterns form a union: a leaf is selected when either its
exact serialized path is present in `paths` or its structural segments match a
pattern. When both selector arrays are omitted or empty, all leaves remain
selected as they are today. Duplicate and overlapping selectors process a leaf
only once.

Patterns operate on the original string/array path segments. They never become
the field path passed to `encryptValue` or `decryptValue`; encryption and
authentication continue to use the exact canonical path, or the exact output
of `pathSerializer` where supported. This prevents a broad selector such as
`db.**` from weakening field-path binding.

`pathPatterns` and `pathSerializer` will initially be mutually exclusive. Exact
`paths` remain available with a custom serializer. Failing closed avoids an
ambiguous API where pattern syntax appears to use a serializer but actually
matches a different structural representation.

## Pattern grammar

Patterns use the existing dot/bracket structure plus three whole-segment
wildcards:

| Syntax | Meaning |
| --- | --- |
| `name` | One exact object-key segment |
| `[0]` | One exact array-index segment |
| `*` | Any one object-key segment |
| `[*]` | Any one array-index segment |
| `**` | Zero or more object-key or array-index segments |

Examples:

| Pattern | Matches | Does not match |
| --- | --- | --- |
| `db.**` | `db.password`, `db.replica.password`, a leaf at `db` | `database.password` |
| `services.*.token` | `services.api.token` | `services[0].token` |
| `users[*].token` | `users[0].token`, `users[12].token` | `users.admin.token` |
| `**.token` | `token`, `api.token`, `users[0].token` | `token.value` |
| `matrix[*][*].secret` | `matrix[0][1].secret` | `matrix.primary.secret` |

`*` and `**` are special only when they occupy a complete object segment.
`[*]` is special only as a complete array segment. Partial globs such as
`service-*.token` are invalid rather than being interpreted differently by
different callers.

## Escaping

Pattern literals retain the canonical escaping rules for `\\`, `.`, `[`, `]`,
and `,`. In addition, `\*` represents a literal asterisk inside an object key.
Examples:

| Pattern | Selected structural path |
| --- | --- |
| `a\.b.**` | descendants of the literal root key `a.b` |
| `labels\,primary` | the literal root key `labels,primary` |
| `\*` | the literal root key `*` |
| `features.\*\.enabled` | the literal key `*.enabled` below `features` |
| `items\[\*\]` | the literal object key `items[*]` |

A trailing backslash, an unsupported escape, an empty segment, malformed
brackets, a negative/non-integer array index, or a wildcard embedded in a
literal segment is invalid. CLI comma splitting continues to preserve escaped
commas before the shared pattern parser validates each item.

This escaping affects selectors only. It does not add `*` to the reserved
characters used by `serializePath`, so existing payload paths and exact
selectors do not change.

## Matching semantics

- Patterns match complete leaf paths, not string prefixes.
- `**` may consume zero, one, or many structural segments, including array
  indexes.
- `db` selects a leaf exactly at `db`; it does not select descendants. Use
  `db.**` for the subtree.
- `*` never matches an array index, and `[*]` never matches an object key.
- A pattern can contain more than one `**`; matching must remain deterministic.
- Empty containers and sparse-array holes contain no leaves and therefore do
  not produce matches.
- `parentPath` participates in the full structural path before matching.
- Pattern order does not affect the result.

Patterns must be parsed into structural tokens once before traversal. Matching
must use a bounded dynamic-programming or equivalent token algorithm rather
than converting user input into a backtracking regular expression. A malformed
pattern must fail before traversal, crypto work, or file access.

## API and CLI proposal

Node.js API:

```js
processConfig(config, {
  mode: 'encrypt',
  key,
  paths: ['root.literal'],
  pathPatterns: ['db.**', 'users[*].token']
});
```

CLI:

```bash
yamlock encrypt config.yaml \
  --key "$YAMLOCK_KEY" \
  --paths 'root.literal' \
  --path-patterns 'db.**,users[*].token'
```

The CLI option applies to `encrypt`, `decrypt`, and `migrate`. It requires at
least one non-empty pattern. Invalid syntax uses the structured
`[yamlock:ERR_INVALID_PATH_PATTERNS]` error and exit code `1` before the input
file is read. The Node.js API adds the same stable error code through
`YamlockConfigError`.

## Interaction with existing behavior

### Encryption

Each matched plaintext leaf is encrypted with its exact field path. Existing
payload handling still follows `existingPayloadPolicy`; overlapping patterns do
not create nested encryption layers.

### Decryption

Every matched leaf must satisfy the same payload, key, and exact field-path
checks as an exact selection. A broad pattern does not silently skip plaintext
or malformed values.

### Migration

Every matched leaf follows the existing fail-closed migration rules. Plaintext
fails, selected v2 payloads require `--allow-mixed`, and legacy payloads migrate
to v2 only after the complete selection validates. Pattern overlap does not
inflate migration statistics.

### Non-string values

Pattern selection occurs before `nonStringPolicy`, matching the current exact
selector behavior. Selected values are ignored, stringified, or rejected by
the configured policy; unselected values remain unchanged.

### YAML

Patterns operate on the resolved object/array structure returned by `js-yaml`.
Anchors, aliases, and merge keys therefore follow their independent resolved
paths, consistent with the existing YAML rewrite contract.

## Required tests

- Existing exact `paths` tests remain unchanged, including literal `*` keys.
- Exact object keys and array indexes stay distinct.
- `*`, `[*]`, and `**` cover zero/one/many segment matches and mixed nesting.
- Escaped dots, brackets, commas, backslashes, and literal asterisks match only
  their intended object keys.
- Malformed patterns fail before traversal and before CLI file reads.
- `parentPath` is included; `pathSerializer` plus patterns fails explicitly.
- Exact selectors and patterns form a union; duplicates and overlap process a
  leaf once.
- Sparse arrays, empty containers, Unicode keys, null-prototype objects, and
  own `__proto__` keys retain their current behavior.
- Encrypt/decrypt round trips authenticate exact leaf paths rather than pattern
  text.
- Wrong keys, wrong paths, malformed payloads, plaintext decrypt selections,
  and unsafe migration selections still fail closed.
- CLI integration tests cover JSON and YAML, escaped comma splitting, dry-run,
  separate output, migration, and no-write failure cases.
- TypeScript declarations, public error codes, documentation, package smoke,
  and the installed CLI expose the same contract.

## Delivery sequence

1. Implement and unit-test the pattern tokenizer/compiler and matcher without
   connecting it to config traversal.
2. Add `pathPatterns` to `processConfig`, types, and stable errors while keeping
   exact `paths` regression tests frozen.
3. Add shared CLI validation plus `--path-patterns` for encrypt/decrypt.
4. Add migration support and integration tests for atomic/no-write failures.
5. Update public documentation and package smoke, then release the completed
   additive feature in a minor version after full CI.
