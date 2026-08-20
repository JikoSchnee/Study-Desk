import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: { environment: "node", include: ["apps/**/*.test.ts", "apps/**/*.test.mjs", "packages/**/*.test.ts"] },
  resolve: { alias: {
    "@": fileURLToPath(new URL("./apps/desktop/src", import.meta.url)),
    "@service": fileURLToPath(new URL("./apps/service/server", import.meta.url)),
    "@shared": fileURLToPath(new URL("./packages/shared/src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./apps/desktop/src/test/server-only.ts", import.meta.url)),
  } },
});
