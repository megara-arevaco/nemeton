import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@launcher/core"] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          "ludusavi-worker": resolve("src/main/ludusavi-worker.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { output: { format: "cjs", entryFileNames: "index.cjs" } },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("@phosphor-icons/react")) {
              return "phosphor-icons";
            }
            if (
              id.includes("node_modules/react") ||
              id.includes("node_modules/react-dom")
            ) {
              return "react-vendor";
            }
          },
        },
      },
    },
  },
});
