import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // Match your current running port
    proxy: {
      "/shows": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/bookings": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
