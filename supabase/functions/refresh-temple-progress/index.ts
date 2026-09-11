// Supabase Edge Function: refresh-temple-progress
//
// Temple construction data went stale in April 2026 because nothing ever
// refreshed it. This re-researches temples from the open web (Firecrawl search →
// Claude extraction) and writes back only what it can actually evidence.
//
// Deliberately conservative: a field is written ONLY when the model returns a
// usable value AND cites a source. Construction projects move over months, so a
// weekly cadence is plenty and a missing answer must never blank existing data.
//
// POST body: { "limit": 10, "id": 123, "dry": true }
//   limit — how many temples to refresh this run (default 10)
//   id    — refresh one specific temple, ignoring staleness order
//   dry   — research and report, write nothing

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Edge functions get killed on long runs; stop starting new temples past this.
const TIME_BUDGET_MS = 110_000;

type Temple = {
  id: number; name: string; location: string; city: string | null; country: string | null;
  construction_progress: number | null; fundraising_goal: number | null;
  fundraising_raised: number | null; expected_completion: string | null;
};

async function search(query: string): Promise<Array<{ url: string; title: string; description: string }>> {
  const r = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${FIRECRAWL_KEY}` },
    body: JSON.stringify({ query, limit: 6 }),
  });
  if (!r.ok) {
    console.log(`[temple] firecrawl ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return [];
  }
  const j = await r.json();
  return (j?.data || []).map((d: Record<string, string>) => ({
    url: d.url || "", title: d.title || "", description: d.description || "",
  })).filter((d: { url: string }) => d.url);
}

async function extract(t: Temple, hits: Array<{ url: string; title: string; description: string }>) {
  const sys = [
    "You extract verifiable facts about a temple construction project from web search results.",
    "Return ONLY valid JSON, no markdown fence:",
    '{"construction_progress":null,"fundraising_raised":null,"expected_completion":null,"news":null,"sources":[],"confidence":"low"}',
    "construction_progress: 0-100 percent complete, ONLY if a result states or clearly implies it. Else null.",
    "fundraising_raised: amount raised in USD as a plain number, ONLY if stated. Else null.",
    "expected_completion: a year or 'Month YYYY', ONLY if stated. Else null.",
    "news: one sentence on the most recent concrete development, with its date if given. Else null.",
    "sources: URLs from the results that support what you returned. Empty if you returned nothing.",
    "confidence: high | medium | low.",
    "NEVER guess. A null is correct and expected — this overwrites a live database.",
  ].join("\n");
  const user = [
    `Temple: ${t.name}`,
    `Location: ${[t.city, t.location, t.country].filter(Boolean).join(", ")}`,
    `Currently recorded: progress=${t.construction_progress ?? "unknown"}%, raised=${t.fundraising_raised ?? "unknown"}, completion=${t.expected_completion ?? "unknown"}`,
    "",
    "Search results:",
    ...hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.description}`),
  ].join("\n");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 700, system: sys, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const text = (await r.json())?.content?.[0]?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON from Claude");
  return JSON.parse(m[0]) as {
    construction_progress: number | null; fundraising_raised: number | null;
    expected_completion: string | null; news: string | null; sources: string[]; confidence: string;
  };
}

async function refreshOne(t: Temple, dry: boolean) {
  const where = [t.city, t.country].filter(Boolean).join(" ");
  const hits = await search(`${t.name} ${where} ISKCON temple construction progress fundraising 2026`);
  if (hits.length === 0) return { id: t.id, name: t.name, skipped: "no search results" };

  const got = await extract(t, hits);
  // A claim with no source is a guess; refuse it.
  const sourced = Array.isArray(got.sources) && got.sources.length > 0;

  const patch: Record<string, unknown> = { last_researched_at: new Date().toISOString() };
  const changed: string[] = [];
  if (sourced && typeof got.construction_progress === "number" && got.construction_progress >= 0 && got.construction_progress <= 100
      && got.construction_progress !== t.construction_progress) {
    patch.construction_progress = got.construction_progress; changed.push(`progress→${got.construction_progress}%`);
  }
  if (sourced && typeof got.fundraising_raised === "number" && got.fundraising_raised > 0
      && got.fundraising_raised !== t.fundraising_raised) {
    patch.fundraising_raised = got.fundraising_raised; changed.push("raised");
  }
  if (sourced && got.expected_completion && got.expected_completion !== t.expected_completion) {
    patch.expected_completion = got.expected_completion; changed.push("completion");
  }
  if (sourced && got.news) {
    patch.latest_news = { summary: got.news, sources: got.sources, confidence: got.confidence };
    patch.latest_news_at = new Date().toISOString();
    changed.push("news");
  }
  if (sourced) patch.source_urls = got.sources.slice(0, 6);

  if (!dry) {
    const { error } = await supabase.from("discovered_temples").update(patch).eq("id", t.id);
    if (error) throw new Error(`update ${t.id}: ${error.message}`);
  }
  return { id: t.id, name: t.name, confidence: got.confidence, changed, dry };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!FIRECRAWL_KEY || !ANTHROPIC_KEY) {
    return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY / ANTHROPIC_API_KEY not configured" }), { status: 500, headers: CORS });
  }
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({})) as { limit?: number; id?: number; dry?: boolean };
    const limit = Math.max(1, Math.min(body.limit ?? 10, 25));
    const dry = body.dry === true;

    let q = supabase.from("discovered_temples")
      .select("id,name,location,city,country,construction_progress,fundraising_goal,fundraising_raised,expected_completion");
    if (body.id) q = q.eq("id", body.id);
    // Oldest research first, so repeated runs rotate through the whole set.
    else q = q.order("last_researched_at", { ascending: true, nullsFirst: true }).limit(limit);

    const { data: temples, error } = await q;
    if (error) throw new Error(error.message);
    if (!temples || temples.length === 0) {
      return new Response(JSON.stringify({ ok: true, refreshed: [], message: "no temples matched" }), { headers: CORS });
    }

    const refreshed: unknown[] = [];
    const errors: unknown[] = [];
    for (const t of temples as Temple[]) {
      if (Date.now() - started > TIME_BUDGET_MS) { errors.push({ skipped: "time budget reached" }); break; }
      try { refreshed.push(await refreshOne(t, dry)); }
      catch (e) { errors.push({ id: t.id, name: t.name, error: String(e).slice(0, 200) }); }
    }
    return new Response(JSON.stringify({ ok: true, dry, count: refreshed.length, refreshed, errors, ms: Date.now() - started }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
