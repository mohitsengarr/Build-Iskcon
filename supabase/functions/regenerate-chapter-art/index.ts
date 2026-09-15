// Supabase Edge Function: regenerate-chapter-art
//
// Re-renders a chapter cover from an EDITED prompt, for any of the three review
// queues (Bhagavatam, Chaitanya, Gita). Without this a near-miss cover could only
// be approved as-is or rejected — and rejecting re-rolls the same prompt blindly.
//
// Uses the configuration approved in the Image Playground. Covers take
// cover_width/cover_height (wide landscape): the shared width/height is the
// PORTRAIT scene size, and regenerating at that size would silently change the
// aspect of a cover relative to how bulk generation makes it. The fallback
// render keeps the cover's shape too (fallbackSizeFor, _shared/imageSizes.ts).
//
// Scene research: before rendering, _shared/sceneResearch.ts supplies verified
// canonical visual details for the row's scene (e.g. Arjuna's chariot is drawn
// by exactly four white horses). They go straight after the reviewer's words,
// which are never cut to make room for them. Research never blocks a
// regenerate: if it fails, finds nothing, or no fact fits, the prompt is
// assembled exactly as it was before research existed.
//
// Visual check: Supabase cuts a request at 150s (a streamed response too), and
// only EdgeRuntime.waitUntil work outlives the response. So the cover is rendered
// once and saved with a "running" visual_check record, which the response
// returns, and Claude vision (_shared/visualCheck.ts) checks it after the
// response against the research facts the sent prompt carries. The check only
// flags a clearly contradicted fact (e.g. three horses where the prompt said
// four) on the row: nothing is re-rendered under a reviewer. Its record replaces
// the running one only while the row still holds this cover (a compare-and-swap
// on id + image_path), so a later regenerate keeps its own. No fact in the
// prompt means no check: the record says skipped (no_facts), as it does
// (disabled) when the check is switched off.
//
// POST { book: "bhagavatam"|"chaitanya"|"gita", id: 45, prompt: "...", apply_style?: bool, apply_facts?: bool }
//   apply_facts: false skips research for this request.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSceneResearch, type SceneResearchResult } from "../_shared/sceneResearch.ts";
import {
  assemblePrompt,
  gitaChapterKey,
  inlineKey,
  normalizeForMatch,
  sanitizeForImageModel,
  sceneKey,
} from "../_shared/sceneResearchCore.ts";
import {
  backgroundDeadline,
  checkInBackground,
  imagePayload,
  initialRecord,
  needsBackgroundCheck,
  runInBackground,
  type VisualCheckRecord,
} from "../_shared/visualCheck.ts";
import { fallbackSizeFor } from "../_shared/imageSizes.ts";

const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const TOGETHER_KEY = Deno.env.get("TOGETHER_API_KEY") || "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// `scenes` is where the pre-extracted scene behind a cover lives (Gita has none).
const BOOKS: Record<string, { table: string; bucket: string; prefix: string; scenes: string | null }> = {
  bhagavatam: { table: "bhagavatam_chapter_art_review", bucket: "chapter-art-images",  prefix: "art",    scenes: "bhagavatam_chapter_scenes" },
  chaitanya:  { table: "chaitanya_chapter_art_review",  bucket: "chaitanya-art-images", prefix: "art-cc", scenes: "chaitanya_chapter_scenes" },
  gita:       { table: "gita_chapter_art_review",       bucket: "instagram-images",    prefix: "gita",   scenes: null },
};

