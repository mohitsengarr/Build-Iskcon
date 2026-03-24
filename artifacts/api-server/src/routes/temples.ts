import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  templesTable,
  milestonesTable,
  projectUpdatesTable,
  contributorsTable,
  insertTempleSchema,
  insertMilestoneSchema,
  insertUpdateSchema,
  insertContributorSchema,
} from "@workspace/db/schema";
import { eq, desc, count, sum } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

router.get("/stats", async (req, res) => {
  try {
    const temples = await db.select().from(templesTable);
    const allMilestones = await db.select().from(milestonesTable);
    const recentUpdates = await db
      .select()
      .from(projectUpdatesTable)
      .orderBy(desc(projectUpdatesTable.createdAt))
      .limit(5);

    const totalFundraisingGoal = temples.reduce(
      (sum, t) => sum + parseFloat(t.fundraisingGoal),
      0
    );
    const totalFundraisingRaised = temples.reduce(
      (sum, t) => sum + parseFloat(t.fundraisingRaised),
      0
    );

    const activeStatuses = ["planning", "construction", "finishing"];
    const activeProjects = temples.filter((t) =>
      activeStatuses.includes(t.status)
    ).length;

    const completedMilestones = allMilestones.filter(
      (m) => m.status === "completed"
    ).length;
    const upcomingMilestones = allMilestones.filter(
      (m) => m.status === "pending" || m.status === "in_progress"
    ).length;

    const templesByStatus: Record<string, number> = {};
    for (const temple of temples) {
      templesByStatus[temple.status] = (templesByStatus[temple.status] || 0) + 1;
    }

    res.json({
      totalTemples: temples.length,
      activeProjects,
      totalFundraisingGoal,
      totalFundraisingRaised,
      completedMilestones,
      upcomingMilestones,
      recentUpdates: recentUpdates.map(toUpdateResponse),
      templesByStatus,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get stats");
    res.status(500).json({ error: "Failed to get stats" });
  }
});

router.get("/temples", async (req, res) => {
  try {
    const temples = await db
      .select()
      .from(templesTable)
      .orderBy(desc(templesTable.createdAt));
    res.json(temples.map(toTempleResponse));
  } catch (err) {
    req.log.error({ err }, "Failed to list temples");
    res.status(500).json({ error: "Failed to list temples" });
  }
});

router.post("/temples", async (req, res) => {
  try {
    const input = insertTempleSchema.parse({
      ...req.body,
      constructionProgress: String(req.body.constructionProgress ?? 0),
      fundraisingGoal: String(req.body.fundraisingGoal ?? 0),
      fundraisingRaised: String(req.body.fundraisingRaised ?? 0),
    });
    const [temple] = await db.insert(templesTable).values(input).returning();
    res.status(201).json(toTempleResponse(temple));
  } catch (err) {
    req.log.error({ err }, "Failed to create temple");
    res.status(400).json({ error: "Failed to create temple" });
  }
});

router.get("/temples/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [temple] = await db
      .select()
      .from(templesTable)
      .where(eq(templesTable.id, id));

    if (!temple) {
      res.status(404).json({ error: "Temple not found" });
      return;
    }

    const [milestones, updates, contributors] = await Promise.all([
      db
        .select()
        .from(milestonesTable)
        .where(eq(milestonesTable.templeId, id))
        .orderBy(milestonesTable.targetDate),
      db
        .select()
        .from(projectUpdatesTable)
        .where(eq(projectUpdatesTable.templeId, id))
        .orderBy(desc(projectUpdatesTable.createdAt)),
      db
        .select()
        .from(contributorsTable)
        .where(eq(contributorsTable.templeId, id))
        .orderBy(desc(contributorsTable.createdAt)),
    ]);

    res.json({
      ...toTempleResponse(temple),
      milestones: milestones.map(toMilestoneResponse),
      updates: updates.map(toUpdateResponse),
      contributors: contributors.map(toContributorResponse),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get temple");
    res.status(500).json({ error: "Failed to get temple" });
  }
});

router.put("/temples/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body: Record<string, unknown> = { ...req.body };
    if (body.constructionProgress !== undefined)
      body.constructionProgress = String(body.constructionProgress);
    if (body.fundraisingGoal !== undefined)
      body.fundraisingGoal = String(body.fundraisingGoal);
    if (body.fundraisingRaised !== undefined)
      body.fundraisingRaised = String(body.fundraisingRaised);

    const [updated] = await db
      .update(templesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(templesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Temple not found" });
      return;
    }
    res.json(toTempleResponse(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update temple");
    res.status(400).json({ error: "Failed to update temple" });
  }
});

router.get("/temples/:id/milestones", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const milestones = await db
      .select()
      .from(milestonesTable)
      .where(eq(milestonesTable.templeId, id))
      .orderBy(milestonesTable.targetDate);
    res.json(milestones.map(toMilestoneResponse));
  } catch (err) {
    req.log.error({ err }, "Failed to list milestones");
    res.status(500).json({ error: "Failed to list milestones" });
  }
});

router.post("/temples/:id/milestones", async (req, res) => {
  try {
    const templeId = parseInt(req.params.id);
    const input = insertMilestoneSchema.parse({ ...req.body, templeId });
    const [milestone] = await db
      .insert(milestonesTable)
      .values(input)
      .returning();
    res.status(201).json(toMilestoneResponse(milestone));
  } catch (err) {
    req.log.error({ err }, "Failed to create milestone");
    res.status(400).json({ error: "Failed to create milestone" });
  }
});

router.put("/milestones/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db
      .update(milestonesTable)
      .set(req.body)
      .where(eq(milestonesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }
    res.json(toMilestoneResponse(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update milestone");
    res.status(400).json({ error: "Failed to update milestone" });
  }
});

router.get("/temples/:id/updates", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = await db
      .select()
      .from(projectUpdatesTable)
      .where(eq(projectUpdatesTable.templeId, id))
      .orderBy(desc(projectUpdatesTable.createdAt));
    res.json(updates.map(toUpdateResponse));
  } catch (err) {
    req.log.error({ err }, "Failed to list updates");
    res.status(500).json({ error: "Failed to list updates" });
  }
});

