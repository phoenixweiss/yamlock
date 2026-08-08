# Key Rotation Guidance

This document explains how to rotate encryption keys without losing data or
leaving plaintext in the working tree longer than necessary. V2 authenticates
the field path and uses a separate random KDF salt for every value.

## Recommended approach

1. **Inventory encrypted files**  
   Maintain a manifest (for example, a simple `yamlock.files` text file at the repo root) listing every YAML/JSON file that contains encrypted values, one path per line. Example:

   ```txt
   config.yaml
   secrets.json
   infra/prod/environment.yaml
   ```

   Reference this file in scripts so rotations stay consistent.

2. **Create recoverable backups**
   - Copy encrypted inputs to a protected location before changing them.
   - Keep backup permissions at least as restrictive as the source files.
   - Do not commit decrypted files, keys, or backup archives.

3. **Export decrypted configs**
   - Use `yamlock decrypt <file> --key <old-key>` for every file in the manifest.  
   - Work in a protected temporary directory outside the repository. Do not use `git stash`: it stores plaintext in Git objects.

4. **Set the new key**
   - Generate a fresh key via `yamlock keygen` or your secret manager.  
   - Update `YAMLOCK_KEY` in CI secrets, `.env` files, and deployment platforms. Keep the old key accessible until rotation completes.

5. **Re-encrypt with the new key**
   - Run `yamlock encrypt <file> --key <new-key>` for each file.  
   - The default writer produces authenticated v2 payloads; do not add `--legacy` unless an older consumer explicitly requires v1.
   - Validate using `yamlock decrypt ... --key <new-key>` to confirm round-trips.

6. **Deploy carefully**
   - Ship the updated configs only after all environments know about the new key.  
   - Monitor for authentication failures, unsupported payload versions, and missing-key errors.

7. **Retire the old key**
   - Once every environment reads the re-encrypted configs, revoke the previous key from secret stores.

## Automation snippet

```bash
#!/usr/bin/env bash
set -euo pipefail

FILES=(config.yaml secrets.json infra/cluster.yaml)

for file in "${FILES[@]}"; do
  yamlock decrypt "$file" --key "$OLD_KEY"
  yamlock encrypt "$file" --key "$NEW_KEY"
done
```

Run the script from CI to ensure consistency. Store `OLD_KEY` and `NEW_KEY` via environment secrets.

## Tips

- Keep encrypted backups in protected storage; never put plaintext backups in Git, including stashes.
- Keep temporary plaintext outside the repository and remove it after verified re-encryption.
- Audit diffs before committing: only encrypted blobs should change.