// The bucket a stored image lives in, read from its public URL. Bhagavatam covers
// have been written to more than one bucket over time, so deleting from a fixed
// bucket left files behind.
function bucketOf(url: unknown): string | null {
  const m = typeof url === "string" ? url.match(/\/storage\/v1\/object\/public\/([^/]+)\//) : null;
  return m ? m[1] : null;
}

const DEFAULTS = {
  model: "black-forest-labs/FLUX.2-pro", width: 1088, height: 1344, steps: null as number | null,
  cover_width: 1344 as number | null, cover_height: 1088 as number | null,
  style_positives: "museum-quality 19th-century Indian devotional OIL PAINTING on canvas, Raja Ravi Varma 1880-1900 aesthetic, VISIBLE oil-paint brushstrokes, warm saffron palette, soft golden-hour lighting",
  style_negatives: "NOT cartoon, NOT anime, NOT CGI, NOT 3D render, NOT digital illustration, NOT Pixar style, NOT plastic shiny skin, NOT photo-realistic",
  extra_rules: "ALL adult male characters MUST look distinctly MASCULINE with beards where appropriate. Vedic era only — NO glasses, NO modern clothing, NO modern technology.",
  prompt_max_len: 2000,
  fallback_model: "black-forest-labs/FLUX.1.1-pro", fallback_width: 1024, fallback_height: 832,
};

// No seed is sent, so each call is a new draw from the same prompt. steps goes
// only to FLUX models: openai/gpt-image-2 has no such parameter.
async function tryGenerate(prompt: string, model: string, w: number, h: number, steps: number | null) {
  const payload = imagePayload(model, prompt, w, h, { steps });
  const res = await fetch(TOGETHER_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_KEY}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) { console.log(`[regen-chapter] ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return null; }
  return (await res.json())?.data?.[0]?.b64_json || null;
}

// Writes the background check's record over the running one, only while the row
// still holds the cover that was checked: .eq("image_path") makes the update a
// compare-and-swap, so a cover replaced meanwhile keeps its own record. A missing
// visual_check column, an error or a row that no longer matches is logged and
// not retried.
async function storeVisualCheck(table: string, id: number, imagePath: string, record: VisualCheckRecord): Promise<boolean> {
  const { data, error } = await supabase.from(table)
    .update({ visual_check: record })
    .eq("id", id)
    .eq("image_path", imagePath)
    .select("id");
  if (error) {
    const missing = error.code === "PGRST204" || error.code === "42703" || /visual_check/.test(error.message);
    console.warn(`[regen-chapter] ${table} #${id} visual_check not stored: ${missing ? "the visual_check column is missing" : error.message}`);
    return false;
  }
  if (!Array.isArray(data) || data.length === 0) {
    console.log(`[regen-chapter] ${table} #${id} visual_check not stored: the row no longer holds ${imagePath}`);
    return false;
  }
  return true;
}

// ── Prompt assembly ──────────────────────────────────────────────────────────

type BuiltPrompt = {
  sent: string;
  promptTruncated: boolean;
  styleApplied: boolean;
  styleTruncated: boolean;
  factsIncluded: number;
};

// The assembly this function has always used. A regenerate that gets no
// research fact sends exactly this. The edited prompt is the author's intent
// and the style block is boilerplate, so the prompt gets the budget first and
// style fills only the room that is left.
function legacyPrompt(prompt: string, cfg: typeof DEFAULTS, applyStyle: boolean, maxLen: number): BuiltPrompt {
  let base = prompt.trim();
  let style = "";
  if (applyStyle) {
    if (cfg.style_positives) style += `, ${cfg.style_positives}`;
    if (cfg.style_negatives) style += `, ${cfg.style_negatives}`;
    if (cfg.extra_rules) style += `. ${cfg.extra_rules}`;
  }
  let promptTruncated = false;
  if (base.length > maxLen) {
    // Cut on a word boundary so the tail is not left mid-word.
    const cut = base.slice(0, maxLen);
    const sp = cut.lastIndexOf(" ");
    base = sp > maxLen * 0.8 ? cut.slice(0, sp) : cut;
    promptTruncated = true;
  }
  const room = maxLen - base.length;
  const styleApplied = style.length > 0 && room > 0;
  const styleTruncated = styleApplied && style.length > room;
  const full = styleApplied ? base + style.slice(0, room) : base;
  // Whole words only: "warrior", "warm" and "toward" pass through untouched.
  return { sent: sanitizeForImageModel(full), promptTruncated, styleApplied, styleTruncated, factsIncluded: 0 };
}

// Facts already written into the draft (a stored prompt generated with them)
// are not sent a second time, and duplicates collapse to one.
function factsNotInDraft(facts: string[], draft: string): string[] {
  const hay = ` ${normalizeForMatch(sanitizeForImageModel(draft))} `;
  const seen = new Set<string>();
  return facts.filter((f) => {
    const k = normalizeForMatch(sanitizeForImageModel(f));
    if (!k || seen.has(k) || hay.includes(` ${k} `)) return false;
    seen.add(k);
    return true;
  });
}

// The research facts the sent prompt really carries, which is what the visual
// check verifies: facts added above, and facts already written into the draft (a
// Gita draft pre-filled from a stored prompt that was made with them). A fact
// left out for room, or cut off with the draft, was never asked for.
function factsInSentPrompt(facts: unknown[], sent: string): string[] {
  const hay = ` ${normalizeForMatch(sent)} `;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of facts) {
    if (typeof f !== "string") continue;
    const k = normalizeForMatch(sanitizeForImageModel(f));
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (hay.includes(` ${k} `)) out.push(f.trim());
  }
  return out;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Gita drafts are pre-filled from the stored prompt, which already carries the
// house style, and some reviewer drafts start with it. Style is re-applied at
// its own priority, so whole, unedited copies are taken out of the draft rather
// than sent twice as uncuttable author text that leaves the facts no room.
function withoutStyleCopies(draft: string, styles: unknown[]): string {
  let out = draft.replace(/\s+/g, " ");
  for (const raw of styles) {
    if (typeof raw !== "string") continue;
    const s = raw.replace(/\s+/g, " ").trim().replace(/[\s,;:.]+$/, "");
    if (s.length < 20) continue;
    for (const variant of new Set([s, sanitizeForImageModel(s)])) {
      out = out.replace(new RegExp(`[\\s,;:.]*(?<=^|[\\s,;:.])${escapeRegExp(variant)}(?=$|[\\s,;:.])`, "g"), "");
    }
  }
  out = out.replace(/^[\s,;:.]+/, "").trim();
  return out.length >= 3 ? out : draft;
}

// Reviewer's words first, never cut unless they alone exceed maxLen; facts take
// the room after them, then rules and style. Null when no fact fits, so the
// caller sends the legacy prompt unchanged.
function promptWithFacts(
  prompt: string,
  facts: string[],
  cfg: typeof DEFAULTS,
  applyStyle: boolean,
  maxLen: number,
): BuiltPrompt | null {
  const draft = prompt.trim();
  const fresh = factsNotInDraft(facts, draft);
  if (fresh.length === 0) return null;
  const style = applyStyle
    ? { extraRules: cfg.extra_rules, stylePositives: cfg.style_positives, styleNegatives: cfg.style_negatives }
    : {};
  const scene = applyStyle ? withoutStyleCopies(draft, [cfg.style_positives, cfg.style_negatives, cfg.extra_rules]) : draft;
  const { prompt: sent, report } = assemblePrompt({ scene, facts: fresh, ...style }, { maxLen, authorEdited: true });
  const factsIncluded = fresh.length - report.droppedParts.filter((d) => d.startsWith("facts[")).length;
  if (factsIncluded <= 0) return null;
  const labels = Object.entries(style).filter(([, v]) => typeof v === "string" && v.trim()).map(([k]) => k);
  const lost = labels.filter((l) => report.droppedParts.includes(l)).length;
  const partial = labels.some((l) => report.droppedParts.includes(`${l} (partial)`));
  const styleApplied = labels.length > lost;
  return {
    sent,
    promptTruncated: report.truncatedScene,
    styleApplied,
    styleTruncated: styleApplied && (lost > 0 || partial),
    factsIncluded,
  };
}

// ── Scene research ───────────────────────────────────────────────────────────

type ResearchTarget = { key: string; title: string | null; characters: string[] | null };

function wholeNumber(v: unknown, min: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min ? n : null;
}

function nonEmpty(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function loadScene(
  table: string | null,
  globalNumber: number,
  index: number,
): Promise<{ title: string | null; characters: string[] | null }> {
  const none = { title: null, characters: null };
  if (!table) return none;
  try {
    const { data, error } = await supabase.from(table).select("scenes").eq("chapter_global_number", globalNumber).maybeSingle();
    const scene = !error && Array.isArray(data?.scenes) ? data.scenes[index] : null;
    if (!scene || typeof scene !== "object") return none;
    const characters = Array.isArray(scene.characters)
      ? scene.characters.filter((c: unknown) => typeof c === "string" && c.trim())
      : [];
    return { title: nonEmpty(scene.title), characters: characters.length > 0 ? characters : null };
  } catch {
    return none;
  }
}

// Keyed from the row's own columns, the same keys the generators use:
// '<book>:g<n>:s<i>' for a cover made from a pre-extracted scene,
// '<book>:g<n>:inline' when it had none, 'gita:ch<n>' for the Gita.
async function researchTarget(book: string, row: Record<string, unknown>): Promise<ResearchTarget | null> {
  if (book === "gita") {
    const n = wholeNumber(row.chapter_number, 1);
    // Every Gita chapter is Krishna's dialogue with Arjuna.
    return n === null ? null : { key: gitaChapterKey(n), title: nonEmpty(row.chapter_title), characters: ["Krishna", "Arjuna"] };
  }
  const g = wholeNumber(row.chapter_global_number, 1);
  if (g === null) return null;
  const idx = wholeNumber(row.scene_index, 0);
  if (idx === null) return { key: inlineKey(book, g), title: nonEmpty(row.scene_title), characters: null };
  // The scene's characters let trigger matching see what the cover was made from.
  const scene = await loadScene(BOOKS[book].scenes, g, idx);
  return { key: sceneKey(book, g, idx), title: nonEmpty(row.scene_title) ?? scene.title, characters: scene.characters };
}

// Never throws: any failure means no research, and the regenerate goes ahead.
async function researchRow(book: string, row: Record<string, unknown>, draft: string): Promise<SceneResearchResult | null> {
  try {
    const target = await researchTarget(book, row);
    if (!target) return null;
    return await getSceneResearch(supabase, {
      key: target.key,
      book,
      sceneText: draft,
      title: target.title,
      characters: target.characters,
    });
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const invocationStart = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  if (!TOGETHER_KEY) return new Response(JSON.stringify({ error: "TOGETHER_API_KEY is not configured" }), { status: 500, headers: CORS });

  try {
    const { book, id, prompt, apply_style, apply_facts } = await req.json() as
      { book: string; id: number; prompt: string; apply_style?: boolean; apply_facts?: boolean };
    const b = BOOKS[book];
    if (!b) return new Response(JSON.stringify({ error: `book must be one of ${Object.keys(BOOKS).join(", ")}` }), { status: 400, headers: CORS });
    if (!id || !prompt || prompt.trim().length < 3) {
      return new Response(JSON.stringify({ error: "id and prompt are required" }), { status: 400, headers: CORS });
    }

    const { data: row, error: fErr } = await supabase.from(b.table).select("*").eq("id", id).single();
    if (fErr || !row) return new Response(JSON.stringify({ error: `${book} #${id} not found` }), { status: 404, headers: CORS });
    // Only a cover awaiting review is re-rendered. An approved Gita or Chaitanya
    // cover is posted to Instagram as it stands, so it must not change unseen.
    if (row.status !== "pending") {
      return new Response(JSON.stringify({ error: `${book} #${id} is already ${row.status}; refresh the gallery` }), { status: 409, headers: CORS });
    }

    const { data: cfgRow } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
    const cfg = { ...DEFAULTS, ...(cfgRow || {}) } as typeof DEFAULTS;

    const maxLen = cfg.prompt_max_len || 2000;
    const applyStyle = apply_style !== false;

    // Verified canonical details for this row's scene. With no fact (research
    // failed, found nothing, or none fits) the prompt is exactly the legacy one.
    const research = apply_facts === false ? null : await researchRow(book, row, prompt.trim());
    let withFacts: BuiltPrompt | null = null;
    if (research && research.facts.length > 0) {
      try {
        withFacts = promptWithFacts(prompt, research.facts, cfg, applyStyle, maxLen);
      } catch {
        withFacts = null;
      }
    }
    const built = withFacts ?? legacyPrompt(prompt, cfg, applyStyle, maxLen);
    console.log(research
      ? `[regen-chapter] research key=${research.key} status=${research.status} facts=${research.facts.length} used=${built.factsIncluded} ms=${research.ms}`
      : `[regen-chapter] research ${apply_facts === false ? "off" : "skipped (no key for row)"} ${book} #${id}`);
    const sanitized = built.sent;

    // Covers are wide landscape — match how bulk generation makes them. The
    // fallback keeps that shape at the configured fallback size's scale
    // (fallbackSizeFor: a 1344x1088 cover with a 768x1024 fallback size falls back
    // at 1024x832); a configuration with no cover size renders at the scene size
    // with its own fallback size, as before.
    const w1 = cfg.cover_width  || cfg.width  || 1344;
    const h1 = cfg.cover_height || cfg.height || 1088;
    const fallback = cfg.cover_width || cfg.cover_height
      ? fallbackSizeFor(w1, h1, cfg.fallback_width, cfg.fallback_height)
      : { w: cfg.fallback_width || 1024, h: cfg.fallback_height || 832 };

    // One render: the model, then its fallback, first image wins, as before. A
    // render that throws still answers 500 with its error.
    let rendered: { b64: string; model: string } | null = null;
    for (const a of [
      { m: cfg.model, w: w1, h: h1 },
      { m: cfg.fallback_model || cfg.model, w: fallback.w, h: fallback.h },
    ]) {
      const img = await tryGenerate(sanitized, a.m, a.w, a.h, cfg.steps);
      if (img) { rendered = { b64: img, model: a.m }; break; }
    }
    if (!rendered) return new Response(JSON.stringify({ error: "All image attempts failed" }), { status: 502, headers: CORS });
    const { b64, model: imageModel } = rendered;

    // The facts the sent prompt carries are the ones the check verifies. The row
    // gets a running record, or a skipped one (no fact, or the check is off).
    const facts = research ? factsInSentPrompt(research.facts, sanitized) : [];
    const record = initialRecord({ factsUsed: facts, imageModel, startedAt: Date.now() });

    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const fn = `${b.prefix}-regen-${id}-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from(b.bucket).upload(fn, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) return new Response(JSON.stringify({ error: `Upload failed: ${upErr.message}` }), { status: 500, headers: CORS });
    const url = supabase.storage.from(b.bucket).getPublicUrl(fn).data.publicUrl;

    // The row is updated only while it is still pending and still holds the image
    // the reviewer was looking at. An Approve (or another regenerate) that landed
    // during the render would otherwise receive an image nobody reviewed. The old
    // file is deleted only after that update succeeds.
    const oldPath = row.image_path as string | null;
    const guardedUpdate = (fields: Record<string, unknown>) => {
      let q = supabase.from(b.table).update(fields).eq("id", id).eq("status", "pending");
      q = oldPath ? q.eq("image_path", oldPath) : q.is("image_path", null);
      return q.select("id");
    };
    const discardNew = async () => {
      try { await supabase.storage.from(b.bucket).remove([fn]); } catch { /* best effort */ }
    };

    const saved = { image_url: url, image_path: fn, prompt: prompt.trim(), error_message: null };
    let recordSaved = true;
    let { data: updRows, error: updErr } = await guardedUpdate({ ...saved, visual_check: record });
    if (updErr && /visual_check/.test(updErr.message)) {
      // The visual_check column is missing (migration not applied yet): save the new
      // image without the record. The check then has nowhere to store its result,
      // so it does not run.
      console.warn(`[regen-chapter] update with visual_check failed (${updErr.message}); saving without it`);
      recordSaved = false;
      ({ data: updRows, error: updErr } = await guardedUpdate(saved));
    }
    if (updErr) {
      await discardNew();
      return new Response(JSON.stringify({ error: `Update failed: ${updErr.message}` }), { status: 500, headers: CORS });
    }
    if (!updRows || updRows.length === 0) {
      await discardNew();
      return new Response(JSON.stringify({ error: `${book} #${id} was reviewed or changed while it rendered; nothing was replaced. Refresh the gallery.` }), { status: 409, headers: CORS });
    }
    if (oldPath && oldPath !== fn) {
      try { await supabase.storage.from(bucketOf(row.image_url) ?? b.bucket).remove([oldPath]); } catch { /* best effort */ }
    }

    // The check runs after the response, in waitUntil, so it is registered here,
    // before the Response is returned. It never renders, and starts nothing after
    // the invocation's background budget (backgroundDeadline).
    if (recordSaved && needsBackgroundCheck(record)) {
      runInBackground(checkInBackground({
        b64,
        facts,
        imageModel,
        startedAt: record.started_at,
        deadlineAt: backgroundDeadline(invocationStart),
        tag: `regen-chapter ${book} #${id}`,
        writeRecord: (checkedRecord) => storeVisualCheck(b.table, id, fn, checkedRecord),
      }));
    }

    // Report what was actually sent, so a silently-shortened prompt is visible
    // in the UI instead of looking like the edit simply had no effect.
    return new Response(JSON.stringify({
      ok: true, book, id, image_url: url, model_used: cfg.model, size: `${w1}x${h1}`,
      prompt_chars: prompt.trim().length, sent_chars: sanitized.length, max_len: maxLen,
      prompt_truncated: built.promptTruncated, style_applied: built.styleApplied, style_truncated: built.styleTruncated,
      research_key: research?.key ?? null, research_status: research?.status ?? "skipped", facts_included: built.factsIncluded,
      visual_check: record,
    }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
