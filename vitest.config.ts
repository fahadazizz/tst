import { defineConfig } from "vitest/config";
import path from "path";

// Pure-logic unit tests only for now (no jsdom/React rendering configured
// yet) — see src/lib/__tests__ for scope. Add a jsdom environment + React
// Testing Library when component-level tests are actually written; don't
// carry an unused dependency for tests that don't exist.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
