// Supabase Edge Function: generate-scene-image
//
// Generates artwork for one reader-saved scene (public.reader_scenes).
// The saved text is Hindi prose, so it is first turned into an English VISUAL
// prompt by Claude, then rendered with Together AI using the configuration
// approved in the Image Playground (public.image_gen_config, is_active = true).
// The image is stored in the instagram-images bucket and the row is updated with
// the public URL, so the Gallery flips it from "Not generated" to "Image generated".
//
// Visual check (_shared/visualCheck.ts): the Gallery calls this function and
// Supabase cuts a request at 150s, so the image is stored and returned first and
// Claude vision checks it AFTER the response (EdgeRuntime.waitUntil) against the
// research facts in its prompt. The check only flags: a clearly contradicted fact
// shows on the card, and the image is never re-rendered or swapped under a
// reviewer. The row is saved with a "running" record (skipped when there is
// nothing to check or the check is off) and the check writes its result over it
// in reader_scenes.visual_check, only while the scene still holds that image.
//
// DEPLOY ORDER: apply supabase/migrations/20260913190000_scene_visual_research.sql
// BEFORE deploying this function. Deployed first it is still safe (research is
// skipped while scene_visual_research cannot be read), it just does no research.
// Apply supabase/migrations/20260913230000_visual_check.sql (reader_scenes.visual_check)
// first too. Deployed before it, the image is still stored, only without its check
// record, and no check runs.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSceneResearch, sha16 } from "../_shared/sceneResearch.ts";
import { assemblePrompt, extractEntities, normalizeForMatch, readerKey, sanitizeForImageModel } from "../_shared/sceneResearchCore.ts";
import {
  backgroundDeadline,
  checkInBackground,
  imagePayload,
  initialRecord,
  needsBackgroundCheck,
  runInBackground,
  type VisualCheckRecord,
} from "../_shared/visualCheck.ts";
import { renderFailureMessage, renderWithRetry, type TogetherFailure } from "../_shared/togetherRetry.ts";

const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const TOGETHER_KEY = Deno.env.get("TOGETHER_API_KEY") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Sanitising uses the shared sanitizeForImageModel: WHOLE words only (plus simple
// plural/tense endings). Without word boundaries "war" was rewritten INSIDE other
// words ("warrior" -> "blessingrior", "warm" -> "blessingm").

// Defaults used only when no configuration has been approved yet.
const DEFAULTS = {
  model: "black-forest-labs/FLUX.2-pro", width: 1088, height: 1344, steps: null as number | null,
  style_positives: "museum-quality 19th-century Indian devotional OIL PAINTING on canvas, Raja Ravi Varma 1880-1900 aesthetic, VISIBLE oil-paint brushstrokes, warm saffron palette, soft golden-hour lighting",
  style_negatives: "NOT cartoon, NOT anime, NOT CGI, NOT 3D render, NOT digital illustration, NOT Pixar style, NOT plastic shiny skin, NOT photo-realistic",
  extra_rules: "ALL adult male characters MUST look distinctly MASCULINE with beards where appropriate. Vedic era only — NO glasses, NO modern clothing, NO modern technology.",
  prompt_max_len: 2000,
  fallback_model: "black-forest-labs/FLUX.1.1-pro", fallback_width: 768, fallback_height: 1024,
};

async function scenePromptFromText(passage: string, book: string): Promise<string> {
  if (!ANTHROPIC_KEY) return passage.slice(0, 400);
  const sys = "You turn a passage of Hindi scripture into ONE English prompt for a devotional oil painting. Reply with the prompt only — no preamble, no quotes. Describe WHO is present (label each as MALE or FEMALE), what they are doing, and the setting. Keep it under 90 words. Peaceful imagery only.";
  try {
    const r = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5", max_tokens: 400, system: sys,
        messages: [{ role: "user", content: `Book: ${book}\n\nPassage:\n${passage.slice(0, 1500)}` }],
      }),
    });
    const j = await r.json();
    const t = j?.content?.[0]?.text;
    return (typeof t === "string" && t.trim()) ? t.trim() : passage.slice(0, 400);
  } catch { return passage.slice(0, 400); }
}

interface ResearchOutcome { key: string; status: string; facts: string[]; absent: number; ms: number }

