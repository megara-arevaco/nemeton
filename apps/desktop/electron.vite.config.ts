import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: ["@launcher/core"] })] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("@phosphor-icons/react")) return "phosphor-icons";
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react-vendor";
          },
        },
      },
    },
  },
});
