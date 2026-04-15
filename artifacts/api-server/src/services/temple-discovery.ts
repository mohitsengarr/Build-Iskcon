/**
 * Temple Discovery Service
 *
 * Uses Firecrawl API to discover under-construction ISKCON temples,
 * then Claude to extract structured data, and stores results in Supabase.
 *
 * Priority: India first, then worldwide.
 * Runs hourly via cron, rotates through search queries.
 */

import { logger } from "../lib/logger";

// ── Supabase config ─────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

function sbHeaders(prefer = "return=representation") {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: prefer,
  };
}

// ── Search queries (rotated each tick) ──────────────────────────────────────

const SEARCH_QUERIES = [
  "ISKCON temple under construction India 2025 2026",
  "new ISKCON temple project construction India donation",
  "ISKCON temple inauguration upcoming 2026 India",
  "ISKCON temple construction worldwide international 2025 2026",
  "Hare Krishna temple new building project India donate",
  "ISKCON temple opening ceremony India 2025 2026",
  "ISKCON temple construction progress update 2026",
  "ISKCON mandir nirman bharat naya under construction",
  "ISKCON temple foundation stone laying ceremony",
  "ISKCON temple expansion renovation project",
  "ISKCON temple proposed new site land acquisition",
  "ISKCON temple Africa Europe America under construction 2025",
  "ISKCON mega temple project India crores donation",
  "ISKCON temple bhumi pujan inauguration 2025 2026",
  "Hare Krishna mandir construction fundraising campaign",
  "ISKCON temple upcoming opening 2025 2026 2027 new",
];

let queryIndex = 0;

// ── Firecrawl search ────────────────────────────────────────────────────────

async function firecrawlSearch(query: string): Promise<Array<{ url: string; title: string; description: string; markdown?: string }>> {
  if (!FIRECRAWL_API_KEY) {
    logger.warn("FIRECRAWL_API_KEY not set — skipping temple discovery");
    return [];
  }

  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      limit: 5,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.error({ status: res.status, errText }, "Firecrawl search failed");
    return [];
  }

  const data: any = await res.json();
  return (data.data || []).map((r: any) => ({
    url: r.url || "",
    title: r.title || r.metadata?.title || "",
    description: r.metadata?.description || "",
    markdown: r.markdown || "",
  }));
}

// ── Claude extraction ───────────────────────────────────────────────────────

interface DiscoveredTemple {
  name: string;
  location: string;
  city: string;
  state: string;
  country: string;
  deity: string;
  description: string;
  status: string;
  phase: string;
  constructionProgress: number;
  fundraisingGoal: number;
  fundraisingRaised: number;
  startDate: string;
  expectedCompletion: string;
  projectLead: string;
  donateUrl: string;
  latitude: number | null;
  longitude: number | null;
}

