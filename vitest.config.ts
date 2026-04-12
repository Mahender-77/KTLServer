import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    include: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
  },
});
