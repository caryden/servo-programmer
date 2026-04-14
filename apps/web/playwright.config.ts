import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const configDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:8789",
    headless: true,
  },
  webServer: {
    command: "bun run build && bun x http-server . -p 8789 -c-1",
    cwd: configDir,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
