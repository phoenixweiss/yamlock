import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import {
  readWebsiteState,
  validateWebsiteState,
} from "./scripts/release-check.mjs";

const yamlockVersion = readFileSync(
  fileURLToPath(new URL("../VERSION", import.meta.url)),
  "utf8",
).trim();

if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(yamlockVersion)) {
  throw new Error("Root VERSION must contain MAJOR.MINOR.PATCH.");
}

const websiteState = readWebsiteState();
validateWebsiteState(websiteState);

export default defineConfig({
  base: "/yamlock/",
  define: {
    "import.meta.env.YAMLOCK_VERSION": JSON.stringify(yamlockVersion),
  },
  plugins: [
    vue(),
    {
      name: "release-versions",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source:
            JSON.stringify({
              cli: yamlockVersion,
              website: websiteState.version,
            }) + "\n",
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
