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
import { startGitaCron } from "./cron/gita-cron";

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

  // One-time: fix "Canto 0" images in manifest (assign correct canto numbers)
  try {
    const { backfillManifestCantoNumbers } = await import("./services/bhagwatham-image-gen");
    const fixed = backfillManifestCantoNumbers();
    if (fixed > 0) logger.info({ fixed }, "Backfilled canto numbers on startup");
  } catch (err) { logger.warn({ err }, "Canto backfill failed"); }

  // Bhagwatham OCR + audit + image gen + re-OCR (Sarvam AI)
  startBhagwathamCron();

  // Gita OCR (SEN-84) — ON HOLD, disabled by user request
  // startGitaCron();

  // Instagram — DISABLED locally, now runs on Supabase Edge Function (pg_cron every 3h)
  // 1 post per chapter, posted to Buffer (Instagram + Threads)
  // startInstagramCron();

  // Temple Discovery
  startTempleDiscoveryCron();

  // Shlok indexer — scans OCR pages and builds shlok dictionary in Supabase
  (await import("node-cron")).default.schedule("4,14,24,34,44,54 * * * *", async () => {
    try {
      const { indexNextBatch } = await import("./services/shlok-indexer");
      const result = await indexNextBatch();
      if (result.inserted > 0 || result.updated > 0) {
        logger.info(result, "Shlok indexer tick");
      }
    } catch (err) { logger.error({ err }, "Shlok indexer cron failed"); }
  });

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
