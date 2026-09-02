import { readFile } from "node:fs/promises";
import { stdout } from "node:process";
import { fileURLToPath, URL } from "node:url";

const websiteRoot = new URL("../", import.meta.url);
const publicRoot = new URL("../public/", import.meta.url);
const brandRoot = new URL("../../docs/brand/", import.meta.url);
const siteUrl = "https://phoenixweiss.github.io/yamlock/";

async function read(relativeUrl) {
  return readFile(relativeUrl, "utf8");
}

function requireText(content, expected, source) {
  if (!content.includes(expected)) {
    throw new Error(`${fileURLToPath(source)} is missing: ${expected}`);
  }
}

const indexUrl = new URL("index.html", websiteRoot);
const indexHtml = await read(indexUrl);

for (const expected of [
  '<meta name="robots" content="index, follow" />',
  '<meta property="og:type" content="website" />',
  '<meta property="og:site_name" content="yamlock" />',
  `<meta property="og:url" content="${siteUrl}" />`,
  'property="og:image"',
  `content="${siteUrl}og.png"`,
  '<meta property="og:image:width" content="1200" />',
  '<meta property="og:image:height" content="630" />',
  'property="og:image:alt"',
  '<meta name="twitter:card" content="summary_large_image" />',
  'name="twitter:image"',
  'name="twitter:image:alt"',
  '<link rel="manifest" href="/yamlock/site.webmanifest" />',
  '<link rel="icon" type="image/svg+xml" href="/yamlock/favicon.svg" />',
  `<link rel="canonical" href="${siteUrl}" />`,
]) {
  requireText(indexHtml, expected, indexUrl);
}

const manifestUrl = new URL("site.webmanifest", publicRoot);
const manifest = JSON.parse(await read(manifestUrl));

if (
  manifest.lang !== "en" ||
  manifest.start_url !== "/yamlock/" ||
  manifest.scope !== "/yamlock/" ||
  manifest.icons?.[0]?.src !== "/yamlock/favicon.svg"
) {
  throw new Error(`${fileURLToPath(manifestUrl)} has invalid site paths.`);
}

const robotsUrl = new URL("robots.txt", publicRoot);
const robots = await read(robotsUrl);
requireText(robots, `Sitemap: ${siteUrl}sitemap.xml`, robotsUrl);

const sitemapUrl = new URL("sitemap.xml", publicRoot);
const sitemap = await read(sitemapUrl);
requireText(sitemap, `<loc>${siteUrl}</loc>`, sitemapUrl);

const socialPreviewUrl = new URL("og.png", publicRoot);
const socialPreview = await readFile(socialPreviewUrl);

if (
  socialPreview.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
  socialPreview.readUInt32BE(16) !== 1200 ||
  socialPreview.readUInt32BE(20) !== 630
) {
  throw new Error(
    `${fileURLToPath(socialPreviewUrl)} must be a 1200x630 PNG image.`,
  );
}

const brandSocialPreviewUrl = new URL("yamlock-social-card.png", brandRoot);
const brandSocialPreview = await readFile(brandSocialPreviewUrl);

if (!socialPreview.equals(brandSocialPreview)) {
  throw new Error(
    `${fileURLToPath(socialPreviewUrl)} must match ${fileURLToPath(brandSocialPreviewUrl)}.`,
  );
}

const faviconUrl = new URL("favicon.svg", publicRoot);
const brandSymbolUrl = new URL("yamlock-symbol.svg", brandRoot);
const [favicon, brandSymbol] = await Promise.all([
  readFile(faviconUrl),
  readFile(brandSymbolUrl),
]);

if (!favicon.equals(brandSymbol)) {
  throw new Error(
    `${fileURLToPath(faviconUrl)} must match ${fileURLToPath(brandSymbolUrl)}.`,
  );
}

stdout.write("Website metadata and public files are consistent.\n");
