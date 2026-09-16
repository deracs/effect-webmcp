import { defineConfig } from "vitest/config";

export default defineConfig({
  // The workspace library must use the same Effect instance as the app.
  resolve: { dedupe: ["effect"] },
  test: { environment: "happy-dom", include: ["src/**/*.test.ts*"] },
});
