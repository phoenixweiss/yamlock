# Key Rotation Guidance

This document explains how to rotate encryption keys when using yamlock. Because salts depend on field paths, rotating keys must be done carefully to avoid data loss.

## Recommended approach

1. **Export decrypted configs**  
   - Use `yamlock decrypt <file> --key <old-key>` for every YAML/JSON file that contains locked values.
   - Commit the decrypted state to a temporary branch (do not push sensitive plaintext to shared remotes).

2. **Set the new key**  
   - Update deployment secrets (`YAMLOCK_KEY`) across all environments.
   - Keep the previous key available for rollback until rotation completes.

3. **Re-encrypt with the new key**  
   - Run `yamlock encrypt <file> --key <new-key>` on each config file.
   - Validate changes using `yamlock decrypt ... --key <new-key>` to ensure round-trips succeed.

4. **Deploy carefully**  
   - Roll out services that read the configs only after the encrypted files are updated.
   - Monitor for decryption failures (yamlock exits with a non-zero status if the field path or key is wrong).

5. **Remove the old key**  
   - Once all environments run with the new key and configs are re-encrypted, revoke the previous key from secret stores.

## Tips

- Keep backups of decrypted configs before re-encryption.
- For large repositories, script the rotation with a list of files and run it inside CI to ensure consistency.
- Consider using `git update-index --skip-worktree` on decrypted config files if you need to keep plaintext locally for debugging without committing them.
