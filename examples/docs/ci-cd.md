# CI/CD Example: locking configs before deployment

This example shows how to decrypt configs for build-time use and re-encrypt
them with the default authenticated v2 format before artifacts are published.

```yaml
# .github/workflows/deploy.yml
name: deploy

on: [push]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install deps
        run: yarn install --frozen-lockfile

      - name: Decrypt configs for build
        run: |
          yamlock decrypt config.yaml --key "$YAMLOCK_KEY"
          yamlock decrypt secrets.json --key "$YAMLOCK_KEY" --paths "db.password,api.token"
        env:
          YAMLOCK_KEY: ${{ secrets.YAMLOCK_KEY }}

      - name: Build
        run: yarn build

      - name: Re-encrypt before pushing artifacts
        run: |
          yamlock encrypt config.yaml --key "$YAMLOCK_KEY"
          yamlock encrypt secrets.json --key "$YAMLOCK_KEY" --paths "db.password,api.token"
        env:
          YAMLOCK_KEY: ${{ secrets.YAMLOCK_KEY }}
```

Adjust the paths/filenames as needed. Keeping encryption in the pipeline helps
prevent accidental plaintext commits. Add `--legacy` only when a consumer has a
temporary, documented requirement for v1 payloads.
