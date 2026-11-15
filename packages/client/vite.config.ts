import { defineConfig } from "vite";
import { cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/audit/",
  plugins: [
    react(),
    {
      name: "local-pdf-assets",
      async closeBundle() {
        await cp(
          fileURLToPath(
            new URL("./node_modules/pdfjs-dist/LICENSE", import.meta.url),
          ),
          fileURLToPath(new URL("./dist/PDFJS-LICENSE.txt", import.meta.url)),
        );
        for (const folder of ["cmaps", "standard_fonts", "wasm"]) {
          await cp(
            fileURLToPath(
              new URL(`./node_modules/pdfjs-dist/${folder}`, import.meta.url),
            ),
            fileURLToPath(new URL(`./dist/pdfjs/${folder}`, import.meta.url)),
            { recursive: true },
          );
        }
      },
    },
  ],
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
