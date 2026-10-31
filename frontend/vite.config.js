import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API runs on :3000. Proxying /api keeps the browser same-origin (no CORS, SSE just works).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
