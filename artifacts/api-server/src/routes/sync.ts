import { Router } from "express";
import { runTempleDiscovery, runTempleMonitor } from "../cron/temple-discovery-cron";
import { commitAndPush } from "../cron/daily-commit-cron";
import { checkAllDonateLinks, monitorTemplesTick } from "../services/temple-monitor";

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

// POST /api/temples/monitor — manually trigger the daily monitoring tick
router.post("/temples/monitor", async (_req, res) => {
  try {
    await runTempleMonitor();
    res.json({ success: true, message: "Temple monitoring tick complete" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Monitor failed" });
  }
});

// POST /api/temples/check-links — HEAD/GET every donate URL right now and save status
router.post("/temples/check-links", async (_req, res) => {
  try {
    const result = await checkAllDonateLinks();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Link check failed" });
  }
});

// POST /api/temples/monitor/full — run a single monitor tick with explicit options
router.post("/temples/monitor/full", async (req, res) => {
  try {
    const batchSize = Math.min(Math.max(parseInt(req.body?.batchSize, 10) || 12, 1), 60);
    const result = await monitorTemplesTick({ batchSize, alsoFullLinkCheck: true });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Monitor failed" });
  }
});

// POST /api/deploy — manually trigger git commit + push (daily commit on demand)
router.post("/deploy", async (_req, res) => {
  try {
    const result = await commitAndPush();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Deploy failed" });
  }
});

export default router;
