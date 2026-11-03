import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// `npm run <script> -w @buskativa/web` roda com cwd = apps/web; a raiz do monorepo fica dois níveis acima.
const root = path.resolve(process.cwd(), "../..");
loadEnvConfig(root);

const config: NextConfig = {
  transpilePackages: ["@buskativa/core", "@buskativa/db", "@buskativa/queue"],
  serverExternalPackages: ["pg", "bullmq"],
  output: "standalone",
  outputFileTracingRoot: root,
};

export default config;
