import { lstat, readFile, readdir } from "node:fs/promises";
import { stdout } from "node:process";
import { fileURLToPath, URL } from "node:url";

const distRoot = new URL("../dist/", import.meta.url);
const requiredFiles = [
  "index.html",
  "favicon.svg",
  "og.png",
  "robots.txt",
  "site.webmanifest",
  "sitemap.xml",
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

const indexUrl = new URL("index.html", distRoot);
const indexHtml = await readFile(indexUrl, "utf8");

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
