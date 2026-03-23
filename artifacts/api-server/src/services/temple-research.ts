import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { templesTable, projectUpdatesTable, syncJobsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

interface TempleResearchResult {
  constructionProgress: number;
  phase: string;
  fundraisingRaisedDelta: number;
  update: {
    title: string;
    content: string;
    category: "construction" | "fundraising" | "spiritual" | "logistics" | "general";
  };
}

async function researchTemple(temple: typeof templesTable.$inferSelect): Promise<TempleResearchResult | null> {
  const currentProgress = parseFloat(temple.constructionProgress as string);
  const currentRaised = parseFloat(temple.fundraisingRaised as string);
  const goal = parseFloat(temple.fundraisingGoal as string);

  const prompt = `You are an ISKCON project intelligence analyst. Generate a realistic data update for the following active temple project. Do NOT fabricate historical facts — provide plausible incremental updates as if time has passed since the last data sync.

Temple: ${temple.name}
Location: ${temple.location}
Deity: ${temple.deity}
Current Phase: ${temple.phase}
Construction Progress: ${currentProgress}%
Status: ${temple.status}
Fundraising Goal: $${(goal / 1_000_000).toFixed(1)}M
Fundraising Raised: $${(currentRaised / 1_000_000).toFixed(1)}M

Return ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:
{
  "constructionProgress": <number between ${Math.min(currentProgress, 99)} and ${Math.min(currentProgress + 3, 100)}>,
  "phase": "<current phase name — can be same or slightly updated>",
  "fundraisingRaisedDelta": <new USD amount raised since last update, between 50000 and 800000>,
  "update": {
    "title": "<concise, specific update title for this temple>",
    "content": "<2-3 sentence detailed update reflecting spiritual and construction progress>",
    "category": "<one of: construction, fundraising, spiritual, logistics, general>"
  }
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (block.type !== "text") return null;

    const raw = block.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(raw) as TempleResearchResult;
    return parsed;
  } catch (err) {
    logger.error({ err, templeId: temple.id, templeName: temple.name }, "Claude research failed for temple");
    return null;
  }
}

export async function runTempleSync(): Promise<{ jobId: number; templesUpdated: number; updatesCreated: number }> {
  const [job] = await db
    .insert(syncJobsTable)
    .values({ status: "running", templesUpdated: 0, updatesCreated: 0 })
    .returning();

  const temples = await db.select().from(templesTable);
  let templesUpdated = 0;
  let updatesCreated = 0;

  for (const temple of temples) {
    try {
      const research = await researchTemple(temple);
      if (!research) continue;

      const currentRaised = parseFloat(temple.fundraisingRaised as string);
      const goal = parseFloat(temple.fundraisingGoal as string);
      const newRaised = Math.min(currentRaised + research.fundraisingRaisedDelta, goal);

      await db
        .update(templesTable)
        .set({
          constructionProgress: research.constructionProgress.toFixed(2),
          phase: research.phase,
          fundraisingRaised: newRaised.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(templesTable.id, temple.id));

      await db.insert(projectUpdatesTable).values({
        templeId: temple.id,
        title: research.update.title,
        content: research.update.content,
        author: "ISKCON Intelligence",
        category: research.update.category,
      });

      templesUpdated++;
      updatesCreated++;
      logger.info({ templeId: temple.id, templeName: temple.name }, "Temple synced via Claude");
    } catch (err) {
      logger.error({ err, templeId: temple.id }, "Failed to sync temple");
    }
  }

  await db
    .update(syncJobsTable)
    .set({ status: "completed", templesUpdated, updatesCreated, completedAt: new Date() })
    .where(eq(syncJobsTable.id, job.id));

  return { jobId: job.id, templesUpdated, updatesCreated };
}

export async function getLatestSyncJob() {
  const jobs = await db
    .select()
    .from(syncJobsTable)
    .orderBy(syncJobsTable.startedAt)
    .limit(1);
  return jobs[0] ?? null;
}
