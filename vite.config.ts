import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { sidepanel: "sidepanel.html" },
    },
  },
  test: {
    environment: "node",
  },
});
