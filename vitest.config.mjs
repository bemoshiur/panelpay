import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    allowOnly: false,
    projects: [
      "apps/*",
      "packages/*",
      "functions/*",
      "pro/*",
      {
        // tests/isolation: the local checks always run; the real-pool part skips itself (10.4).
        test: { name: "isolation", include: ["tests/isolation/**/*.test.ts"] },
      },
      {
        test: {
          name: "repo",
          include: ["tests/repo/**/*.test.mjs", "scripts/**/*.test.mjs"],
        },
      },
    ],
  },
});
