import { lstat, readFile, readdir } from "node:fs/promises";
import { stdout } from "node:process";
import { fileURLToPath, URL } from "node:url";
import assert from "node:assert/strict";
import { readWebsiteState, validateWebsiteState } from "./release-check.mjs";

const distRoot = new URL("../dist/", import.meta.url);
const requiredFiles = [
  "index.html",
  "favicon.svg",
  "og.png",
  "robots.txt",
  "site.webmanifest",
  "sitemap.xml",
  "version.json",
];

for (const filename of requiredFiles) {
  const fileUrl = new URL(filename, distRoot);
  const stats = await lstat(fileUrl);

  if (!stats.isFile()) {
    throw new Error(`${fileURLToPath(fileUrl)} must be a regular file.`);
  }
}

const assetsUrl = new URL("assets/", distRoot);
const assetsStats = await lstat(assetsUrl);

if (!assetsStats.isDirectory()) {
  throw new Error(`${fileURLToPath(assetsUrl)} must be a directory.`);
}

async function rejectSymlinks(directoryUrl) {
  for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
    const entryUrl = new URL(entry.name, directoryUrl);

    if (entry.isSymbolicLink()) {
      throw new Error(`${fileURLToPath(entryUrl)} must not be a symlink.`);
    }

    if (entry.isDirectory()) {
      await rejectSymlinks(new URL(`${entry.name}/`, directoryUrl));
    }
  }
}

await rejectSymlinks(distRoot);

const websiteState = readWebsiteState();
validateWebsiteState(websiteState);
const cliVersion = (
  await readFile(new URL("../../VERSION", import.meta.url), "utf8")
).trim();
const versions = JSON.parse(
  await readFile(new URL("version.json", distRoot), "utf8"),
);
assert.deepEqual(versions, { cli: cliVersion, website: websiteState.version });

const indexUrl = new URL("index.html", distRoot);
const indexHtml = await readFile(indexUrl, "utf8");
const scriptPath = indexHtml.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
assert.ok(
  scriptPath?.startsWith("/yamlock/assets/"),
  "Missing website entry script.",
);
const script = await readFile(
  new URL(scriptPath.slice("/yamlock/".length), distRoot),
  "utf8",
);
assert.ok(
  script.includes(cliVersion),
  "Built page must identify the documented CLI version.",
);

for (const expected of [
  "/yamlock/assets/",
  "https://phoenixweiss.github.io/yamlock/",
  "/yamlock/og.png",
  "/yamlock/site.webmanifest",
]) {
  if (!indexHtml.includes(expected)) {
    throw new Error(`${fileURLToPath(indexUrl)} is missing: ${expected}`);
  }
}

stdout.write("Website static output is complete and Pages-safe.\n");