async function extractTemplesFromContent(
  searchResults: Array<{ url: string; title: string; description: string; markdown?: string }>,
): Promise<Array<DiscoveredTemple & { sourceUrls: string[] }>> {
  if (!ANTHROPIC_API_KEY) {
    logger.warn("ANTHROPIC_API_KEY not set — cannot extract temples");
    return [];
  }

  // Combine all search result content
  const combinedContent = searchResults
    .map((r) => `### Source: ${r.url}\n**Title:** ${r.title}\n${r.markdown?.substring(0, 3000) || r.description}`)
    .join("\n\n---\n\n");

  if (combinedContent.length < 100) return [];

  const sourceUrls = searchResults.map((r) => r.url).filter(Boolean);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Extract ALL ISKCON temples that are under construction, planning, or recently inaugurated from the following web content. For each temple, provide structured data.

IMPORTANT RULES:
- Only include temples that are CLEARLY ISKCON (International Society for Krishna Consciousness) temples
- Include temples at ANY stage: planning, construction, finishing, recently consecrated/inaugurated
- For donation URLs, look for official ISKCON donation pages. If not found, use the temple's main website URL
- For lat/lng, provide approximate coordinates based on the city/location
- Construction progress should be 0-100 (estimate if not explicitly stated)
- Status must be one of: planning, construction, finishing, consecrated, operational

Return a JSON array (no markdown, just valid JSON):
[
  {
    "name": "ISKCON Temple Name",
    "location": "City, State, Country",
    "city": "City",
    "state": "State/Province",
    "country": "Country",
    "deity": "Sri Sri Radha Krishna (or specific deity names)",
    "description": "Brief description of the temple project",
    "status": "construction",
    "phase": "Current construction phase",
    "constructionProgress": 50,
    "fundraisingGoal": 0,
    "fundraisingRaised": 0,
    "startDate": "YYYY-MM-DD or empty",
    "expectedCompletion": "YYYY-MM-DD or empty",
    "projectLead": "Managing body",
    "donateUrl": "https://...",
    "latitude": 28.613,
    "longitude": 77.209
  }
]

If no ISKCON temples are found, return an empty array: []

Web content:
${combinedContent.substring(0, 12000)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.error({ status: res.status, errText }, "Claude extraction failed");
    return [];
  }

  const data: any = await res.json();
  const text = data.content?.[0]?.text || "";

  // Parse JSON from response
  try {
    // Try to find JSON array in response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const temples: DiscoveredTemple[] = JSON.parse(jsonMatch[0]);
    return temples
      .filter((t) => t.name && t.location)
      .map((t) => ({
        ...t,
        // Normalize
        status: ["planning", "construction", "finishing", "consecrated", "operational"].includes(t.status)
          ? t.status
          : "construction",
        constructionProgress: Math.max(0, Math.min(100, t.constructionProgress || 0)),
        sourceUrls,
      }));
  } catch (err) {
    logger.error({ err, text: text.substring(0, 500) }, "Failed to parse Claude temple extraction");
    return [];
  }
}

// ── Supabase upsert ─────────────────────────────────────────────────────────

