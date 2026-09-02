import { URL } from "node:url";
import { env } from "node:process";

import { expect, test } from "@playwright/test";

const localOrigin = `http://127.0.0.1:${env.YAMLOCK_PREVIEW_PORT ?? "4173"}`;

async function loadSite(page) {
  await page.goto("./");
  await page.evaluate(() => document.fonts.ready);
}

test("renders a coherent desktop and mobile layout", async ({
  page,
}, testInfo) => {
  await loadSite(page);

  await expect(
    page.getByRole("heading", { level: 1, name: /Plaintext\s+ends here\./ }),
  ).toBeVisible();
  await expect(page.locator(".scanner")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /One package/ }),
  ).toBeVisible();

  const layout = await page.evaluate(() => {
    const scanner = document.querySelector(".scanner").getBoundingClientRect();
    const heroCopy = document
      .querySelector(".hero-copy")
      .getBoundingClientRect();

    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      scanner: {
        left: scanner.left,
        right: scanner.right,
        top: scanner.top,
      },
      heroCopy: {
        left: heroCopy.left,
        bottom: heroCopy.bottom,
      },
    };
  });

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.scanner.left).toBeGreaterThanOrEqual(0);
  expect(layout.scanner.right).toBeLessThanOrEqual(layout.viewportWidth);

  if (testInfo.project.name === "mobile") {
    expect(layout.scanner.top).toBeGreaterThan(layout.heroCopy.bottom);
  } else {
    expect(layout.scanner.left).toBeGreaterThan(layout.heroCopy.left);
  }

  await testInfo.attach(`yamlock-${testInfo.project.name}.png`, {
    body: await page.screenshot({ animations: "disabled", fullPage: true }),
    contentType: "image/png",
  });
});

test("keeps the wide desktop hero composition cohesive", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "wide-desktop");

  await loadSite(page);

  const layout = await page.evaluate(() => {
    const scanner = document.querySelector(".scanner").getBoundingClientRect();
    const heroCopy = document
      .querySelector(".hero-copy")
      .getBoundingClientRect();
    const heroLead = document
      .querySelector(".hero-lead")
      .getBoundingClientRect();

    return {
      viewportWidth: document.documentElement.clientWidth,
      copyInset: heroCopy.left,
      scannerInset: document.documentElement.clientWidth - scanner.right,
      contentGap: scanner.left - heroLead.right,
    };
  });

  expect(layout.contentGap).toBeGreaterThanOrEqual(52);
  expect(layout.contentGap).toBeLessThanOrEqual(260);
  expect(Math.abs(layout.copyInset - layout.scannerInset)).toBeLessThanOrEqual(
    2,
  );

  await testInfo.attach("yamlock-wide-desktop-hero.png", {
    body: await page.screenshot({ animations: "disabled", fullPage: false }),
    contentType: "image/png",
  });
});

test("supports keyboard navigation and scanner controls", async ({ page }) => {
  await loadSite(page);

  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);

  const jsonButton = page.getByRole("button", { name: "json" });
  await jsonButton.focus();
  await page.keyboard.press("Enter");
  await expect(jsonButton).toHaveAttribute("aria-pressed", "true");

  const slider = page.getByRole("slider", {
    name: "Encryption scanner position",
  });
  await slider.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("0.5");

  await page.getByRole("button", { name: "encrypted" }).focus();
  await page.keyboard.press("Enter");
  await expect(slider).toHaveValue("100");
  await expect(page.locator(".scan-label")).toHaveText("decrypt / 0%");

  await page.getByRole("button", { name: "plaintext" }).focus();
  await page.keyboard.press("Enter");
  await expect(slider).toHaveValue("0");
  await expect(page.locator(".scan-label")).toHaveText("encrypt / 0%");
});

test("honors reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loadSite(page);
  await page.waitForTimeout(900);

  await expect(page.locator(".scan-label")).toHaveText("encrypt / 0%");

  const motion = await page
    .locator(".scan-spark")
    .first()
    .evaluate((spark) => {
      const styles = getComputedStyle(spark);
      return {
        animationDurationMs: Number.parseFloat(styles.animationDuration) * 1000,
        animationIterations: styles.animationIterationCount,
      };
    });

  expect(motion.animationDurationMs).toBeCloseTo(0.01, 3);
  expect(motion.animationIterations).toBe("1");
});

test("keeps the static demo local and free of secret-entry surfaces", async ({
  context,
  page,
}) => {
  const browserErrors = [];
  const externalRequests = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== localOrigin) {
      externalRequests.push(request.url());
    }
  });

  await loadSite(page);
  await page.getByRole("button", { name: "json" }).click();
  await page.getByRole("button", { name: "encrypted" }).click();

  const browserState = await page.evaluate(() => ({
    cookiesEnabled: navigator.cookieEnabled,
    localStorage: Object.fromEntries(Object.entries(localStorage)),
    sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
    secretEntryFields: document.querySelectorAll(
      'input:not([type="range"]), textarea',
    ).length,
    text: document.body.textContent,
  }));

  expect(browserErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(browserState.localStorage).toEqual({});
  expect(browserState.sessionStorage).toEqual({});
  expect(browserState.secretEntryFields).toBe(0);
  expect(browserState.text).not.toContain("-----BEGIN PRIVATE KEY-----");
  expect(await context.cookies()).toEqual([]);
  expect(browserState.cookiesEnabled).toBe(true);
});
