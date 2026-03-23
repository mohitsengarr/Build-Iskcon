import { Router } from "express";
import { db } from "@workspace/db";
import { templesTable, componentInsightsTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
import { getLatestComponentInsights } from "../services/component-insights";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const router = Router();

// ── Region classifier ─────────────────────────────────────────────────────────

function classifyRegion(location: string): string {
  const loc = location.toLowerCase();
  if (
    loc.includes("india") || loc.includes("uttar pradesh") || loc.includes("andhra") ||
    loc.includes("odisha") || loc.includes("gujarat") || loc.includes("jammu") ||
    loc.includes("kolkata") || loc.includes("hyderabad") || loc.includes("delhi") ||
    loc.includes("salem") || loc.includes("tirupati") || loc.includes("vrindavan") ||
    loc.includes("puri") || loc.includes("saurashtra") || loc.includes("kokapet") ||
    loc.includes("punjabi") || loc.includes("bengal") || loc.includes("mumbai") ||
    loc.includes("bangalore") || loc.includes("chennai") || loc.includes("kerala") ||
    loc.includes("mysore") || loc.includes("varanasi") || loc.includes("mathura")
  ) return "South Asia";
  if (
    loc.includes("kenya") || loc.includes("nairobi") || loc.includes("africa") ||
    loc.includes("nigeria") || loc.includes("ghana") || loc.includes("ethiopia") ||
    loc.includes("south africa") || loc.includes("tanzania") || loc.includes("uganda")
  ) return "Africa";
  if (
    loc.includes("australia") || loc.includes("melbourne") || loc.includes("sydney") ||
    loc.includes("brisbane") || loc.includes("new zealand") || loc.includes("perth")
  ) return "Oceania";
  if (
    loc.includes("united kingdom") || loc.includes("london") || loc.includes("uk") ||
    loc.includes("germany") || loc.includes("france") || loc.includes("netherlands") ||
    loc.includes("sweden") || loc.includes("europe") || loc.includes("italy") ||
    loc.includes("spain") || loc.includes("poland") || loc.includes("russia")
  ) return "Europe";
  if (
    loc.includes("usa") || loc.includes("united states") || loc.includes(", mn") ||
    loc.includes("corcoran") || loc.includes("california") || loc.includes("new york") ||
    loc.includes("texas") || loc.includes("florida") || loc.includes("canada") ||
    loc.includes("mexico") || loc.includes("brazil") || loc.includes("argentina") ||
    loc.includes("america")
  ) return "Americas";
  if (
    loc.includes("japan") || loc.includes("china") || loc.includes("singapore") ||
    loc.includes("thailand") || loc.includes("indonesia") || loc.includes("malaysia") ||
    loc.includes("vietnam") || loc.includes("philippines") || loc.includes("myanmar")
  ) return "East Asia";
  return "Other";
}

function extractCity(location: string): string {
  return location.split(",")[0]?.trim() ?? location;
}

// ── GET /api/insights/regional ─────────────────────────────────────────────────

router.get("/insights/regional", async (_req, res) => {
  try {
    const temples = await db.select().from(templesTable);

    // ── 1. Projects + Investment by region ────────────────────────────────────
    const regionMap: Record<string, { count: number; investment: number; raised: number }> = {};

    for (const t of temples) {
      const region = classifyRegion(t.location);
      if (!regionMap[region]) regionMap[region] = { count: 0, investment: 0, raised: 0 };
      regionMap[region]!.count++;
      regionMap[region]!.investment += parseFloat(t.fundraisingGoal as string);
      regionMap[region]!.raised     += parseFloat(t.fundraisingRaised as string);
    }

    const REGION_ORDER = ["South Asia", "Americas", "Africa", "Oceania", "Europe", "East Asia", "Other"];
    const projectsByRegion = REGION_ORDER
      .filter((r) => regionMap[r])
      .map((r) => ({
        region:     r,
        count:      regionMap[r]!.count,
        investment: Math.round(regionMap[r]!.investment / 1_000_000),
        raised:     Math.round(regionMap[r]!.raised / 1_000_000),
        fundingPct: Math.round((regionMap[r]!.raised / regionMap[r]!.investment) * 100),
      }));

    // ── 2. Top cities ──────────────────────────────────────────────────────────
    const cityMap: Record<string, { count: number; investment: number; region: string; statuses: string[] }> = {};

    for (const t of temples) {
      const city   = extractCity(t.location);
      const region = classifyRegion(t.location);
      if (!cityMap[city]) cityMap[city] = { count: 0, investment: 0, region, statuses: [] };
      cityMap[city]!.count++;
      cityMap[city]!.investment += parseFloat(t.fundraisingGoal as string);
      cityMap[city]!.statuses.push(t.status);
    }

    const topCities = Object.entries(cityMap)
      .map(([city, d]) => {
        const dominant = d.statuses.includes("construction")
          ? "Active Construction"
          : d.statuses.includes("planning")
          ? "Planning Phase"
          : d.statuses.includes("finishing")
          ? "Near Completion"
          : "Operational";
        return {
          city,
          region:     d.region,
          projects:   d.count,
          investment: `$${(d.investment / 1_000_000).toFixed(1)}M`,
          status:     dominant,
        };
      })
      .sort((a, b) => b.projects - a.projects || parseFloat(b.investment.replace(/[$M]/g, "")) - parseFloat(a.investment.replace(/[$M]/g, "")))
      .slice(0, 8);

    // ── 3. Upcoming visions (planning-phase temples) ───────────────────────────
    const upcomingVisions = temples
      .filter((t) => t.status === "planning")
      .map((t) => ({
        id:                  t.id,
        name:                t.name,
        location:            t.location,
        deity:               t.deity,
        description:         t.description,
        phase:               t.phase,
        constructionProgress: Math.round(parseFloat(t.constructionProgress as string)),
        fundraisingGoal:     parseFloat(t.fundraisingGoal as string),
        fundraisingRaised:   parseFloat(t.fundraisingRaised as string),
        fundingPct:          Math.round((parseFloat(t.fundraisingRaised as string) / parseFloat(t.fundraisingGoal as string)) * 100),
        expectedCompletion:  t.expectedCompletion,
        region:              classifyRegion(t.location),
        coverImage:          t.coverImage,
      }));

    // ── 4. Portfolio summary ───────────────────────────────────────────────────
    const totalGoal   = temples.reduce((s, t) => s + parseFloat(t.fundraisingGoal as string), 0);
    const totalRaised = temples.reduce((s, t) => s + parseFloat(t.fundraisingRaised as string), 0);
    const summary = {
      totalProjects:     temples.length,
      totalInvestment:   `$${(totalGoal / 1_000_000).toFixed(0)}M`,
      totalRaised:       `$${(totalRaised / 1_000_000).toFixed(0)}M`,
      fundingPct:        Math.round((totalRaised / totalGoal) * 100),
      regionsActive:     Object.keys(regionMap).length,
      constructionCount: temples.filter((t) => t.status === "construction").length,
      planningCount:     temples.filter((t) => t.status === "planning").length,
      completedCount:    temples.filter((t) => t.status === "consecrated" || t.status === "operational").length,
    };

    // ── 5. AI-generated regional narrative (latest from component_insights) ────
    const allInsights = await db
      .select()
      .from(componentInsightsTable)
      .orderBy(desc(componentInsightsTable.generatedAt));

    const regionalKeys = ["regional-south-asia", "regional-international", "geographic-intelligence"];
    const seen = new Set<string>();
    const regionalNarratives: Array<{
      componentKey: string; headline: string; summary: string;
      recommendation: string; confidence: string; generatedAt: string;
    }> = [];

    for (const row of allInsights) {
      if (regionalKeys.includes(row.componentKey) && !seen.has(row.componentKey)) {
        seen.add(row.componentKey);
        regionalNarratives.push({
          componentKey:   row.componentKey,
          headline:       row.headline,
          summary:        row.summary,
          recommendation: row.recommendation,
          confidence:     row.confidence,
          generatedAt:    row.generatedAt.toISOString(),
        });
      }
    }

    res.json({
      summary,
      projectsByRegion,
      topCities,
      upcomingVisions,
      narratives: regionalNarratives,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Failed to generate regional insights");
    res.status(500).json({ error: "Failed to generate regional insights" });
  }
});

// ── GET /api/insights/components ──────────────────────────────────────────────

router.get("/insights/components", async (_req, res) => {
  try {
    const insights = await getLatestComponentInsights();

    let instructions: { components: Array<{ key: string; icon: string; accentColor: string }> } = { components: [] };
    try {
      const candidates = [
        join(__dirname, "..", "..", "component-instructions.json"),
        join(__dirname, "..", "component-instructions.json"),
        join(process.cwd(), "component-instructions.json"),
      ];
      for (const p of candidates) {
        try {
          instructions = JSON.parse(readFileSync(p, "utf-8"));
          break;
        } catch { /* try next */ }
      }
    } catch { /* use defaults */ }

    const iconMap = Object.fromEntries(
      instructions.components.map((c) => [c.key, { icon: c.icon, accentColor: c.accentColor }])
    );

    const enriched = insights.map((insight) => ({
      ...insight,
      metrics: JSON.parse(insight.metrics as string),
      icon:        iconMap[insight.componentKey]?.icon        ?? "chart",
      accentColor: iconMap[insight.componentKey]?.accentColor ?? "primary",
    }));

    res.json({ insights: enriched });
  } catch (err) {
    logger.error({ err }, "Failed to fetch component insights");
    res.status(500).json({ error: "Failed to fetch insights" });
  }
});

export default router;