async function upsertTemple(
  temple: DiscoveredTemple & { sourceUrls: string[] },
  source = "firecrawl",
): Promise<{ action: "inserted" | "updated" | "skipped"; name: string }> {
  // Check if temple already exists (case-insensitive name + location match)
  const checkUrl = `${SUPABASE_URL}/rest/v1/discovered_temples?name=ilike.${encodeURIComponent(temple.name)}&location=ilike.${encodeURIComponent(temple.location)}&select=id,name,verified`;
  const checkRes = await fetch(checkUrl, { headers: sbHeaders() });
  const existing = await checkRes.json();

  if (Array.isArray(existing) && existing.length > 0) {
    const row = existing[0];
    // Don't overwrite verified (manually curated) entries with Firecrawl data
    if (row.verified && source === "firecrawl") {
      return { action: "skipped", name: temple.name };
    }

    // Update existing
    const updateUrl = `${SUPABASE_URL}/rest/v1/discovered_temples?id=eq.${row.id}`;
    await fetch(updateUrl, {
      method: "PATCH",
      headers: sbHeaders(),
      body: JSON.stringify({
        description: temple.description || undefined,
        status: temple.status,
        phase: temple.phase || undefined,
        construction_progress: temple.constructionProgress,
        donate_url: temple.donateUrl || undefined,
        source_urls: temple.sourceUrls,
        last_researched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    return { action: "updated", name: temple.name };
  }

  // Insert new temple
  const insertUrl = `${SUPABASE_URL}/rest/v1/discovered_temples`;
  const insertRes = await fetch(insertUrl, {
    method: "POST",
    headers: sbHeaders("return=minimal"),
    body: JSON.stringify({
      name: temple.name,
      location: temple.location,
      city: temple.city || null,
      state: temple.state || null,
      country: temple.country || "India",
      deity: temple.deity || "Sri Sri Radha Krishna",
      description: temple.description || null,
      status: temple.status,
      phase: temple.phase || null,
      construction_progress: temple.constructionProgress,
      fundraising_goal: temple.fundraisingGoal || 0,
      fundraising_raised: temple.fundraisingRaised || 0,
      start_date: temple.startDate || null,
      expected_completion: temple.expectedCompletion || null,
      project_lead: temple.projectLead || null,
      donate_url: temple.donateUrl || null,
      latitude: temple.latitude || null,
      longitude: temple.longitude || null,
      source,
      source_urls: temple.sourceUrls,
      last_researched_at: new Date().toISOString(),
    }),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    // Unique constraint violation — already exists with different casing
    if (errText.includes("duplicate") || errText.includes("unique")) {
      return { action: "skipped", name: temple.name };
    }
    logger.error({ status: insertRes.status, errText, temple: temple.name }, "Supabase insert failed");
    return { action: "skipped", name: temple.name };
  }

  return { action: "inserted", name: temple.name };
}

// ── Main discovery function ─────────────────────────────────────────────────

export async function discoverTemples(): Promise<{
  searched: string;
  found: number;
  inserted: number;
  updated: number;
  skipped: number;
}> {
  const query = SEARCH_QUERIES[queryIndex % SEARCH_QUERIES.length];
  queryIndex++;

  logger.info({ query, queryIndex }, "Temple discovery: starting search");

  // Step 1: Firecrawl search
  const searchResults = await firecrawlSearch(query);
  if (searchResults.length === 0) {
    return { searched: query, found: 0, inserted: 0, updated: 0, skipped: 0 };
  }

  logger.info({ resultCount: searchResults.length, urls: searchResults.map((r) => r.url) }, "Firecrawl search results");

  // Step 2: Extract temples via Claude
  const temples = await extractTemplesFromContent(searchResults);
  logger.info({ templeCount: temples.length, names: temples.map((t) => t.name) }, "Claude extracted temples");

  // Step 3: Upsert to Supabase
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const temple of temples) {
    const result = await upsertTemple(temple);
    if (result.action === "inserted") inserted++;
    else if (result.action === "updated") updated++;
    else skipped++;
    logger.info({ action: result.action, name: result.name }, "Temple upsert result");
  }

  return { searched: query, found: temples.length, inserted, updated, skipped };
}

// ── Seed existing temples from static data ──────────────────────────────────

export async function seedExistingTemples(temples: Array<{
  id: number;
  name: string;
  location: string;
  deity: string;
  description: string;
  status: string;
  phase: string;
  constructionProgress: number;
  fundraisingGoal: number;
  fundraisingRaised: number;
  startDate: string;
  expectedCompletion: string;
  projectLead: string;
  coverImage: string | null;
  donateUrl: string | null;
  latitude: number | null;
  longitude: number | null;
}>): Promise<{ seeded: number; skipped: number }> {
  let seeded = 0;
  let skipped = 0;

  for (const t of temples) {
    // Parse city/state/country from location
    const parts = t.location.split(",").map((s) => s.trim());
    const country = parts[parts.length - 1] || "India";
    const state = parts.length >= 3 ? parts[parts.length - 2] : "";
    const city = parts[0] || "";

    const result = await upsertTemple(
      {
        name: t.name,
        location: t.location,
        city,
        state,
        country,
        deity: t.deity,
        description: t.description,
        status: t.status,
        phase: t.phase,
        constructionProgress: t.constructionProgress,
        fundraisingGoal: t.fundraisingGoal,
        fundraisingRaised: t.fundraisingRaised,
        startDate: t.startDate,
        expectedCompletion: t.expectedCompletion,
        projectLead: t.projectLead,
        donateUrl: t.donateUrl || "",
        latitude: t.latitude,
        longitude: t.longitude,
        sourceUrls: [],
      },
      "seed",
    );

    if (result.action === "inserted") seeded++;
    else skipped++;
  }

  // Mark all seeded temples as verified
  await fetch(`${SUPABASE_URL}/rest/v1/discovered_temples?source=eq.seed`, {
    method: "PATCH",
    headers: sbHeaders(),
    body: JSON.stringify({ verified: true }),
  });

  return { seeded, skipped };
}

// ── Get temple count from Supabase ──────────────────────────────────────────

export async function getTempleCount(): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/discovered_temples?select=id`;
  const res = await fetch(url, {
    headers: { ...sbHeaders(), Prefer: "count=exact" },
    method: "HEAD",
  });
  const count = res.headers.get("content-range")?.split("/")[1];
  return count ? parseInt(count, 10) : 0;
}