router.post("/temples/:id/updates", async (req, res) => {
  try {
    const templeId = parseInt(req.params.id);
    const input = insertUpdateSchema.parse({ ...req.body, templeId });
    const [update] = await db
      .insert(projectUpdatesTable)
      .values(input)
      .returning();
    res.status(201).json(toUpdateResponse(update));
  } catch (err) {
    req.log.error({ err }, "Failed to create update");
    res.status(400).json({ error: "Failed to create update" });
  }
});

router.get("/temples/:id/contributors", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const contributors = await db
      .select()
      .from(contributorsTable)
      .where(eq(contributorsTable.templeId, id))
      .orderBy(desc(contributorsTable.createdAt));
    res.json(contributors.map(toContributorResponse));
  } catch (err) {
    req.log.error({ err }, "Failed to list contributors");
    res.status(500).json({ error: "Failed to list contributors" });
  }
});

router.post("/temples/:id/contributors", async (req, res) => {
  try {
    const templeId = parseInt(req.params.id);
    const body: Record<string, unknown> = { ...req.body, templeId };
    if (body.amount !== undefined) body.amount = String(body.amount);
    const input = insertContributorSchema.parse(body);
    const [contributor] = await db
      .insert(contributorsTable)
      .values(input)
      .returning();
    res.status(201).json(toContributorResponse(contributor));
  } catch (err) {
    req.log.error({ err }, "Failed to add contributor");
    res.status(400).json({ error: "Failed to add contributor" });
  }
});

function toTempleResponse(t: typeof templesTable.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    location: t.location,
    deity: t.deity,
    description: t.description,
    status: t.status,
    phase: t.phase,
    constructionProgress: parseFloat(t.constructionProgress),
    fundraisingProgress:
      parseFloat(t.fundraisingGoal) > 0
        ? (parseFloat(t.fundraisingRaised) / parseFloat(t.fundraisingGoal)) *
          100
        : 0,
    fundraisingGoal: parseFloat(t.fundraisingGoal),
    fundraisingRaised: parseFloat(t.fundraisingRaised),
    startDate: t.startDate,
    expectedCompletion: t.expectedCompletion,
    projectLead: t.projectLead,
    coverImage: t.coverImage ?? null,
    donateUrl: t.donateUrl ?? null,
    latitude: t.latitude ? parseFloat(t.latitude) : null,
    longitude: t.longitude ? parseFloat(t.longitude) : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function toMilestoneResponse(m: typeof milestonesTable.$inferSelect) {
  return {
    id: m.id,
    templeId: m.templeId,
    title: m.title,
    description: m.description,
    status: m.status,
    targetDate: m.targetDate,
    completedDate: m.completedDate ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

function toUpdateResponse(u: typeof projectUpdatesTable.$inferSelect) {
  return {
    id: u.id,
    templeId: u.templeId,
    title: u.title,
    content: u.content,
    author: u.author,
    category: u.category,
    createdAt: u.createdAt.toISOString(),
  };
}

function toContributorResponse(c: typeof contributorsTable.$inferSelect) {
  return {
    id: c.id,
    templeId: c.templeId,
    name: c.name,
    role: c.role,
    contribution: c.contribution,
    amount: c.amount ? parseFloat(c.amount) : null,
    avatar: c.avatar ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export default router;
