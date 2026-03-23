import { Router } from "express";
import { db } from "@workspace/db";
import { syncJobsTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
import { runTempleSync } from "../services/temple-research";
import { logger } from "../lib/logger";

const router = Router();

let syncInProgress = false;

router.post("/sync", async (_req, res) => {
  if (syncInProgress) {
    res.status(409).json({ error: "A sync is already in progress" });
    return;
  }

  syncInProgress = true;
  logger.info("Manual sync triggered");

  runTempleSync()
    .then((result) => {
      logger.info(result, "Sync completed");
    })
    .catch((err) => {
      logger.error({ err }, "Sync failed");
    })
    .finally(() => {
      syncInProgress = false;
    });

  res.status(202).json({ message: "Sync started", inProgress: true });
});

router.get("/sync/status", async (_req, res) => {
  const jobs = await db
    .select()
    .from(syncJobsTable)
    .orderBy(desc(syncJobsTable.startedAt))
    .limit(5);

  res.json({
    inProgress: syncInProgress,
    latestJob: jobs[0] ?? null,
    recentJobs: jobs,
  });
});

export default router;
