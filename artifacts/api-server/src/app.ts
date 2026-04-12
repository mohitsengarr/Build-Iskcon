import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { startBhagwathamCron } from "./cron/bhagwatham-cron";
import { startInstagramCron } from "./cron/instagram-cron";
import { startTempleDiscoveryCron } from "./cron/temple-discovery-cron";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const IS_DEV = process.env.NODE_ENV !== "production";

export async function createApp(): Promise<Express> {
  const app: Express = express();

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", router);

  // Start Bhagwatham PDF processing cron (every 10 minutes)
  startBhagwathamCron();

  // Start Instagram posting cron (every 6 hours — reverse chapter order)
  startInstagramCron();

  // Start temple discovery cron (hourly — Firecrawl + Claude → Supabase)
  startTempleDiscoveryCron();

  if (IS_DEV) {
    // In development, use Vite's dev server as middleware for HMR + frontend
    const { createServer: createViteServer } = await import("vite");
    const viteRoot = path.resolve(__dirname, "..", "..", "temple-tracker");
    const vite = await createViteServer({
      root: viteRoot,
      configFile: path.join(viteRoot, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    logger.info("Vite dev middleware attached — single monolith server");
  } else {
    // In production, serve the pre-built temple-tracker frontend.
    const staticDir = path.join(__dirname, "..", "..", "temple-tracker", "dist", "public");
    app.use(express.static(staticDir));
    // SPA fallback — let React Router handle all non-API paths
    app.use((_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  return app;
}
