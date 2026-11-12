import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { readComposeTestEnv, testDatabaseUrl } = require("./e2e/test-environment.cjs");
const testEnv = readComposeTestEnv();

const apiUrl = new URL(testEnv.NEXT_PUBLIC_API_BASE_URL);
const backendPort = String(testEnv.BACKEND_HOST_PORT);
if (!["localhost", "127.0.0.1"].includes(apiUrl.hostname) || apiUrl.port !== backendPort || apiUrl.pathname.replace(/\/$/, "") !== "/api") {
  throw new Error("E2E API URL must point to the med09v5test Compose backend on its configured host port.");
}

const frontendPort = String(testEnv.FRONTEND_HOST_PORT);
const baseURL = `http://localhost:${frontendPort}`;
process.env.MED09_E2E_RUN_ID = randomBytes(8).toString("hex");
process.env.MED09_E2E_DATABASE_URL = testDatabaseUrl(testEnv);
process.env.MED09_E2E_API_URL = apiUrl.toString().replace(/\/$/, "");
process.env.MED09_E2E_BASE_URL = baseURL;
process.env.MED09_E2E_JWT_SECRET = testEnv.JWT_SECRET;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.cjs",
  globalTeardown: "./e2e/global-teardown.cjs",
  use: {
    baseURL,
    browserName: "chromium",
    launchOptions: { channel: "msedge" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
