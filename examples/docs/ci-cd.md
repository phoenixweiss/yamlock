# CI/CD Example: locking configs before deployment

This example shows how to decrypt configs for build-time use and re-encrypt
them with the default authenticated v2 format before artifacts are published.
It assumes `yamlock` is declared in the project's dependencies or
devDependencies.

```yaml
# .github/workflows/deploy.yml
name: deploy

on: [push]

permissions:
  contents: read

env:
  YARN_VERSION: 1.22.22

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Set up Node
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: '22'
          cache: yarn

      - name: Use Yarn Classic
        run: npm install --global "yarn@$YARN_VERSION"

      - name: Install deps
        run: yarn install --frozen-lockfile

      - name: Decrypt configs for build
        run: |
          yarn yamlock decrypt config.yaml --key "$YAMLOCK_KEY"
          yarn yamlock decrypt secrets.json --key "$YAMLOCK_KEY" --paths "db.password,api.token"
        env:
          YAMLOCK_KEY: ${{ secrets.YAMLOCK_KEY }}

      - name: Build
        run: yarn build

      - name: Re-encrypt before pushing artifacts
        run: |
          yarn yamlock encrypt config.yaml --key "$YAMLOCK_KEY"
          yarn yamlock encrypt secrets.json --key "$YAMLOCK_KEY" --paths "db.password,api.token"
        env:
          YAMLOCK_KEY: ${{ secrets.YAMLOCK_KEY }}
```

Adjust the paths/filenames as needed. Keeping encryption in the pipeline helps
prevent accidental plaintext commits. Add `--legacy` only when a consumer has a
temporary, documented requirement for v1 payloads.
