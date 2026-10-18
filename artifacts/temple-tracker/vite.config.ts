import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

/**
 * wall.bhagwatham.com serves the same app, but a link to it should preview as
 * the Krishna wallpaper, not the temple tracker — and link previews never run
 * JavaScript. So the build writes a second copy of index.html with the
 * wallpaper's own title and image into wall/index.html, which vercel.json
 * serves for that host.
 */
function wallpaperPage(): Plugin {
  return {
    name: "wallpaper-page",
    apply: "build",
    async closeBundle() {
      const { wallpaperHead } = await import("./src/lib/wallpaper");
      const { KRISHNA_WALLPAPERS } = await import("./src/data/krishnaWallpapers");
      const outDir = path.resolve(import.meta.dirname, "dist/public");
      const html = fs.readFileSync(path.join(outDir, "index.html"), "utf-8");
      fs.mkdirSync(path.join(outDir, "wall"), { recursive: true });
      fs.writeFileSync(path.join(outDir, "wall", "index.html"), wallpaperHead(html, {
        title: "Krishna Wallpaper — a new darshan every 15 minutes | Bhagwatham",
        description: "Paintings of Krishna with His words from the Bhagavad Gita, changing every quarter-hour. Leave it open, put it on a TV, or save one as your phone wallpaper.",
        image: KRISHNA_WALLPAPERS[0].src,
        imageSize: [1344, 1088],
        url: "https://wall.bhagwatham.com/",
        siteName: "Bhagwatham",
        keywords: "Krishna wallpaper, Krishna HD wallpaper, Bhagavad Gita quotes, Krishna painting, live wallpaper, ISKCON",
      }));
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    wallpaperPage(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          "vendor-react": ["react", "react-dom"],
          // Routing + query
          "vendor-query": ["@tanstack/react-query"],
          // Animation
          "vendor-motion": ["framer-motion"],
          // Charts
          "vendor-charts": ["recharts"],
          // Map
          "vendor-map": ["react-simple-maps"],
          // Radix UI
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
          ],
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
