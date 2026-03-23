import { Router } from "express";
import { getLatestComponentInsights } from "../services/component-insights";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const router = Router();

router.get("/insights/components", async (_req, res) => {
  try {
    const insights = await getLatestComponentInsights();

    // Also return the instruction file metadata so the frontend knows order/icons
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

    // Merge icon/accentColor from instruction file into insights
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
