import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import {
  templesTable,
  projectUpdatesTable,
  milestonesTable,
  syncJobsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---------- Curated temple image pool ----------

const TEMPLE_IMAGES: Record<string, string[]> = {
  construction: [
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1567789884554-0b844b597180?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&h=600&fit=crop",
  ],
  spiritual: [
    "https://images.unsplash.com/photo-1568454537842-d933259bb258?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1548013146-72479768bada?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=800&h=600&fit=crop",
  ],
  fundraising: [
    "https://images.unsplash.com/photo-1548013146-72479768bada?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1536099629323-44ada70de5a4?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=800&h=600&fit=crop",
  ],
  logistics: [
    "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1567789884554-0b844b597180?w=800&h=600&fit=crop",
  ],
  general: [
    "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1568454537842-d933259bb258?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1548013146-72479768bada?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?w=800&h=600&fit=crop",
  ],
};

function pickImage(category: string): string {
  const pool = TEMPLE_IMAGES[category] ?? TEMPLE_IMAGES.general;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function generateLikes(): number {
  return Math.floor(Math.random() * 1800) + 200;
}

function generateHashtags(category: string, templeName: string): string {
  const slug = templeName.replace(/\s+/g, "").substring(0, 16);
  const base: Record<string, string[]> = {
    construction: ["#ISKCONConstruction", "#VedicArchitecture", "#TempleBuilding", `#${slug}`],
    spiritual: ["#HareKrishna", "#VedicCulture", "#SpiritualJourney", `#${slug}`],
    fundraising: ["#ISKCONFundraising", "#DharmaProject", "#VedicCentre", `#${slug}`],
    logistics: ["#ProjectUpdate", "#ISKCONLogistics", "#TempleProject", `#${slug}`],
    general: ["#ISKCON", "#VedicTemple", "#GlobalISKCON", `#${slug}`],
  };
  const tags = base[category] ?? base.general!;
  return tags.join(" ");
}

// ---------- Types ----------

interface TempleUpdateResult {
  constructionProgress: number;
  phase: string;
  fundraisingRaisedDelta: number;
  update: {
    title: string;
    content: string;
    category: "construction" | "fundraising" | "spiritual" | "logistics" | "general";
  };
}

interface NewTempleResult {
  name: string;
  location: string;
  deity: string;
  description: string;
  status: "planning" | "construction" | "finishing" | "consecrated" | "operational";
  phase: string;
  constructionProgress: number;
  fundraisingGoal: number;
  fundraisingRaised: number;
  startDate: string;
  expectedCompletion: string;
  projectLead: string;
  milestones: Array<{
    title: string;
    description: string;
    status: "pending" | "in_progress" | "completed";
    targetDate: string;
  }>;
  initialUpdate: {
    title: string;
    content: string;
    category: "construction" | "fundraising" | "spiritual" | "logistics" | "general";
  };
}

// ---------- Update existing temples ----------

async function researchTemple(
  temple: typeof templesTable.$inferSelect
): Promise<TempleUpdateResult | null> {
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
    return JSON.parse(raw) as TempleUpdateResult;
  } catch (err) {
    logger.error({ err, templeId: temple.id, templeName: temple.name }, "Claude research failed for temple");
    return null;
  }
}

// ---------- Discover new temples ----------

async function discoverNewTemples(
  existingNames: string[]
): Promise<NewTempleResult[]> {
  const exclusionList = existingNames.map((n) => `- ${n}`).join("\n");

  const prompt = `You are an ISKCON global project intelligence researcher. Your job is to identify real or highly plausible ISKCON temple construction projects happening worldwide that should be tracked.

The following projects are ALREADY tracked — do NOT include them:
${exclusionList}

Discover exactly 2 NEW ISKCON temple or Vedic cultural centre projects from different global regions (e.g. Europe, Americas, Africa, Southeast Asia, Middle East, Australia). These should be distinct from Indian-subcontinent projects already tracked. Base them on known ISKCON expansion patterns, real cities with ISKCON presence, and plausible project scales.

Return ONLY a valid JSON array (no markdown, no explanation) with exactly 2 objects, each matching this schema:
[
  {
    "name": "<official Sanskrit/English project name>",
    "location": "<City, Country>",
    "deity": "<primary deity — e.g. Radha Krishna, Gaura Nitai, etc.>",
    "description": "<2-3 sentence description of the project vision and significance>",
    "status": "<one of: planning, construction, finishing, consecrated, operational>",
    "phase": "<current construction phase name>",
    "constructionProgress": <integer 0-85>,
    "fundraisingGoal": <total USD goal as integer, e.g. 12000000>,
    "fundraisingRaised": <USD raised so far as integer>,
    "startDate": "<YYYY-MM-DD>",
    "expectedCompletion": "<YYYY-MM-DD>",
    "projectLead": "<name of project lead or initiating devotee>",
    "milestones": [
      {
        "title": "<milestone name>",
        "description": "<one sentence>",
        "status": "<pending|in_progress|completed>",
        "targetDate": "<YYYY-MM-DD>"
      }
    ],
    "initialUpdate": {
      "title": "<first project update headline>",
      "content": "<2-3 sentence update announcing the project or a key achievement>",
      "category": "<construction|fundraising|spiritual|logistics|general>"
    }
  }
]

Include 3-5 milestones per temple. Make the data realistic, geographically diverse, and consistent with ISKCON's known global expansion in 2024-2026.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (block.type !== "text") return [];

    const raw = block.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(raw) as NewTempleResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.error({ err }, "Claude discovery of new temples failed");
    return [];
  }
}

// ---------- Insert a newly discovered temple ----------

async function insertDiscoveredTemple(temple: NewTempleResult): Promise<number | null> {
  try {
    const [inserted] = await db
      .insert(templesTable)
      .values({
        name: temple.name,
        location: temple.location,
        deity: temple.deity,
        description: temple.description,
        status: temple.status,
        phase: temple.phase,
        constructionProgress: temple.constructionProgress.toFixed(2),
        fundraisingGoal: temple.fundraisingGoal.toFixed(2),
        fundraisingRaised: temple.fundraisingRaised.toFixed(2),
        startDate: temple.startDate,
        expectedCompletion: temple.expectedCompletion,
        projectLead: temple.projectLead,
      })
      .returning({ id: templesTable.id });

    if (!inserted) return null;
    const templeId = inserted.id;

    if (temple.milestones?.length) {
      await db.insert(milestonesTable).values(
        temple.milestones.map((m) => ({
          templeId,
          title: m.title,
          description: m.description,
          status: m.status,
          targetDate: m.targetDate,
        }))
      );
    }

    const category = temple.initialUpdate.category;
    const image = pickImage(category);
    const likes = generateLikes();
    const hashtags = generateHashtags(category, temple.name);

    const [socialPost] = await db.insert(projectUpdatesTable).values({
      templeId,
      title: temple.initialUpdate.title,
      content: temple.initialUpdate.content,
      author: temple.projectLead || "Hare Krishna",
      category,
      imageUrl: image,
      likes,
      hashtags,
    }).returning({ id: projectUpdatesTable.id });

    logger.info(
      {
        templeId,
        name: temple.name,
        location: temple.location,
        socialPostId: socialPost?.id,
        socialCategory: category,
        milestonesAdded: temple.milestones?.length ?? 0,
      },
      "New temple discovered → social hub post created"
    );
    return templeId;
  } catch (err) {
    logger.error({ err, templeName: temple.name }, "Failed to insert discovered temple");
    return null;
  }
}

// ---------- Main sync orchestrator ----------

export async function runTempleSync(): Promise<{
  jobId: number;
  templesUpdated: number;
  templesAdded: number;
  updatesCreated: number;
}> {
  const [job] = await db
    .insert(syncJobsTable)
    .values({ status: "running", templesUpdated: 0, templesAdded: 0, updatesCreated: 0 })
    .returning();

  let templesUpdated = 0;
  let templesAdded = 0;
  let updatesCreated = 0;

  try {
    // 1. Update existing temples
    const temples = await db.select().from(templesTable);

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

        const category = research.update.category;
        const image = pickImage(category);
        const likes = generateLikes();
        const hashtags = generateHashtags(category, temple.name);

        const [inserted] = await db.insert(projectUpdatesTable).values({
          templeId: temple.id,
          title: research.update.title,
          content: research.update.content,
          author: temple.projectLead || "Hare Krishna",
          category,
          imageUrl: image,
          likes,
          hashtags,
        }).returning({ id: projectUpdatesTable.id });

        templesUpdated++;
        updatesCreated++;
        logger.info(
          {
            templeId: temple.id,
            templeName: temple.name,
            socialPostId: inserted?.id,
            socialCategory: category,
            socialLikes: likes,
            newProgress: research.constructionProgress,
            newPhase: research.phase,
          },
          "Temple synced → social hub post created"
        );
      } catch (err) {
        logger.error({ err, templeId: temple.id }, "Failed to sync temple");
      }
    }

    // 2. Discover and add new temple projects
    const existingNames = temples.map((t) => t.name);
    const newTemples = await discoverNewTemples(existingNames);

    for (const newTemple of newTemples) {
      const id = await insertDiscoveredTemple(newTemple);
      if (id !== null) {
        templesAdded++;
        updatesCreated++;
      }
    }
  } catch (err) {
    logger.error({ err }, "Sync job encountered a critical error");
    await db
      .update(syncJobsTable)
      .set({
        status: "failed",
        error: String(err),
        templesUpdated,
        templesAdded,
        updatesCreated,
        completedAt: new Date(),
      })
      .where(eq(syncJobsTable.id, job.id));
    return { jobId: job.id, templesUpdated, templesAdded, updatesCreated };
  }

  await db
    .update(syncJobsTable)
    .set({ status: "completed", templesUpdated, templesAdded, updatesCreated, completedAt: new Date() })
    .where(eq(syncJobsTable.id, job.id));

  return { jobId: job.id, templesUpdated, templesAdded, updatesCreated };
}

export async function getLatestSyncJob() {
  const jobs = await db
    .select()
    .from(syncJobsTable)
    .orderBy(syncJobsTable.startedAt)
    .limit(1);
  return jobs[0] ?? null;
}
