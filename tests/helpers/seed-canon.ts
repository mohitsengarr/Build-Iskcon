// The canon rows the migration seeds, parsed from the SQL itself so the tests
// exercise exactly what the migration inserts.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CanonRow } from "../../supabase/functions/_shared/sceneResearchCore.ts";

const MIGRATION = new URL("../../supabase/migrations/20260913190000_scene_visual_research.sql", import.meta.url);

export function seededCanon(): CanonRow[] {
  const sql = readFileSync(fileURLToPath(MIGRATION), "utf8");
  const unquote = (s: string) => s.replace(/''/g, "'");
  const q = "'((?:[^']|'')*)'";
  const arr = "array\\[([\\s\\S]*?)\\](?:::text\\[\\])?";
  const row = new RegExp(
    `\\(\\s*(\\d+),\\s*${q},\\s*${q},\\s*${q},\\s*${arr},\\s*${arr},\\s*${arr},\\s*${q}\\s*\\)`,
    "g",
  );
  const items = (body: string) => [...body.matchAll(/'((?:[^']|'')*)'/g)].map((t) => unquote(t[1]));
  const rows: CanonRow[] = [];
  for (const m of sql.matchAll(row)) {
    rows.push({
      id: Number(m[1]),
      subject: unquote(m[2]),
      attribute: unquote(m[3]),
      prompt_text: unquote(m[4]),
      triggers: items(m[5]),
      context_triggers: items(m[6]),
      negative_triggers: items(m[7]),
      book: null,
      source: unquote(m[8]),
      active: true,
    });
  }
  return rows;
}
