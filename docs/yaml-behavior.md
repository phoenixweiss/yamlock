# YAML rewrite behavior

yamlock reads YAML through `js-yaml`, processes the resulting JavaScript value,
and serializes that value back to YAML. It does not edit or round-trip the
original YAML syntax tree. A write can therefore preserve data while changing
or removing presentation details.

Empty or comment-only files are treated as empty mappings. Multiple YAML
documents are rejected before processing or writing.

YAML merge sequences (`<<: [source1, source2, ...]`) are limited to 100 source
mappings. The loader also limits total merge work across the document, counting
empty source mappings as work. Inputs exceeding these limits are rejected before
processing or writing; neither the source nor a separate output is modified.

## What happens during a rewrite

| YAML feature | Current behavior |
| --- | --- |
| Full-line and inline comments | Removed. |
| Indentation, blank lines, flow collections, and quoting | Normalized by `yaml.dump`; original choices are not retained. |
| Literal and folded block scalar styles | May be changed when the parsed string is emitted again. |
| Anchors and aliases | Parsed as shared JavaScript references, then expanded into independent branches by `processConfig`; anchor names and alias syntax are removed. |
| Merge keys (`<<`) | Resolved during parsing and emitted as ordinary mapping entries. |
| Standard explicit tags such as `!!str` | Parsed to a JavaScript value and usually emitted without the original explicit tag. |
| Unknown custom tags | Rejected during input parsing; the source file is not written. |
| Mapping order | Usually follows JavaScript property enumeration, but byte-for-byte order preservation is not a contract. |

Anchored or merged values are processed by their resolved field paths. If the
same source value appears at `defaults.token` and `service.token`, those are two
independent authenticated paths. Selecting one path does not implicitly select
the other.

## When the original bytes are preserved

- `--dry-run` never writes the source file.
- An in-place `encrypt` that finds no plaintext value to change returns without
  rewriting the file.
- A failed parse, validation, encryption, decryption, or write does not replace
  the source file.

A separate `--output` is always serialized as a new YAML document when the
operation succeeds, so its presentation may differ even when most values are
unchanged.

## Recommended workflow

1. Keep source YAML under version control or make a verified backup.
2. Run with `--dry-run` to inspect the complete serialized result.
3. Use exact `--paths` or structural `--path-patterns` to select every resolved
   path that should be encrypted, including values originally introduced
   through aliases or merge keys.
4. Use `--output` when the source document's comments or formatting must remain
   untouched.
5. Do not use unknown application-specific YAML tags in files processed by the
   current CLI.

Preserving comments, custom tags, anchor identities, and exact formatting would
require a syntax-tree-aware YAML editing layer and is not part of the current
release contract.
