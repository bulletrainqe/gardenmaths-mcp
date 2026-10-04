import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The planting and frost data live in the GardenMaths repository next to this one.
const gardenmaths = fileURLToPath(new URL("../Garden Project Planner 3D/", import.meta.url)).replace(/\\/g, "/");

export default defineConfig({
  resolve: {
    alias: [{ find: /^@gardenmaths\//, replacement: gardenmaths }],
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
