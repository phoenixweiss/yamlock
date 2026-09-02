import { env } from "node:process";

import { defineConfig } from "@playwright/test";

const appPort = env.YAMLOCK_PREVIEW_PORT ?? "4173";
const appUrl = `http://127.0.0.1:${appPort}/yamlock/`;
const isCi = Boolean(env.CI);

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: isCi ? 1 : undefined,
  reporter: isCi
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: appUrl,
    browserName: "chromium",
    channel: "chrome",
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "wide-desktop",
      use: {
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: "mobile",
      use: {
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: `yarn preview --host 127.0.0.1 --port ${appPort}`,
    url: appUrl,
    reuseExistingServer: !isCi,
  },
});
