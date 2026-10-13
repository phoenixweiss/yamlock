import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateWebsiteState } from "./release-check.mjs";

export function validateWebsiteRelease({
  tag,
  expectedCommit = "",
  mainBranch = "main",
  cwd = process.cwd(),
}) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  assert.match(tag, /^website\/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  git("check-ref-format", "--branch", mainBranch);
  const ref = `refs/tags/${tag}`;
  assert.equal(
    git("cat-file", "-t", ref),
    "tag",
    "Website tag must be annotated.",
  );
  const commit = git("rev-parse", `${ref}^{commit}`);
  assert.equal(
    commit,
    git("rev-parse", "HEAD"),
    "Website tag must match checked out commit.",
  );
  if (expectedCommit)
    assert.equal(commit, expectedCommit, "Workflow commit mismatch.");
  const read = (path) => git("show", `${commit}:${path}`);
  validateWebsiteState({
    version: read("website/VERSION"),
    manifest: JSON.parse(read("website/package.json")),
    profile: JSON.parse(read(".bumpster/packages/website.json")),
    changelog: read("website/CHANGELOG.md"),
    tag,
  });
  assert.equal(
    git("show", "-s", "--format=%s", commit),
    `bump version to ${tag.slice("website/v".length)}`,
    "Website tag must point to a Bumpster version commit.",
  );
  git(
    "fetch",
    "--quiet",
    "--no-tags",
    "origin",
    `+refs/heads/${mainBranch}:refs/remotes/origin/${mainBranch}`,
  );
  git(
    "merge-base",
    "--is-ancestor",
    commit,
    `refs/remotes/origin/${mainBranch}`,
  );
  const published = git(
    "ls-remote",
    "--exit-code",
    "--tags",
    "origin",
    ref,
    `${ref}^{}`,
  ).split("\n");
  assert.ok(
    published.includes(`${git("rev-parse", ref)}\t${ref}`) &&
      published.includes(`${commit}\t${ref}^{}`),
    "Website tag must be published unchanged on origin.",
  );
  return commit;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert.equal(
      process.argv.length,
      5,
      "Usage: validate-release.mjs TAG EXPECTED_COMMIT MAIN_BRANCH",
    );
    const [tag, expectedCommit, mainBranch] = process.argv.slice(2);
    const commit = validateWebsiteRelease({ tag, expectedCommit, mainBranch });
    console.log(`Validated website release ${tag} at ${commit}.`);
  } catch (error) {
    console.error(`Invalid website release: ${error.message}`);
    process.exitCode = 1;
  }
}
