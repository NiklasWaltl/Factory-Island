/**
 * Vite config for Factory Island.
 *
 * Usage:
 *   yarn dev
 *   yarn build
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: ".",
  plugins: [
    // Rewrite "/" to "/index.factory.html" so the dev-server serves the
    // correct entry without requiring a renamed file.
    {
      name: "factory-html-fallback",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/" || req.url === "/index.html") {
            req.url = "/index.factory.html";
          }
          next();
        });
      },
    },
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
  ],
  // No resolve.alias needed — src/game/** uses only relative imports.
  css: {
    modules: {},
  },
  server: {
    host: true,
    port: 3000,
  },
  base: "./",
  build: {
    outDir: "dist-factory",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    assetsDir: "assets",
    rollupOptions: {
      input: "index.factory.html",
      output: {
        manualChunks: {
          phaser: ["phaser"],
        },
      },
    },
  },
  optimizeDeps: {
    entries: ["index.factory.html"],
  },
});
