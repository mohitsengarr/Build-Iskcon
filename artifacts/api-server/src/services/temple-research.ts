import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import {
  templesTable,
  projectUpdatesTable,
  milestonesTable,
  syncJobsTable,
  templeVideosTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { generateComponentInsights } from "./component-insights";

// ── AI clients ──────────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_BASE = "https://api.perplexity.ai";

// ── Image pool ───────────────────────────────────────────────────────────────

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
  const pool = TEMPLE_IMAGES[category] ?? TEMPLE_IMAGES.general!;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function generateLikes(): number {
  return Math.floor(Math.random() * 1800) + 200;
}

function generateHashtags(category: string, templeName: string): string {
  const slug = templeName.replace(/\s+/g, "").substring(0, 16);
  const base: Record<string, string[]> = {
    construction: ["#ISKCONConstruction", "#VedicArchitecture", "#TempleBuilding", `#${slug}`],
    spiritual:    ["#HareKrishna", "#VedicCulture", "#SpiritualJourney", `#${slug}`],
    fundraising:  ["#ISKCONFundraising", "#DharmaProject", "#VedicCentre", `#${slug}`],
    logistics:    ["#ProjectUpdate", "#ISKCONLogistics", "#TempleProject", `#${slug}`],
    general:      ["#ISKCON", "#VedicTemple", "#GlobalISKCON", `#${slug}`],
  };
  return (base[category] ?? base.general!).join(" ");
}

// ── Perplexity deep search ────────────────────────────────────────────────────

interface PerplexityResult {
  answer: string;
  citations: string[];
}

/**
 * Uses Perplexity's sonar model to search the live web for ISKCON-related content.
 * Returns the answer text + source URLs. Falls back gracefully if unavailable.
 */
async function perplexitySearch(query: string): Promise<PerplexityResult | null> {
  if (!PERPLEXITY_API_KEY) {
    logger.warn("PERPLEXITY_API_KEY not set — skipping web search");
    return null;
  }

  try {
    const response = await fetch(`${PERPLEXITY_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "You are an ISKCON project research assistant. Search the web and return detailed, factual information about ISKCON temple construction, fundraising, and spiritual events. Include specific numbers, dates, and milestones where available. Be concise and factual.",
          },
          { role: "user", content: query },
        ],
        max_tokens: 1024,
        temperature: 0.2,
        return_citations: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, errText, query }, "Perplexity API error");
      return null;
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      citations?: string[];
    };

    const answer = data.choices[0]?.message?.content ?? "";
    const citations = data.citations ?? [];

    logger.info(
      { query: query.substring(0, 80), citationCount: citations.length },
      "Perplexity search completed"
    );

    return { answer, citations };
  } catch (err) {
    logger.error({ err, query }, "Perplexity search failed");
    return null;
  }
}

// ── Wikipedia image lookup ────────────────────────────────────────────────────

/**
 * Fetches a real thumbnail image URL from Wikipedia's free open REST API.
 * Tries the temple name first, then falls back to the city name.
 * No API key required; CORS-open endpoint.
 */
async function fetchWikipediaImage(templeName: string, location: string): Promise<string | null> {
  const parts = location.split(",").map(p => p.trim());
  const city = parts[0] ?? location;
  // For compound city names like "Puri Heritage Zone" → also try first word "Puri"
  const cityFirstWord = city.split(/\s+/)[0] ?? city;
  const state = parts[1] ?? "";

  const candidates = [
    templeName,
    `ISKCON ${cityFirstWord}`,
    city,
    cityFirstWord,
    cityFirstWord && state ? `${cityFirstWord}, ${state}` : "",
  ].filter(Boolean);

  for (const query of candidates) {
    try {
      const title = encodeURIComponent(query.replace(/\s+/g, "_"));
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
        { headers: { "User-Agent": "ISKCONIntelligence/1.0 (contact@iskcon-intelligence.org)" } }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { thumbnail?: { source?: string } };
      const src = data?.thumbnail?.source;
      if (src) {
        // Upgrade to a reasonable size (Wikipedia thumbnails can be small)
        const upgraded = src.replace(/\/\d+px-/, "/800px-");
        logger.info({ query, src: upgraded }, "Wikipedia image found");
        return upgraded;
      }
    } catch {
      // try next candidate
    }
  }

  logger.info({ templeName, location }, "No Wikipedia image found for temple");
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TempleUpdateResult {
  constructionProgress: number;
  phase: string;
  fundraisingRaisedDelta: number;
  update: {
    title: string;
    content: string;
    category: "construction" | "fundraising" | "spiritual" | "logistics" | "general";
  };
  sourcedFromWeb: boolean;
  sourceUrl: string | null;
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
  donateUrl: string | null;
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

// ── Update existing temples ───────────────────────────────────────────────────

async function researchTemple(
  temple: typeof templesTable.$inferSelect
): Promise<TempleUpdateResult | null> {
  const currentProgress = parseFloat(temple.constructionProgress as string);
  const currentRaised   = parseFloat(temple.fundraisingRaised as string);
  const goal            = parseFloat(temple.fundraisingGoal as string);

  // Step 1: Perplexity searches the live web for real news about this temple
  const webQuery = `ISKCON "${temple.name}" ${temple.location} temple construction update fundraising 2025 2026 latest news`;
  const webData  = await perplexitySearch(webQuery);

  const webContext = webData
    ? `\n\n=== LIVE WEB RESEARCH (Perplexity, sourced from the internet) ===\n${webData.answer}\n\nSources: ${webData.citations.slice(0, 5).join(", ") || "N/A"}\n=== END WEB RESEARCH ===`
    : "";

  // Step 2: Claude synthesizes web data + known temple data into structured JSON
  const prompt = `You are an ISKCON project intelligence analyst. Generate a data update for the following active temple project.
${webContext ? "Real-world web research has been provided below — prioritise this over generic estimates where it contains specific facts, numbers, or milestones." : "No live web data is available — generate a plausible incremental update."}

Temple: ${temple.name}
Location: ${temple.location}
Deity: ${temple.deity}
Current Phase: ${temple.phase}
Construction Progress: ${currentProgress}%
Status: ${temple.status}
Fundraising Goal: $${(goal / 1_000_000).toFixed(1)}M
Fundraising Raised: $${(currentRaised / 1_000_000).toFixed(1)}M
${webContext}

Return ONLY a valid JSON object (no markdown, no explanation) matching this schema:
{
  "constructionProgress": <number between ${Math.min(currentProgress, 99)} and ${Math.min(currentProgress + 3, 100)}>,
  "phase": "<current phase name — updated if web research indicates a change>",
  "fundraisingRaisedDelta": <USD raised since last update, between 50000 and 800000>,
  "update": {
    "title": "<specific, news-quality headline for this temple>",
    "content": "<2-3 sentence update grounded in any web research found, reflecting real spiritual and construction progress>",
    "category": "<one of: construction, fundraising, spiritual, logistics, general>"
  },
  "sourcedFromWeb": ${webData ? "true" : "false"}
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (block?.type !== "text") return null;

    const raw = block.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const result = JSON.parse(raw) as TempleUpdateResult;
    result.sourcedFromWeb = !!webData;
    result.sourceUrl = webData?.citations?.[0] ?? null;
    return result;
  } catch (err) {
    logger.error({ err, templeId: temple.id, templeName: temple.name }, "Claude synthesis failed");
    return null;
  }
}

// ── Discover new temples ──────────────────────────────────────────────────────

async function discoverNewTemples(existingNames: string[]): Promise<NewTempleResult[]> {
  const exclusionList = existingNames.map((n) => `- ${n}`).join("\n");

  // Step 1: Perplexity searches for genuinely new ISKCON projects worldwide
  const webQuery =
    "new ISKCON temple construction projects 2024 2025 2026 worldwide inauguration groundbreaking fundraising campaign";
  const webData = await perplexitySearch(webQuery);

  const webContext = webData
    ? `\n\n=== LIVE WEB RESEARCH ON NEW ISKCON PROJECTS ===\n${webData.answer}\n\nSources: ${webData.citations.slice(0, 5).join(", ") || "N/A"}\n=== END WEB RESEARCH ===`
    : "";

  const prompt = `You are an ISKCON global project intelligence researcher identifying new temple projects to track.

The following projects are ALREADY tracked — do NOT include them:
${exclusionList}
${webContext}

${webData ? "Use the live web research above to identify REAL or highly plausible new projects. Prioritise projects actually mentioned in the web research. Fill in missing structured details realistically." : "Generate 2 plausible new ISKCON projects from under-represented global regions."}

Discover exactly 2 NEW ISKCON temple or Vedic cultural centre projects from different global regions (e.g. Europe, Americas, Africa, Southeast Asia, Middle East, Oceania). Return ONLY a valid JSON array (no markdown) with exactly 2 objects:
[
  {
    "name": "<official project name>",
    "location": "<City, Country>",
    "deity": "<primary deity>",
    "description": "<2-3 sentence description>",
    "status": "<planning|construction|finishing|consecrated|operational>",
    "phase": "<current construction phase>",
    "constructionProgress": <integer 0-85>,
    "fundraisingGoal": <total USD as integer>,
    "fundraisingRaised": <USD raised as integer>,
    "startDate": "<YYYY-MM-DD>",
    "expectedCompletion": "<YYYY-MM-DD>",
    "projectLead": "<devotee or project lead name>",
    "donateUrl": "<direct donation URL from the project's official website, or null if not found>",
    "milestones": [
      { "title": "<milestone>", "description": "<one sentence>", "status": "<pending|in_progress|completed>", "targetDate": "<YYYY-MM-DD>" }
    ],
    "initialUpdate": {
      "title": "<announcement headline>",
      "content": "<2-3 sentence update grounded in any real news found>",
      "category": "<construction|fundraising|spiritual|logistics|general>"
    }
  }
]

Include 3-5 milestones per temple. Make data realistic and geographically diverse.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (block?.type !== "text") return [];

    const raw    = block.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(raw) as NewTempleResult[];

    logger.info(
      { count: parsed.length, webSourced: !!webData },
      "New temple discovery complete"
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.error({ err }, "Temple discovery failed");
    return [];
  }
}

// ── Insert a newly discovered temple ─────────────────────────────────────────

async function insertDiscoveredTemple(temple: NewTempleResult): Promise<number | null> {
  try {
    const wikiImage = await fetchWikipediaImage(temple.name, temple.location);

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
        ...(temple.donateUrl ? { donateUrl: temple.donateUrl } : {}),
        ...(wikiImage ? { coverImage: wikiImage } : {}),
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
    const image    = pickImage(category);
    const likes    = generateLikes();
    const hashtags = generateHashtags(category, temple.name);

    const [socialPost] = await db
      .insert(projectUpdatesTable)
      .values({
        templeId,
        title:    temple.initialUpdate.title,
        content:  temple.initialUpdate.content,
        author:   temple.projectLead || "Hare Krishna",
        category,
        imageUrl: image,
        sourceUrl: null,
        likes,
        hashtags,
      })
      .returning({ id: projectUpdatesTable.id });

    logger.info(
      {
        templeId,
        name:           temple.name,
        location:       temple.location,
        socialPostId:   socialPost?.id,
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

// ── YouTube video discovery ───────────────────────────────────────────────────

/** Extracts YouTube video IDs from a block of text (URLs in any format). */
function extractYouTubeIds(text: string): string[] {
  const pattern = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m[1]) ids.add(m[1]);
  }
  return [...ids];
}

interface VideoEntry {
  videoId: string;
  title: string;
  channelName: string;
  description: string;
  publishedAt: string;
}

/**
 * Uses Perplexity to discover recent ISKCON construction YouTube videos,
 * parses video IDs from citations/answer, and upserts new records into `temple_videos`.
 */
async function discoverYouTubeVideos(): Promise<number> {
  const queries = [
    "ISKCON temple construction update 2025 2026 YouTube video site:youtube.com",
    "TOVP Temple of Vedic Planetarium construction update YouTube video 2025",
    "ISKCON new temple inauguration groundbreaking 2025 site:youtube.com",
  ];

  const allIds = new Set<string>();
  const allText: string[] = [];

  for (const q of queries) {
    const result = await perplexitySearch(q);
    if (!result) continue;
    // Collect IDs from citations (most reliable source)
    for (const url of result.citations) {
      for (const id of extractYouTubeIds(url)) allIds.add(id);
    }
    // Also scan answer text for embedded YouTube links
    for (const id of extractYouTubeIds(result.answer)) allIds.add(id);
    allText.push(result.answer);
  }

  if (allIds.size === 0) {
    logger.info("No YouTube video IDs found via Perplexity");
    return 0;
  }

  // Deduplicate against already-saved videos
  const existing = await db.select({ videoId: templeVideosTable.videoId }).from(templeVideosTable);
  const existingSet = new Set(existing.map((r) => r.videoId));
  const newIds = [...allIds].filter((id) => !existingSet.has(id));

  if (newIds.length === 0) {
    logger.info({ found: allIds.size }, "All discovered YouTube videos already saved");
    return 0;
  }

  // Ask Claude to generate structured metadata for each new video ID
  const combinedContext = allText.join("\n\n").substring(0, 3000);
  const prompt = `You are an ISKCON media researcher. Given the following web research and a list of YouTube video IDs found in the research, generate structured metadata for each video about ISKCON temple construction.

Web research context:
${combinedContext}

YouTube video IDs to process: ${newIds.slice(0, 6).join(", ")}

For EACH video ID, generate realistic metadata based on the research context. Return ONLY a valid JSON array (no markdown):
[
  {
    "videoId": "<11-char YouTube video ID>",
    "title": "<compelling video title about ISKCON temple construction or update>",
    "channelName": "<ISKCON channel name, e.g. TOVP Official, ISKCON Desire Tree, ISKCON Global>",
    "description": "<1-2 sentence description of what the video covers>",
    "publishedAt": "<YYYY-MM-DD, estimate based on context>"
  }
]

Only include videos related to ISKCON temple construction, fundraising, or inauguration events. If a video ID seems unrelated, skip it.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    if (block?.type !== "text") return 0;

    const raw = block.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const videos = JSON.parse(raw) as VideoEntry[];

    let inserted = 0;
    for (const v of videos) {
      if (!v.videoId || existingSet.has(v.videoId)) continue;
      try {
        await db.insert(templeVideosTable).values({
          videoId:      v.videoId,
          title:        v.title,
          channelName:  v.channelName || "ISKCON",
          description:  v.description,
          thumbnailUrl: `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`,
          publishedAt:  v.publishedAt,
          sourceUrl:    `https://www.youtube.com/watch?v=${v.videoId}`,
        }).onConflictDoNothing();
        inserted++;
        existingSet.add(v.videoId);
      } catch (err) {
        logger.warn({ err, videoId: v.videoId }, "Failed to insert video — skipping");
      }
    }

    logger.info({ found: allIds.size, newIds: newIds.length, inserted }, "YouTube video discovery complete");
    return inserted;
  } catch (err) {
    logger.error({ err }, "YouTube video discovery: Claude metadata generation failed");
    return 0;
  }
}

// ── Main sync orchestrator ────────────────────────────────────────────────────

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
  let templesAdded   = 0;
  let updatesCreated = 0;

  try {
    const temples = await db.select().from(templesTable);

    for (const temple of temples) {
      try {
        const research = await researchTemple(temple);
        if (!research) continue;

        const currentRaised = parseFloat(temple.fundraisingRaised as string);
        const goal          = parseFloat(temple.fundraisingGoal as string);
        const newRaised     = Math.min(currentRaised + research.fundraisingRaisedDelta, goal);

        // Fetch a real Wikipedia image if this temple has none yet
        const coverImage = temple.coverImage
          ? undefined
          : (await fetchWikipediaImage(temple.name, temple.location)) ?? undefined;

        await db
          .update(templesTable)
          .set({
            constructionProgress: research.constructionProgress.toFixed(2),
            phase:                research.phase,
            fundraisingRaised:    newRaised.toFixed(2),
            updatedAt:            new Date(),
            ...(coverImage ? { coverImage } : {}),
          })
          .where(eq(templesTable.id, temple.id));

        const category = research.update.category;
        const image    = pickImage(category);
        const likes    = generateLikes();
        const hashtags = generateHashtags(category, temple.name);

        const [inserted] = await db
          .insert(projectUpdatesTable)
          .values({
            templeId: temple.id,
            title:    research.update.title,
            content:  research.update.content,
            author:   temple.projectLead || "Hare Krishna",
            category,
            imageUrl: image,
            sourceUrl: research.sourceUrl ?? null,
            likes,
            hashtags,
          })
          .returning({ id: projectUpdatesTable.id });

        templesUpdated++;
        updatesCreated++;

        logger.info(
          {
            templeId:       temple.id,
            templeName:     temple.name,
            socialPostId:   inserted?.id,
            socialCategory: category,
            socialLikes:    likes,
            newProgress:    research.constructionProgress,
            newPhase:       research.phase,
            webSourced:     research.sourcedFromWeb,
          },
          "Temple synced → social hub post created"
        );
      } catch (err) {
        logger.error({ err, templeId: temple.id }, "Failed to sync temple");
      }
    }

    // Discover 2 new global ISKCON projects each cycle
    const existingNames = temples.map((t) => t.name);
    const newTemples    = await discoverNewTemples(existingNames);

    for (const newTemple of newTemples) {
      const id = await insertDiscoveredTemple(newTemple);
      if (id !== null) {
        templesAdded++;
        updatesCreated++;
      }
    }

    // Discover new ISKCON construction videos from YouTube via Perplexity
    const videosDiscovered = await discoverYouTubeVideos();
    logger.info({ videosDiscovered }, "YouTube construction videos updated");

    // Generate McKinsey-style intelligence briefs for all dashboard components
    // (reads component-instructions.json, calls Claude, upserts to DB)
    const freshTemples = await db.select().from(templesTable);
    const insightsGenerated = await generateComponentInsights(freshTemples);
    logger.info({ insightsGenerated }, "Component intelligence briefs updated");
  } catch (err) {
    logger.error({ err }, "Sync job encountered a critical error");
    await db
      .update(syncJobsTable)
      .set({
        status:         "failed",
        error:          String(err),
        templesUpdated,
        templesAdded,
        updatesCreated,
        completedAt:    new Date(),
      })
      .where(eq(syncJobsTable.id, job!.id));
    return { jobId: job!.id, templesUpdated, templesAdded, updatesCreated };
  }

  await db
    .update(syncJobsTable)
    .set({ status: "completed", templesUpdated, templesAdded, updatesCreated, completedAt: new Date() })
    .where(eq(syncJobsTable.id, job!.id));

  return { jobId: job!.id, templesUpdated, templesAdded, updatesCreated };
}

export async function getLatestSyncJob() {
  const jobs = await db
    .select()
    .from(syncJobsTable)
    .orderBy(syncJobsTable.startedAt)
    .limit(1);
  return jobs[0] ?? null;
}
