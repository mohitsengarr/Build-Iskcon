import { Router } from "express";

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

export default router;
