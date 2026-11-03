import { defineConfig } from "@playwright/test";

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://buskativa:buskativa@localhost:5432/buskativa",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  CONNECTORS: "demo",
  AFFILIATE_PARAMS_MERCADOLIVRE: "matt_tool=e2e",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: [
    { command: "npm run start -w @buskativa/worker", cwd: "../..", env, reuseExistingServer: false, timeout: 60_000, wait: { stdout: /worker ativo/ } },
    { command: "npm run dev", port: 3000, env, reuseExistingServer: false, timeout: 120_000 },
  ],
});
