import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { templesTable, projectUpdatesTable, syncJobsTable } from "@workspace/db/schema";
import { eq, desc, isNotNull } from "drizzle-orm";

const router: IRouter = Router();

router.get("/social/feed", async (req, res) => {
  try {
    const limit = Math.min(parseInt((req.query as any).limit ?? "20"), 50);

    const updates = await db
      .select({
        id: projectUpdatesTable.id,
        title: projectUpdatesTable.title,
        content: projectUpdatesTable.content,
        author: projectUpdatesTable.author,
        category: projectUpdatesTable.category,
        imageUrl: projectUpdatesTable.imageUrl,
        sourceUrl: projectUpdatesTable.sourceUrl,
        likes: projectUpdatesTable.likes,
        hashtags: projectUpdatesTable.hashtags,
        createdAt: projectUpdatesTable.createdAt,
        templeId: projectUpdatesTable.templeId,
        templeName: templesTable.name,
        templeLocation: templesTable.location,
        templeStatus: templesTable.status,
      })
      .from(projectUpdatesTable)
      .innerJoin(templesTable, eq(projectUpdatesTable.templeId, templesTable.id))
      .where(isNotNull(projectUpdatesTable.imageUrl))
      .orderBy(desc(projectUpdatesTable.createdAt))
      .limit(limit);

    const allTemples = await db
      .select({
        id: templesTable.id,
        name: templesTable.name,
        location: templesTable.location,
        status: templesTable.status,
      })
      .from(templesTable)
      .limit(10);

    res.json({ posts: updates, temples: allTemples });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch social feed" });
  }
});

router.post("/social/posts/:id/like", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [post] = await db
      .select({ likes: projectUpdatesTable.likes })
      .from(projectUpdatesTable)
      .where(eq(projectUpdatesTable.id, id));
    if (!post) return res.status(404).json({ error: "Post not found" });
    const [updated] = await db
      .update(projectUpdatesTable)
      .set({ likes: (post.likes ?? 0) + 1 })
      .where(eq(projectUpdatesTable.id, id))
      .returning({ likes: projectUpdatesTable.likes });
    res.json({ likes: updated?.likes });
  } catch (err) {
    res.status(500).json({ error: "Failed to like post" });
  }
});

// Latest sync job status — shown in the Social Hub banner
router.get("/social/sync-status", async (_req, res) => {
  try {
    const [latest] = await db
      .select()
      .from(syncJobsTable)
      .orderBy(desc(syncJobsTable.startedAt))
      .limit(1);

    res.json({
      lastSync: latest
        ? {
            jobId: latest.id,
            status: latest.status,
            templesUpdated: latest.templesUpdated,
            templesAdded: latest.templesAdded,
            socialPostsCreated: latest.updatesCreated,
            startedAt: latest.startedAt,
            completedAt: latest.completedAt,
          }
        : null,
      nextSyncHint: "Every hour at :00",
      cronSchedule: "0 * * * *",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sync status" });
  }
});

export default router;
