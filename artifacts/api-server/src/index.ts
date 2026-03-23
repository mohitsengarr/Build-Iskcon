import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { runTempleSync } from "./services/temple-research";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// If PRODUCTION_API_URL is set, the cron delegates the sync to the production
// server via HTTP so production data is updated even when running locally.
// In production itself, PRODUCTION_API_URL is not set so the server syncs its
// own (production) database directly.
const PRODUCTION_API_URL = process.env["PRODUCTION_API_URL"]?.replace(/\/$/, "") ?? null;

async function triggerSync(): Promise<void> {
  const fireTime = new Date().toISOString();

  if (PRODUCTION_API_URL) {
    // Delegate to the live production server so it updates the production DB
    logger.info({ fireTime, target: PRODUCTION_API_URL }, "Cron firing — delegating sync to production API");
    try {
      const res = await fetch(`${PRODUCTION_API_URL}/api/sync`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        logger.info({ ...body, fireTime }, "Production sync triggered successfully");
      } else {
        logger.warn({ status: res.status, body, fireTime }, "Production sync returned non-2xx status");
      }
    } catch (err) {
      logger.error({ err, fireTime }, "Failed to reach production API for sync");
    }
  } else {
    // Running in production (or dev without PRODUCTION_API_URL) — sync local DB
    logger.info({ fireTime }, "Scheduled hourly sync starting — updating temples + social hub posts");
    try {
      const result = await runTempleSync();
      logger.info(
        { ...result, socialPostsCreated: result.updatesCreated, fireTime },
        "Scheduled sync completed — social hub posts written to DB"
      );
    } catch (err) {
      logger.error({ err }, "Scheduled sync failed");
    }
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  cron.schedule("0 * * * *", triggerSync);

  const mode = PRODUCTION_API_URL
    ? `delegating to ${PRODUCTION_API_URL}`
    : "syncing local database";
  logger.info(`Cron job scheduled: temple data sync — fires every hour (0 * * * *) — ${mode}`);
});
