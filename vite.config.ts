import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { minifyHtml, injectHtml } from "vite-plugin-html";
import { VitePWA } from "vite-plugin-pwa";
import preload from "vite-plugin-preload";
import mkcert from "vite-plugin-mkcert";

const getPortFromCLI = () => {
  const portIndex = process.argv.findIndex((arg) => arg === "--port");
  if (portIndex !== -1 && process.argv[portIndex + 1]) {
    return Number(process.argv[portIndex + 1]);
  }
  return 3000; // Default port
};

// https://vitejs.dev/config/
export default defineConfig(() => {
  const port = getPortFromCLI();

  return {
    plugins: [
      // Dev-only: serve a kill-switch SW so stale cached service workers
      // from previous sessions are cleared automatically on the next SW update check.
      {
        name: "sw-kill-switch",
        configureServer(server) {
          server.middlewares.use("/sw.js", (_req, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(`
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evt) => {
  evt.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    await Promise.all(clients.map((c) => c.navigate(c.url).catch(() => {})));
    await self.registration.unregister();
  })());
});
`);
          });
        },
      },
      react({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),
      preload(),
      tsconfigPaths(),
      minifyHtml(),
      injectHtml({
        // TODO with API environment variables
        injectData: {},
      }),
      ...(port === 443
        ? [
            mkcert({
              hosts: ["https://127.0.0.1"],
            }),
          ]
        : []),
      VitePWA({
        devOptions: {
          enabled: false,
          type: "module",
          navigateFallback: "offline.html",
        },
        srcDir: "src",
        strategies: "injectManifest",
        includeManifestIcons: false,
        includeAssets: [
          "world/*",
          "pwa/**/*",
          "farms/*",
          "offline/*",
          "offline.html",
        ],
        injectManifest: {
          maximumFileSizeToCacheInBytes: 15000000,
          globPatterns: ["assets/*.{jpg,mp3,svg,gif,png}"],
          globIgnores: ["**/*.{js,css,html}"],
        },
        filename: "sw.ts",
        manifest: {
          name: "Sunflower Land",
          id: "com.sunflower-land",
          description:
            "🧑‍🌾 Install our app for a more seamless farming experience. Enjoy full-screen action, easy access, and exclusive features!",
          short_name: "Sunflower Land",
          start_url: process.env.VITE_NETWORK === "mainnet" ? "/play/" : "/",
          theme_color: "#303443",
          display: "standalone",
          background_color: "#0099dc",
          orientation: "portrait",
          icons: [
            {
              src: "pwa/icons/pwa-64x64.png",
              sizes: "64x64",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "pwa/icons/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "pwa/icons/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "pwa/icons/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          screenshots: [
            {
              src: "pwa/screenshots/1.jpg",
              sizes: "900x1680",
              type: "image/jpg",
              form_factor: "narrow",
            },
            {
              src: "pwa/screenshots/2.jpg",
              sizes: "900x1680",
              type: "image/jpg",
              form_factor: "narrow",
            },
          ],
        },
      }),
    ],
    // Addresses web3 issue
    resolve: {
      alias: {
        // Portal override: redirect to Factory Island portal wrapper
        "features/portal/PortalApp": path.resolve(
          __dirname,
          "src/features/portal/PortalApp",
        ),
        "src/assets": path.resolve(__dirname, "src/core/assets"),
        "src/components": path.resolve(__dirname, "src/core/components"),
        "src/features": path.resolve(__dirname, "src/core/features"),
        "src/lib": path.resolve(__dirname, "src/core/lib"),
        "src/engine": path.resolve(__dirname, "src/game"),
        "src/ui": path.resolve(__dirname, "src/ui"),
        process: "process/browser",
        stream: "stream-browserify",
        zlib: "browserify-zlib",
        util: "util",
      },
    },
    css: {
      modules: {},
    },
    base: "./",
    build: {
      chunkSizeWarningLimit: 1000,
      assetsDir: "assets",
      rollupOptions: {
        output: {
          manualChunks: {
            phaser: ["phaser"],
          },
        },
      },
    },
  };
});
