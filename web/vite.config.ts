import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_TARGET = process.env.SPEAKING_REVIEW_SERVER ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": join(dirname(fileURLToPath(import.meta.url)), "../shared"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true,
    proxy: {
      "/api": { target: SERVER_TARGET, changeOrigin: true },
      "/files": { target: SERVER_TARGET, changeOrigin: true },
    },
  },
});
