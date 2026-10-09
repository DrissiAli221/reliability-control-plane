import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // amazon-cognito-identity-js pulls in the `buffer` package, which reads Node's `global` and throws without it.
  define: { global: "globalThis" },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/testSetup.ts"],
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
