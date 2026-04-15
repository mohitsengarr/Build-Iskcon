/**
 * Vercel Cron Job: Discover new ISKCON temples via Firecrawl search.
 * Runs every 6 hours. Auto-commits new temples to the repo via GitHub API.
 *
 * Required Vercel env vars:
 *   FIRECRAWL_API_KEY — from https://firecrawl.dev
 *   GITHUB_TOKEN      — Personal Access Token with repo write scope
 *   CRON_SECRET       — Vercel cron secret for auth
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const FIRECRAWL_API = "https://api.firecrawl.dev/v1/search";
const GITHUB_REPO = "mohitsengarr/Build-Iskcon";
const TEMPLES_FILE_PATH = "artifacts/temple-tracker/src/data/temples.ts";
const API_TEMPLES_PATH = "artifacts/api-server/src/routes/temples.ts";

const SEARCH_QUERIES = [
  "ISKCON temple new construction opening 2025 2026 2027",
  "ISKCON temple inauguration groundbreaking new mandir bhumi pujan",
  "ISKCON temple project construction update donate new 2025 2026 site:iskconnews.org",
];

// ── Firecrawl Search ────────────────────────────────────────────────────────

async function firecrawlSearch(query: string, apiKey: string): Promise<Array<{ url: string; title: string; description: string }>> {
  const res = await fetch(FIRECRAWL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, limit: 10 }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map((r: any) => ({
    url: r.url || "",
    title: r.title || "",
    description: r.description || "",
  }));
}

// ── GitHub API helpers ──────────────────────────────────────────────────────

async function getFileFromGitHub(filePath: string, token: string): Promise<{ content: string; sha: string }> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) throw new Error(`GitHub GET ${filePath} failed: ${res.status}`);
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha };
}

async function commitFileToGitHub(filePath: string, content: string, sha: string, message: string, token: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString("base64"),
      sha,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub PUT ${filePath} failed: ${res.status} ${err}`);
  }
}

// ── Temple extraction from search results ───────────────────────────────────

interface TempleCandidate {
  name: string;
  location: string;
  description: string;
  sourceUrl: string;
}

function extractTempleCandidates(results: Array<{ url: string; title: string; description: string }>): TempleCandidate[] {
  const candidates: TempleCandidate[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    // Skip non-ISKCON results
    if (!/iskcon|hare krishna|krishna|temple/i.test(r.title + r.description)) continue;
    // Skip our own site
    if (/buildiskcon\.com/i.test(r.url)) continue;
    // Skip social media, news aggregators
    if (/facebook\.com|instagram\.com|youtube\.com|x\.com|twitter\.com/i.test(r.url)) continue;

    // Try to extract temple name from title
    const nameMatch = r.title.match(/ISKCON\s+[\w\s–\-]+(?:Temple|Mandir|Dham|Complex)/i);
    const name = nameMatch ? nameMatch[0].trim() : "";
    if (!name || name.length < 10) continue;

    // Extract location from description
    const locMatch = r.description.match(/(?:in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)/);
    const location = locMatch ? locMatch[1].trim() : "";

    const key = name.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      name,
      location: location || "India",
      description: r.description.substring(0, 200),
      sourceUrl: r.url,
    });
  }

  return candidates;
}

// ── Check if temple already exists in file ──────────────────────────────────

function getExistingTempleNames(fileContent: string): Set<string> {
  const names = new Set<string>();
  const nameMatches = fileContent.matchAll(/name:\s*"([^"]+)"/g);
  for (const m of nameMatches) {
    names.add(m[1].toLowerCase().replace(/\s+/g, " ").trim());
  }
  // Also add location-based keys for fuzzy matching
  const locMatches = fileContent.matchAll(/location:\s*"([^"]+)"/g);
  for (const m of locMatches) {
    const city = m[1].split(",")[0].trim().toLowerCase();
    names.add(city);
  }
  return names;
}

function isNewTemple(candidate: TempleCandidate, existing: Set<string>): boolean {
  const candidateLower = candidate.name.toLowerCase().replace(/\s+/g, " ");
  // Check exact name match
  if (existing.has(candidateLower)) return false;
  // Check partial matches (city name in candidate name)
  for (const name of existing) {
    if (candidateLower.includes(name) || name.includes(candidateLower)) return false;
    // Check city overlap
    const candidateCity = candidate.location.split(",")[0].trim().toLowerCase();
    if (candidateCity && name.includes(candidateCity)) return false;
  }
  return true;
}

// ── Build temple entry for insertion ────────────────────────────────────────

function buildTempleEntry(candidate: TempleCandidate, nextId: number): string {
  const location = candidate.location.includes(",") ? candidate.location : `${candidate.location}, India`;
  return `  {
    id: ${nextId}, name: "${candidate.name}", location: "${location}",
    deity: "Sri Sri Radha Krishna", description: "${candidate.description.replace(/"/g, '\\"')}",
    status: "construction", phase: "Discovered via Firecrawl", constructionProgress: 10,
    fundraisingGoal: 2_000_000, fundraisingRaised: 500_000, startDate: "${new Date().toISOString().split("T")[0]}",
    expectedCompletion: "2029-12-31", projectLead: "${candidate.name.replace(/ISKCON\s*/i, "ISKCON ")}",
    coverImage: null, donateUrl: "${candidate.sourceUrl}",
    latitude: null, longitude: null,
  },`;
}

// ── Main handler ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret (Vercel sends this header for cron invocations)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!firecrawlKey || !githubToken) {
    return res.status(500).json({ error: "Missing FIRECRAWL_API_KEY or GITHUB_TOKEN" });
  }

  try {
    // Step 1: Run all searches
    const allResults: Array<{ url: string; title: string; description: string }> = [];
    for (const query of SEARCH_QUERIES) {
      const results = await firecrawlSearch(query, firecrawlKey);
      allResults.push(...results);
    }

    // Step 2: Extract temple candidates
    const candidates = extractTempleCandidates(allResults);

    // Step 3: Get current temples file from GitHub
    const { content: templesContent, sha: templesSha } = await getFileFromGitHub(TEMPLES_FILE_PATH, githubToken);
    const existingNames = getExistingTempleNames(templesContent);

    // Step 4: Filter to genuinely new temples
    const newTemples = candidates.filter(c => isNewTemple(c, existingNames));

    if (newTemples.length === 0) {
      return res.status(200).json({
        message: "No new temples found",
        searchResults: allResults.length,
        candidates: candidates.length,
        existing: existingNames.size,
      });
    }

    // Step 5: Find next ID and insertion point
    const idMatches = [...templesContent.matchAll(/id:\s*(\d+)/g)];
    const maxId = Math.max(...idMatches.map(m => parseInt(m[1])));
    const insertionMarker = "];\n\n// Pre-computed stats";

    // Step 6: Build new temple entries
    const newEntries = newTemples.map((t, i) => buildTempleEntry(t, maxId + i + 1)).join("\n");
    const updatedContent = templesContent.replace(
      insertionMarker,
      `\n  // ── Auto-discovered (${new Date().toISOString().split("T")[0]}) ──\n${newEntries}\n];\n\n// Pre-computed stats`,
    );

    // Step 7: Commit to GitHub
    await commitFileToGitHub(
      TEMPLES_FILE_PATH,
      updatedContent,
      templesSha,
      `feat(cron): auto-discover ${newTemples.length} new ISKCON temple(s) via Firecrawl\n\n${newTemples.map(t => `- ${t.name} (${t.location})`).join("\n")}`,
      githubToken,
    );

    // Step 8: Also update counts in index.html (optional — update the number)
    // The TEMPLE_STATS are computed dynamically from TEMPLES.length, so they auto-update on next build

    return res.status(200).json({
      message: `Added ${newTemples.length} new temple(s)`,
      added: newTemples.map(t => ({ name: t.name, location: t.location })),
      searchResults: allResults.length,
      nextDeploy: "Vercel will auto-deploy from the GitHub commit",
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
