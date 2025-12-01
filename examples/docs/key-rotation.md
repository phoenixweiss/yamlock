# Key Rotation Guidance

This document explains how to rotate encryption keys when using yamlock. Because salts depend on field paths, rotating keys must be done carefully to avoid data loss.

## Recommended approach

1. **Inventory encrypted files**  
   Maintain a manifest (for example, a simple `yamlock.files` text file at the repo root) listing every YAML/JSON file that contains encrypted values, one path per line. Example:

   ```txt
   config.yaml
   secrets.json
   infra/prod/environment.yaml
   ```

   Reference this file in scripts so rotations stay consistent.

2. **Export decrypted configs**  
   - Use `yamlock decrypt <file> --key <old-key>` for every file in the manifest.  
   - Work on a temporary branch or use `git stash`/`git worktree` so plaintext never hits `main`.

3. **Set the new key**  
   - Generate a fresh key via `yamlock keygen` or your secret manager.  
   - Update `YAMLOCK_KEY` in CI secrets, `.env` files, and deployment platforms. Keep the old key accessible until rotation completes.

4. **Re-encrypt with the new key**  
   - Run `yamlock encrypt <file> --key <new-key>` for each file.  
   - Validate using `yamlock decrypt ... --key <new-key>` to confirm round-trips.

5. **Deploy carefully**  
   - Ship the updated configs only after all environments know about the new key.  
   - Monitor logs for `Field path does not match` or `Unsupported algorithm` errors.

6. **Retire the old key**  
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

- Keep backups (e.g., `git stash` or S3 snapshots) before touching production configs.
- Use `git update-index --skip-worktree` on decrypted files if they must temporarily exist locally.
- Audit diffs before committing: only encrypted blobs should change.
