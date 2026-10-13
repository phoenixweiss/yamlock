import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function validateWebsiteState({
  version,
  manifest,
  profile,
  changelog,
  nextVersion,
  tag,
}) {
  assert.match(version, stableVersion, "Invalid website version.");
  assert.equal(
    manifest.version,
    version,
    "Website VERSION must match package.json.",
  );
  assert.equal(
    manifest.private,
    true,
    "Website must remain a private package.",
  );
  assert.deepEqual(
    profile,
    {
      versionFile: "website/VERSION",
      packageJson: "website/package.json",
      tagPrefix: "website/v",
    },
    "Invalid Bumpster website profile.",
  );
  assert.match(changelog, /^## \[Unreleased\]\s*$/m);
  const requireHeading = (value) => {
    assert.ok(
      changelog
        .split(/\r?\n/)
        .some((line) =>
          new RegExp(
            `^## \\[${value.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`,
          ).test(line),
        ),
      `Website changelog is missing a dated ${value} heading.`,
    );
  };
  if (version !== "0.0.0" || tag !== undefined) requireHeading(version);
  if (tag !== undefined)
    assert.equal(tag, `website/v${version}`, "Website tag/version mismatch.");
  if (nextVersion !== undefined) {
    assert.match(nextVersion, stableVersion);
    const current = version.split(".").map(Number);
    const next = nextVersion.split(".").map(Number);
    const differingIndex = current.findIndex(
      (part, index) => part !== next[index],
    );
    assert.ok(
      differingIndex >= 0 && next[differingIndex] > current[differingIndex],
      "Website next version must increase.",
    );
    requireHeading(nextVersion);
  }
}

export function readWebsiteState(root = websiteRoot) {
  const read = (path) => readFileSync(resolve(root, path), "utf8");
  return {
    version: read("VERSION").trim(),
    manifest: JSON.parse(read("package.json")),
    profile: JSON.parse(read("../.bumpster/packages/website.json")),
    changelog: read("CHANGELOG.md"),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  assert.ok(
    args.length === 0 ||
      (args.length === 2 && ["--tag", "--next-version"].includes(args[0])),
    "Usage: release-check.mjs [--tag website/vX.Y.Z | --next-version X.Y.Z]",
  );
  const options = args.length
    ? { [args[0] === "--tag" ? "tag" : "nextVersion"]: args[1] }
    : {};
  validateWebsiteState({ ...readWebsiteState(), ...options });
  console.log("Website release metadata is consistent.");
}
