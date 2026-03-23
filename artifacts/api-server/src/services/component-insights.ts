import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import { componentInsightsTable, templesTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Read instruction file ────────────────────────────────────────────────────

interface ComponentInstruction {
  key:         string;
  title:       string;
  subtitle:    string;
  icon:        string;
  accentColor: string;
  prompt:      string;
}

interface InstructionFile {
  version:    string;
  components: ComponentInstruction[];
}

function loadInstructions(): InstructionFile {
  // Resolve relative to the project root (two levels up from dist/services/)
  const candidates = [
    join(__dirname, "..", "..", "component-instructions.json"),
    join(__dirname, "..", "component-instructions.json"),
    join(process.cwd(), "component-instructions.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, "utf-8");
      return JSON.parse(raw) as InstructionFile;
    } catch {
      // try next
    }
  }
  throw new Error("component-instructions.json not found in any candidate path");
}

// ── McKinsey insight schema ──────────────────────────────────────────────────

interface InsightMetric {
  label: string;
  value: string;
  trend: "up" | "down" | "stable";
}

interface GeneratedInsight {
  headline:       string;
  summary:        string;
  metrics:        InsightMetric[];
  recommendation: string;
  confidence:     "High" | "Medium" | "Low";
  trend:          "up" | "down" | "stable";
}

// ── Build compact temple context for the prompt ──────────────────────────────

function buildTempleContext(temples: typeof templesTable.$inferSelect[]): string {
  const snapshot = temples.map((t) => ({
    name:     t.name,
    location: t.location,
    status:   t.status,
    phase:    t.phase,
    progress: `${Math.round(parseFloat(t.constructionProgress as string))}%`,
    goal:     `$${(parseFloat(t.fundraisingGoal as string) / 1_000_000).toFixed(1)}M`,
    raised:   `$${(parseFloat(t.fundraisingRaised as string) / 1_000_000).toFixed(1)}M`,
    raisedPct: `${Math.round((parseFloat(t.fundraisingRaised as string) / parseFloat(t.fundraisingGoal as string)) * 100)}%`,
    completion: t.expectedCompletion,
  }));
  return JSON.stringify(snapshot, null, 2);
}

// ── Call Claude to generate one McKinsey brief ───────────────────────────────

async function generateInsight(
  component: ComponentInstruction,
  templeContext: string
): Promise<GeneratedInsight | null> {
  const prompt = `${component.prompt}

=== CURRENT ISKCON PROJECT DATA (${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}) ===
${templeContext}
=== END DATA ===

Return ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:
{
  "headline": "<bold KPI or key finding — e.g. '68% Portfolio Completion' or '$142M Capital Mobilised'>",
  "summary": "<2–3 sentence McKinsey-style insight grounded in the data above>",
  "metrics": [
    { "label": "<short label>", "value": "<precise value>", "trend": "<up|down|stable>" },
    { "label": "<short label>", "value": "<precise value>", "trend": "<up|down|stable>" },
    { "label": "<short label>", "value": "<precise value>", "trend": "<up|down|stable>" }
  ],
  "recommendation": "<one actionable recommendation — max 2 sentences>",
  "confidence": "<High|Medium|Low>",
  "trend": "<up|down|stable>"
}`;

  try {
    const msg = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      messages:   [{ role: "user", content: prompt }],
    });

    const block = msg.content[0];
    if (block?.type !== "text") return null;

    const raw = block.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(raw) as GeneratedInsight;
  } catch (err) {
    logger.error({ err, componentKey: component.key }, "Claude insight generation failed");
    return null;
  }
}

// ── Main: generate all component insights and upsert to DB ───────────────────

export async function generateComponentInsights(
  temples: typeof templesTable.$inferSelect[]
): Promise<number> {
  let generated = 0;

  let instructions: InstructionFile;
  try {
    instructions = loadInstructions();
  } catch (err) {
    logger.error({ err }, "Failed to load component-instructions.json — skipping insights generation");
    return 0;
  }

  const templeContext = buildTempleContext(temples);

  logger.info(
    { componentCount: instructions.components.length },
    "Generating McKinsey-style component insights"
  );

  for (const component of instructions.components) {
    const insight = await generateInsight(component, templeContext);
    if (!insight) continue;

    try {
      await db.insert(componentInsightsTable).values({
        componentKey:   component.key,
        title:          component.title,
        subtitle:       component.subtitle,
        headline:       insight.headline,
        summary:        insight.summary,
        metrics:        JSON.stringify(insight.metrics),
        recommendation: insight.recommendation,
        confidence:     insight.confidence,
        trend:          insight.trend,
      });

      generated++;
      logger.info(
        { componentKey: component.key, headline: insight.headline, confidence: insight.confidence },
        "Component insight generated"
      );
    } catch (err) {
      logger.error({ err, componentKey: component.key }, "Failed to persist component insight");
    }
  }

  return generated;
}

// ── Query: latest insight per component key ───────────────────────────────────

export async function getLatestComponentInsights() {
  // Fetch all, then pick the most recent per componentKey
  const all = await db
    .select()
    .from(componentInsightsTable)
    .orderBy(desc(componentInsightsTable.generatedAt));

  const seen  = new Set<string>();
  const deduped: typeof all = [];
  for (const row of all) {
    if (!seen.has(row.componentKey)) {
      seen.add(row.componentKey);
      deduped.push(row);
    }
  }
  return deduped;
}
