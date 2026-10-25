import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "static-pages"),
  publicDir: resolve(__dirname, "public"),
  plugins: [
    react(),
    {
      name: "cloudflare-pages-spa-fallback",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "_redirects",
          source: "/* /index.html 200\n",
        });
      },
    },
  ],
  build: {
    outDir: resolve(__dirname, "dist-pages"),
    emptyOutDir: true,
  },
});
