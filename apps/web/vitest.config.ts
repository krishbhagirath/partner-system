import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the `@/*` path in tsconfig.json.
      "@": resolve(__dirname, "./src"),
      // lab-partner.ts and friends start with `import "server-only"`, which throws
      // outside a React Server Component. Stub it so server modules are importable
      // from tests. The pure modules (team-rules, section-key) don't need this, but
      // anything that pulls them in transitively does.
      "server-only": resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