// The shared core treats a cache READ ERROR exactly like "no row". With the table
// missing (migration not applied yet) or the database erroring, EVERY call would
// spend 3 Firecrawl searches (a credit pool shared with the CRM crons), up to 2
// scrapes and an Opus call, cache nothing, and add up to 60s. So research runs
// only when this read of the same table and row the core reads succeeds (a row
// or no row).
// A read with no answer within CACHE_PROBE_TIMEOUT_MS counts as failed, so a
// hung database cannot hold up the image either.
const RESEARCH_CACHE_TABLE = "scene_visual_research";
const CACHE_PROBE_TIMEOUT_MS = 5_000;

async function researchCacheReadable(key: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), CACHE_PROBE_TIMEOUT_MS);
  });
  const read = (async () => {
    const { error } = await supabase
      .from(RESEARCH_CACHE_TABLE)
      .select("facts, status, expires_at, research_version, hit_count")
      .eq("research_key", key)
      .maybeSingle();
    return !error;
  })().catch(() => false);
  try {
    return await Promise.race([read, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

// A research fact must be about someone IN the scene. A fact that names people
// (the shared built-in name list, aliases folded: Partha is Arjuna) is dropped
// when NONE of them is named in the scene. This keeps the Arjuna's-chariot canon
// off Karna's or Bhishma's chariot at Kurukshetra, which its seeded
// "kurukshetra+chariot" trigger matches, and a web fact about Garuda off a scene
// without Garuda. A fact naming nobody ("four white horses") is kept, and so is
// one naming at least one person present, so "a banner bearing Hanuman flies
// above Arjuna's chariot" stays in an Arjuna scene. On any error: no facts.
function factsAboutScenePeople(facts: string[], sceneText: string): { kept: string[]; absent: number } {
  try {
    const people = (text: string) => extractEntities(text).characters.map((c) => normalizeForMatch(c));
    const present = new Set(people(sceneText));
    const kept = facts.filter((f) => {
      const named = people(f);
      return named.length === 0 || named.some((n) => present.has(n));
    });
    return { kept, absent: facts.length - kept.length };
  } catch {
    return { kept: [], absent: facts.length };
  }
}

// Verified canonical visual facts for this passage (cache first, then the web).
// NEVER throws: any failure, including computing the key, yields no facts, and
// the prompt is then exactly the one this function sent before research existed.
async function researchReaderScene(scene: { book?: string | null; selected_text?: string | null }, visual: string): Promise<ResearchOutcome> {
  let key = "";
  const started = Date.now();
  try {
    const passage = String(scene.selected_text ?? "");
    key = readerKey(String(scene.book ?? ""), await sha16(passage));
    // When Claude could not write the English visual prompt, `visual` is the raw
    // (Hindi) passage. It names no English entity, so research could only cache
    // an "empty" row under this passage's key for 30 days. Canon triggers are
    // English words too, so skipping loses nothing.
    if (visual === passage.slice(0, 400)) return { key, status: "not_run", facts: [], absent: 0, ms: 0 };
    if (!(await researchCacheReadable(key))) {
      console.warn(`[scene] research skipped: could not read ${RESEARCH_CACHE_TABLE} (migration 20260913190000 not applied, or a database error)`);
      return { key, status: "skipped", facts: [], absent: 0, ms: Date.now() - started };
    }
    const r = await getSceneResearch(supabase, {
      key,
      book: String(scene.book ?? ""),
      sceneText: visual,
      characters: extractEntities(visual).characters,
    });
    const { kept, absent } = factsAboutScenePeople(Array.isArray(r.facts) ? r.facts : [], visual);
    return { key: r.key, status: r.status, facts: kept, absent, ms: r.ms };
  } catch {
    return { key, status: "failed", facts: [], absent: 0, ms: 0 };
  }
}

// The facts a prompt really carries, which is what the visual check verifies.
// assemblePrompt sends a repeated fact once and names each fact it leaves out for
// room as facts[i]; neither was asked for, so neither is checked.
function factsKept(facts: string[], droppedParts: string[]): string[] {
  const dropped = new Set(droppedParts);
  const seen = new Set<string>();
  return facts.filter((f, i) => {
    const k = normalizeForMatch(sanitizeForImageModel(f));
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return !dropped.has(`facts[${i}]`);
  });
}

// The image prompt. With no research facts this is byte-for-byte the prompt the
// function built before research (visual, style, rules, cut to the limit,
// sanitised). With facts, assemblePrompt puts them straight after the scene and
// trims style (negatives first) rather than the scene or the facts. factsUsed is
// the facts the prompt carries ([] for the prompt without facts).
function buildImagePrompt(visual: string, facts: string[], cfg: typeof DEFAULTS): { prompt: string; note: string; factsUsed: string[] } {
  const maxLen = cfg.prompt_max_len || 2000;
  if (facts.length > 0) {
    try {
      const { prompt, report } = assemblePrompt({
        scene: visual,
        facts,
        stylePositives: cfg.style_positives,
        styleNegatives: cfg.style_negatives,
        extraRules: cfg.extra_rules,
      }, { maxLen });
      const dropped = report.droppedParts.length ? ` dropped=${report.droppedParts.join("|")}` : "";
      return {
        prompt,
        note: ` sent=${report.sentChars}/${report.maxLen}${report.truncatedScene ? " scene_cut" : ""}${dropped}`,
        factsUsed: factsKept(facts, report.droppedParts),
      };
    } catch {
      // fall through to the pre-research prompt
    }
  }
  let full = visual;
  if (cfg.style_positives) full += `, ${cfg.style_positives}`;
  if (cfg.style_negatives) full += `, ${cfg.style_negatives}`;
  if (cfg.extra_rules) full += `. ${cfg.extra_rules}`;
  if (full.length > maxLen) full = full.slice(0, maxLen);
  return { prompt: sanitizeForImageModel(full), note: "", factsUsed: [] };
}

// imagePayload sends steps only to black-forest-labs/ (FLUX) models:
// openai/gpt-image-2 has no such parameter. No seed is sent. A rate-limited post
// is re-sent by renderWithRetry before this attempt gives up, and why the
// attempt failed goes into `failures` so the scene's error can name the cause.
async function tryGenerate(prompt: string, model: string, w: number, h: number, steps: number | null, failures?: TogetherFailure[]) {
  const payload = imagePayload(model, prompt, w, h, { steps });
  const { b64, failure } = await renderWithRetry({
    request: () => fetch(TOGETHER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_KEY}` },
      body: JSON.stringify(payload),
    }),
    onFailure: (status, body, kind, willRetry) => {
      console.log(`[scene] ${model} HTTP ${status}: ${body} (${kind}${willRetry ? ", retrying" : ""})`);
    },
    onError: (e) => { console.log(`[scene] ${model} error ${e}`); },
  });
  if (!b64 && failure) failures?.push(failure);
  return b64;
}

// PostgREST PGRST204 or Postgres 42703: reader_scenes.visual_check does not exist
// (migration 20260913230000 not applied).
function visualCheckColumnMissing(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST204" || error?.code === "42703";
}

// The background check's write: visual_check only, and only while the scene still
// holds the checked image. Every upload has a new file name, so once a newer
// generation has stored its image (and its own record) this updates nothing.
// Never throws: a record that is not stored is logged and dropped.
async function storeCheckRecord(sceneId: number, imageUrl: string, record: VisualCheckRecord): Promise<boolean> {
  const notStored = `[scene] visual check for scene ${sceneId} not stored`;
  try {
    const { data, error } = await supabase
      .from("reader_scenes")
      .update({ visual_check: record })
      .eq("id", sceneId)
      .eq("image_url", imageUrl)
      .select("id");
    if (error) {
      console.warn(visualCheckColumnMissing(error)
        ? `${notStored}: reader_scenes.visual_check does not exist (migration 20260913230000 not applied)`
        : `${notStored}: ${error.message}`);
      return false;
    }
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`${notStored}: the scene was deleted or holds a newer image`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`${notStored}: ${e}`);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  // The background check's deadline counts from here, or from when the worker
  // started if it was already running (backgroundDeadline).
  const invocationStart = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  if (!TOGETHER_KEY) return new Response(JSON.stringify({ error: "TOGETHER_API_KEY is not configured" }), { status: 500, headers: CORS });

  try {
    const { scene_id } = await req.json() as { scene_id: number };
    if (!scene_id) return new Response(JSON.stringify({ error: "scene_id is required" }), { status: 400, headers: CORS });

    const { data: scene, error: fErr } = await supabase.from("reader_scenes").select("*").eq("id", scene_id).single();
    if (fErr || !scene) return new Response(JSON.stringify({ error: `Scene ${scene_id} not found` }), { status: 404, headers: CORS });

    await supabase.from("reader_scenes").update({ status: "generating", error_message: null }).eq("id", scene_id);

    // Use the configuration approved in the playground. DEFAULTS apply only when
    // no active row can be read.
    const { data: cfgRow, error: cfgErr } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
    if (!cfgRow) console.warn(`[scene] no active image_gen_config${cfgErr ? ` (${cfgErr.message})` : ""}; rendering with the built-in defaults`);
    const cfg = { ...DEFAULTS, ...(cfgRow || {}) } as typeof DEFAULTS;

    const visual = await scenePromptFromText(scene.selected_text, scene.book);
    const research = await researchReaderScene(scene, visual);
    const { prompt: sanitized, note, factsUsed } = buildImagePrompt(visual, research.facts, cfg);
    console.log(`[scene] research key=${research.key} status=${research.status} facts=${research.facts.length}${research.absent ? ` dropped_absent=${research.absent}` : ""} ms=${research.ms}${note}`);

    const attempts = [
      { m: cfg.model, w: cfg.width, h: cfg.height },
      { m: cfg.fallback_model || cfg.model, w: cfg.fallback_width || cfg.width, h: cfg.fallback_height || cfg.height },
    ];
    // One render: the approved model, then the fallback model. Nothing is
    // re-rendered here, whatever the check finds.
    let rendered: { b64: string; model: string } | null = null;
    // Why each attempt failed, for this scene's chain only.
    const failures: TogetherFailure[] = [];
    for (const a of attempts) {
      const out = await tryGenerate(sanitized, a.m, a.w, a.h, cfg.steps, failures);
      if (out) { rendered = { b64: out, model: a.m }; break; }
    }
    if (!rendered) {
      // The row and the answer carry the same sentence, and it says whether this
      // was a rate limit (worth another click) or a refusal (edit the prompt).
      const failed = renderFailureMessage(failures, "All image attempts failed");
      await supabase.from("reader_scenes").update({ status: "failed", error_message: failed }).eq("id", scene_id);
      return new Response(JSON.stringify({ error: failed }), { status: 502, headers: CORS });
    }
    const b64 = rendered.b64;

    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const fn = `scene-${scene_id}-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("instagram-images").upload(fn, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) {
      await supabase.from("reader_scenes").update({ status: "failed", error_message: `upload: ${upErr.message}` }).eq("id", scene_id);
      return new Response(JSON.stringify({ error: `Upload failed: ${upErr.message}` }), { status: 500, headers: CORS });
    }
    const url = supabase.storage.from("instagram-images").getPublicUrl(fn).data.publicUrl;

    // Only the facts the prompt carries are checked: one left out for room was
    // never asked for. With none, or with the check off, the record is skipped and
    // no check runs. This function has no SAFE_FALLBACK prompt. started_at is when
    // the check is queued (now); its deadline counts from invocationStart.
    const queuedAt = Date.now();
    const visualCheck = initialRecord({ factsUsed, safeFallback: false, imageModel: rendered.model, startedAt: queuedAt });
    const saved = {
      image_generated: true, image_url: url, image_prompt: sanitized,
      status: "generated", generated_at: new Date().toISOString(), error_message: null,
    };
    const { error: saveErr } = await supabase.from("reader_scenes").update({ ...saved, visual_check: visualCheck }).eq("id", scene_id);
    if (saveErr) {
      // Most likely the visual_check column does not exist yet (migration not
      // applied). Save the image without the record rather than leave the scene
      // stuck on "generating".
      console.warn(`[scene] save with visual_check failed (${saveErr.message}); saving without it`);
      await supabase.from("reader_scenes").update(saved).eq("id", scene_id);
    }

    if (needsBackgroundCheck(visualCheck)) {
      if (visualCheckColumnMissing(saveErr)) {
        // The result could not be stored anywhere, so no Claude call is spent on it.
        console.warn("[scene] visual check not started: reader_scenes.visual_check does not exist (migration 20260913230000 not applied)");
      } else {
        // Handed to EdgeRuntime.waitUntil before the response, so it outlives it.
        runInBackground(checkInBackground({
          b64,
          facts: factsUsed,
          imageModel: rendered.model,
          startedAt: queuedAt,
          deadlineAt: backgroundDeadline(invocationStart),
          writeRecord: (record) => storeCheckRecord(scene_id, url, record),
          tag: `scene ${scene_id}`,
        }));
      }
    }

    return new Response(JSON.stringify({ ok: true, scene_id, image_url: url, image_prompt: sanitized, model_used: cfg.model, visual_check: visualCheck }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
