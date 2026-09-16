import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "mm-cal-js": path.resolve(
        __dirname,
        "./node_modules/mm-cal-js/dist/index.modern.js",
      ),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    env: {
      NEXT_PUBLIC_BASE_API_URL: "http://localhost:8000/api/v1",
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environmentMatchGlobs: [
      ["**/*.test.tsx", "happy-dom"],
      ["**/*.test.ts", "node"],
    ],
  },
});
