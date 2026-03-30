import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/social/feed", (_req, res) => {
  res.json({ posts: [], temples: [] });
});

router.post("/social/posts/:id/like", (_req, res) => {
  res.json({ likes: 1 });
});

router.get("/social/sync-status", (_req, res) => {
  res.json({
    lastSync: null,
    nextSyncHint: "Static data — no sync needed",
    cronSchedule: null,
  });
});

export default router;
