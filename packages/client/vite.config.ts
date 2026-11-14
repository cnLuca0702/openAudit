import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/audit/",
  plugins: [react()],
  server: {
    proxy: {
      "/api/audit": {
        target: process.env.AUDIT_API_ORIGIN || "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
