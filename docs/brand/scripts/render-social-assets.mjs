import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "../../../website/node_modules/playwright/index.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const brandDirectory = resolve(scriptDirectory, "..");
const sourceUrl = pathToFileURL(
  resolve(brandDirectory, "yamlock-social-card.svg"),
).href;
const canonicalOutput = resolve(brandDirectory, "yamlock-social-card.png");
const githubOutput = resolve(brandDirectory, "yamlock-github-preview.png");
const websiteOutput = resolve(
  scriptDirectory,
  "../../../website/public/og.png",
);

await mkdir(brandDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
  });
  const unexpectedRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("file:")) {
      unexpectedRequests.push(request.url());
    }
  });
  await page.goto(sourceUrl);
  await page.evaluate(() => document.fonts.ready);
  const fontsLoaded = await page.evaluate(
    () =>
      document.fonts.check('700 108px "Nunito Sans Brand"') &&
      document.fonts.check('500 17px "IBM Plex Mono Brand"'),
  );

  if (!fontsLoaded) {
    throw new Error("Brand fonts did not load");
  }

  if (unexpectedRequests.length > 0) {
    throw new Error(
      `Social asset render attempted external requests: ${unexpectedRequests.join(", ")}`,
    );
  }

  await page.screenshot({ path: canonicalOutput });
  await copyFile(canonicalOutput, websiteOutput);

  await page.setViewportSize({ width: 1280, height: 640 });
  await page.evaluate(() => {
    const source = document.querySelector("svg");
    source.style.width = "1280px";
    source.style.height = "672px";
    source.style.display = "block";
    source.style.transform = "translateY(-16px)";
  });
  await page.screenshot({ path: githubOutput });
} finally {
  await browser.close();
}
