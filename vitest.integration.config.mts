import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "vitest/config";

// Integration tests run only against the isolated local stack (port 55321).
if (existsSync(".env.test.local")) loadEnvFile(".env.test.local");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
