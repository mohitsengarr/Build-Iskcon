import { Router } from "express";
import { runTempleDiscovery } from "../cron/temple-discovery-cron";
import { commitAndPush } from "../cron/daily-commit-cron";

const router = Router();

router.post("/sync", (_req, res) => {
  res.status(202).json({ message: "Sync not needed — using static data", inProgress: false });
});

router.get("/sync/status", (_req, res) => {
  res.json({
    inProgress: false,
    latestJob: null,
    recentJobs: [],
  });
});

// POST /api/discover-temples — manually trigger temple discovery
router.post("/discover-temples", async (_req, res) => {
  try {
    await runTempleDiscovery();
    res.json({ success: true, message: "Temple discovery completed" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Discovery failed" });
  }
});

// POST /api/deploy — manually trigger git commit + push (daily commit on demand)
router.post("/deploy", (_req, res) => {
  try {
    const result = commitAndPush();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Deploy failed" });
  }
});

export default router;
