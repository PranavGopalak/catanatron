import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envPrefix: "CTRON_",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("@mui") ||
            id.includes("@emotion") ||
            id.includes("notistack")
          ) {
            return "ui-vendor";
          }
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("react-router")
          ) {
            return "react-vendor";
          }
          if (id.includes("axios")) return "network-vendor";
          if (
            id.includes("react-zoom-pan-pinch") ||
            id.includes("react-spinners")
          ) {
            return "interaction-vendor";
          }
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "vitest.setup.ts",
  },
  server: {
    port: 3000,
    host: true, // needed for the Docker Container port mapping to work
  },
});
