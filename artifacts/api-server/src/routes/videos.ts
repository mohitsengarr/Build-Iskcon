import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { templeVideosTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/videos", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || "8"), 20);
    const videos = await db
      .select()
      .from(templeVideosTable)
      .orderBy(desc(templeVideosTable.createdAt))
      .limit(limit);
    res.json(videos);
  } catch (err) {
    req.log.error({ err }, "Failed to list videos");
    res.status(500).json({ error: "Failed to list videos" });
  }
});

export default router;
