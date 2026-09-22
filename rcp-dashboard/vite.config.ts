import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/local": "http://localhost:8080",
      "/status": "http://localhost:8080",
    },
  },
});
