import { Router } from "express";
import { runTempleDiscovery } from "../cron/temple-discovery-cron";

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

export default router;
