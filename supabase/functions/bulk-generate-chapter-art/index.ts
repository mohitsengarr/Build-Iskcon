// Supabase Edge Function: bulk-generate-chapter-art (v7)
//
// v7 changes (visual check after the response, Image Playground configuration):
// - Supabase cuts every request at 150s, a streamed response too, and a live
//   chapter-mode run ran out of time before its check. Chapter and sample modes
//   (gallery requests) now render once, insert the cover with a "running"
//   visual_check record, return that record as visualCheck, and check the cover
//   after the response in EdgeRuntime.waitUntil, starting nothing 360s after the
//   worker started (backgroundDeadline). The check only flags a clearly
//   contradicted fact on the row, never re-renders under a reviewer, and writes
//   its record only while the row still holds the checked cover (compare-and-swap
//   on id + image_path). No fact in the prompt, a SAFE_FALLBACK cover or a check
//   that is off gets a skipped record and no background check.
// - Bulk mode still checks each cover before its insert (the run is already
//   waitUntil work) and re-renders on a clear contradiction. A re-render never
//   falls back to SAFE_FALLBACK: that image carries no facts, so the loop could
//   only discard it after paying for it.
// - An active Image Playground configuration now drives every attempt: steps is
//   sent (FLUX models only), its style_positives, style_negatives and extra_rules
//   take the place of this function's style text (the gender and anachronism
//   rules and the wide composition stay), prompt_max_len sets the prompt limits
//   (it could only lower them before), the fallback model is the configured one
//   (else the primary model), and the fallback size keeps the cover's shape at
//   the configured fallback size. With no configuration a request is exactly as
//   before.
//
// v6 changes (visual check):
// - FLUX.2-pro drew three horses where the prompt said four. Each cover is now
//   checked by Claude vision (_shared/visualCheck.ts) against the research facts
//   that made it into its prompt, and the whole FLUX attempt chain re-runs with
//   the next seed while a fact is clearly contradicted. The image with the
//   fewest contradicted facts is kept.
// - Chapter and sample modes: up to 3 renders, all done 130s after the request
//   started. Bulk mode: up to 2 renders per chapter, and one deadline 360s after
//   the invocation started, shared by every chapter in the waitUntil run.
// - The result is stored in the review row's visual_check column and returned as
//   visualCheck, with safe_fallback true when the stored image came from
//   SAFE_FALLBACK. That image carries no facts, so it is kept unchecked (reason
//   safe_fallback) and never re-rendered. No fact in the prompt means no check:
//   one render, as before.
//   Apply migrations/20260913230000_visual_check.sql first; until then the row
//   is saved without the record.
// - Together bodies come from imagePayload: seed goes only to FLUX models, since
//   openai/gpt-image-2 has no seed parameter.
//
// v5 changes (scene research):
// - Before the prompt is built, getSceneResearch (_shared/sceneResearch.ts)
//   returns verified, sourced VISUAL facts for the picked scene: canon first,
//   then web facts. Key bhagavatam:g<n>:s<i> for a scene row, or
//   bhagavatam:g<n>:inline when the chapter has no scene row.
// - Facts sit straight after the scene, INSIDE the existing 1050-char
//   scene+persona budget (assemblePrompt drops whole facts/personas), so the
//   compressed style and rules keep exactly the room they had.
// - Research never throws or blocks: with no facts the prompt is byte-for-byte
//   the v4 prompt.
// - cfg.prompt_max_len can LOWER the 2000/1980/1050 limits, never raise them.
// - Bulk mode reads research from the cache only (allowNetwork: false): a fresh
//   cached row (e.g. from a pre-warm) plus canon, else canon only; never
//   Firecrawl, Claude or a cache write. A bulk item is nearly always a cache
//   miss, so network research could spend up to 250 Firecrawl requests per click
//   from the credit pool shared with the CRM crons and add up to 60s per chapter
//   to the waitUntil worker. Chapter and sample modes keep network research.
//   See researchMode.ts.
// - The last FLUX retry sends SAFE_FALLBACK, which carries no facts; that
//   attempt logs how many research facts it dropped (fluxAttempts.ts).
//
// v4 changes (correctness pass):
// - SANITIZER WORD BOUNDARIES: the bare alternation rewrote substrings inside
//   ordinary words — "warm saffron" → "blessingm saffron" (ART_STYLE itself
//   contains "war(m)"!), "toward" → "toblessingd". EVERY cover prompt shipped
//   corrupted, which is why rejection rates were so high.
// - SCENE CYCLING: regens after a reject used the SAME rank-1 scene every
//   time, so the reviewer kept seeing near-identical compositions. Now uses
//   bhagavatam_chapter_scenes.used_scene_indexes (same mechanism as
//   instagram-post) to advance to the next unused scene per generation,
//   cycling back when exhausted.
// - FLUX seed: explicit per-run random seed so even a repeated scene varies.
// - chapter mode dup-guard: a double-clicked reject no longer stacks
//   duplicate pending rows for the same chapter.
// - bulk mode logs a per-run summary (was: results silently discarded).
// - Deployed with verify_jwt (was fully public).
//
// v2: ANACHRONISM_RULES expanded to 5 enumerated rules matching instagram-post.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSceneResearch, type SceneResearchResult } from "../_shared/sceneResearch.ts";
import { assemblePrompt, inlineKey, normalizeForMatch, sanitizeForImageModel, sceneKey } from "../_shared/sceneResearchCore.ts";
import {
  backgroundDeadline,
  checkInBackground,
  imagePayload,
  initialRecord,
  needsBackgroundCheck,
  renderWithVisualCheck,
  runInBackground,
  type VisualCheckRecord,
} from "../_shared/visualCheck.ts";
import { fallbackSizeFor } from "../_shared/imageSizes.ts";
import { type FluxAttempt, runFluxAttempts } from "./fluxAttempts.ts";
import { type ResearchFn, researchScene } from "./researchMode.ts";

const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const BUILDISKCON = "https://buildiskcon.com";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOGETHER_KEY = Deno.env.get("TOGETHER_API_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Approved image configuration (Image Playground) ──────────────────────────
// One set of settings drives every generator; falls back to the values below if
// no configuration has been approved or the table is unreachable, so generation
// never depends on it.
interface ActiveGenCfg {
  model: string; width: number; height: number; steps: number | null;
  fallback_model: string | null; fallback_width: number | null; fallback_height: number | null;
  // Chapter covers are wide landscape heroes — they must not inherit the portrait
  // scene size, or the model gets a landscape brief in a portrait frame.
  cover_width: number | null; cover_height: number | null;
  // The approved style text (see coverStyle) and prompt limit (see promptLimits).
  style_positives?: string | null; style_negatives?: string | null; extra_rules?: string | null;
  prompt_max_len?: number | null;
}
// Read for every cover, never cached in the worker: a configuration approved in
// the playground reaches the next cover, and a failed read is not remembered (only
// that cover gets the values below).
async function getActiveGenConfig(): Promise<ActiveGenCfg | null> {
  try {
    const { data, error } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
    if (error) console.warn(`[bulk-generate-chapter-art] image_gen_config read failed (${error.message}); using the built-in defaults`);
    return (data as ActiveGenCfg) || null;
  } catch (e) {
    console.warn(`[bulk-generate-chapter-art] image_gen_config read threw (${e}); using the built-in defaults`);
    return null;
  }
}

// Prompt limits: a full prompt over maxLen takes the compressed branch, where
// scene+persona text (plus research facts) gets headMax chars and the whole
// prompt is re-cut to cutLen, which leaves the sanitizer's longer "blessing" 20
// chars of room. With no prompt_max_len they are the v4 limits, 2000/1980/1050.
// An approved prompt_max_len is the limit: at or under 2000 each limit is capped
// at it, as before; above 2000 the whole prompt may grow to it while the head
// keeps 1050 chars.
const PROMPT_MAX_LEN = 2000;
const PROMPT_CUT_LEN = 1980;
const SCENE_HEAD_MAX_LEN = 1050;
function promptLimits(cfg: ActiveGenCfg | null): { maxLen: number; cutLen: number; headMax: number } {
  const v = Math.floor(Number(cfg?.prompt_max_len));
  if (!Number.isFinite(v) || v <= 0) return { maxLen: PROMPT_MAX_LEN, cutLen: PROMPT_CUT_LEN, headMax: SCENE_HEAD_MAX_LEN };
  if (v <= PROMPT_MAX_LEN) return { maxLen: v, cutLen: Math.min(v, PROMPT_CUT_LEN), headMax: Math.min(v, SCENE_HEAD_MAX_LEN) };
  return { maxLen: v, cutLen: v - (PROMPT_MAX_LEN - PROMPT_CUT_LEN), headMax: SCENE_HEAD_MAX_LEN };
}

const RESEARCH_BOOK = "bhagavatam";

// ── Scene research: network for chapter/sample, cache only for bulk ──────────
// researchScene (researchMode.ts) never rejects. Bulk passes networkResearch
// false and gets getSceneResearch(..., { allowNetwork: false }): a fresh cached
// row plus canon ("hit"), else canon only ("skipped"), with no Firecrawl, no
// Claude and no cache write. Chapter and sample modes call getSceneResearch
// exactly as before (no options).
const runSceneResearch: ResearchFn = (input, opts) => getSceneResearch(supabase, input, opts);

// ── Visual check: when it runs ───────────────────────────────────────────────
// Chapter and sample modes answer a gallery request, which Supabase cuts at 150s
// (a streamed response too): the cover is rendered once, inserted with its
// initial record, and checked after the response in waitUntil (flag only). Bulk
// runs are waitUntil work already: each cover is checked before its insert, up to
// 2 renders, and one deadline 360s after the worker started (backgroundDeadline)
// covers every chapter in the run.
const BULK_MAX_ATTEMPTS = 2;
type CheckPlan =
  | { mode: "after_response"; invocationStart: number }
  | { mode: "before_insert"; deadlineAt: number; maxAttempts: number };
// The stored visual_check: the record plus safe_fallback, true when the stored
// image came from SAFE_FALLBACK, a prompt that carries no facts.
type StoredCheck = VisualCheckRecord & { safe_fallback: boolean };

const GENDER_RULES = [
  "ABSOLUTE GENDER RULES (NEVER VIOLATE):",
  "1) Women MUST have completely smooth clean-shaven feminine faces — ZERO facial hair.",
  "2) Men MUST have clearly masculine faces. Some sages are clean-shaven (Narada, Shukadeva), others bearded (Vyasa, Bhishma) — follow persona description.",
  "3) Men NEVER have flowers in hair — only Krishna may wear a peacock feather.",
  "4) Male and female characters must look visually DISTINCT.",
  "5) BACKGROUND / CROWD figures must be UNAMBIGUOUSLY gendered — males in dhoti, females in sari. If unspecified, render two clearly separate gendered clusters.",
].join(" ");

const ANACHRONISM_RULES = [
  "ABSOLUTE ANACHRONISM RULES (Vedic/Puranic era — NEVER VIOLATE):",
  "1) NO eyewear of ANY kind — no spectacles, no eyeglasses, no reading glasses, no monocles, no sunglasses, no goggles. Eyes and faces are bare. Sages, scholars and elders read palm-leaf manuscripts with their naked eyes.",
  "2) NO modern clothing — no shirts, no trousers, no buttons, no zippers, no neckties, no western collars, no leather shoes, no sneakers. Only dhotis, saris, uttariyas, angavastrams, shawls, traditional jewelry, sandals or bare feet.",
  "3) NO timepieces or modern technology — NO watch, NO wristwatch, NO smartwatch, NO clock, NO leather wrist strap, NO metal watch band, NO digital display, NO fitness tracker. ALL WRISTS are either BARE or wear only TRADITIONAL bangles (kada, kangan, kankan). A watch on a wrist is FORBIDDEN. Also no pens, no paper books, no printed text, no electrical anything. Only palm-leaf manuscripts, brass vessels, oil lamps, conches.",
  "4) NO modern grooming — NO fade haircuts, NO undercuts, NO buzz cuts, NO pompadours, NO modern barber cuts, NO sharp angular barber-shaped beards, NO hipster goatees, NO designer stubble, NO sculpted beard edges, NO fade lines along the jaw, NO patchy bro-beard. Men are EITHER fully CLEAN-SHAVEN with a smooth jaw (no stubble at all) OR have a FULL NATURAL BEARD that follows the organic jawline — long flowing white/grey for sages and rishis, thick natural black/brown for kings and warriors. Beard edges are SOFT and NATURAL, never razor-sharp. Hair is long and flowing, or tied in a traditional topknot (shikha), or braided — never a modern haircut.",
  "5) NO post-Vedic objects (firearms, mechanical wheels with metal spokes, glass windows, brick architecture). Wooden/stone hermitage, thatched huts, ancient stone temples only.",
].join(" ");

const ART_STYLE = [
  "museum-quality 19th-century Indian devotional OIL PAINTING on canvas",
  "Raja Ravi Varma 1880-1900 aesthetic, Bombay-school realism",
  "VISIBLE oil-paint brushstrokes and canvas weave texture",
  "matte hand-painted finish, oil glaze layers, impasto highlights",
  "warm saffron / ochre / amber palette",
  "soft golden-hour lighting, mild chiaroscuro",
  "ancient Vedic setting — palm-leaf manuscripts, brass vessels, oil lamps",
  "WIDE landscape composition with rich environment, suitable as a chapter cover",
  "NOT photo-realistic NOT photographic NOT 3D render NOT CGI",
  "NOT cartoon NOT anime NOT manga NOT comic-book NOT cel-shaded",
  "NOT digital illustration NOT vector art NOT airbrushed smooth-render",
  "NOT plastic shiny skin NOT video-game render NOT Pixar style NOT Disney style",
  "NOT modern fantasy concept art NOT Artstation NOT trending Midjourney style",
].join(", ");

const SAFE_FALLBACK = `A wide landscape oil-painting scene from Srimad Bhagavatam: a sage and devotees in a forest hermitage under golden afternoon sunlight, palm-leaf manuscripts and brass vessels nearby. ${ART_STYLE.substring(0, 600)}. ${GENDER_RULES} ${ANACHRONISM_RULES}`;

interface ChapterInfo {
  globalNumber: number;
  number: number;
  skandh: number;
  title: string;
  batchNumber: number;
  pageNumber: number;
}

interface ChapterScene {
  title: string;
  summary: string;
  characters: string[];
  setting: string;
  mood: string;
  image_prompt: string;
  rank: number;
}

interface Persona {
  key: string;
  name: string;
  short_description: string;
  patterns: string[];
  gender: string;
}

async function loadPersonas(): Promise<Persona[]> {
  const { data } = await supabase
    .from("bhagwatham_personas")
    .select("key, name, short_description, patterns, gender");
  return data || [];
}

function matchPersonas(names: string[], personas: Persona[]): Persona[] {
  const matched: Persona[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    for (const p of personas) {
      if (seen.has(p.key)) continue;
      for (const pat of p.patterns || []) {
        try {
          if (new RegExp(pat, "i").test(name)) {
            matched.push(p);
            seen.add(p.key);
            break;
          }
        } catch { /* skip malformed pattern */ }
      }
    }
  }
  return matched;
}

// Scene store with rotation state — same mechanism instagram-post uses, so a
// rejected cover regenerates from the NEXT scene instead of repeating rank 1.
async function loadChapterScenes(globalNumber: number): Promise<{ scenes: ChapterScene[]; usedIndexes: number[] } | null> {
  const { data, error } = await supabase
    .from("bhagavatam_chapter_scenes")
    .select("scenes, used_scene_indexes")
    .eq("chapter_global_number", globalNumber)
    .maybeSingle();
  if (error || !data) return null;
  const scenes = Array.isArray(data.scenes) ? (data.scenes as ChapterScene[]) : [];
  if (scenes.length === 0) return null;
  return { scenes, usedIndexes: data.used_scene_indexes || [] };
}

function pickScene(scenes: ChapterScene[], usedIndexes: number[]): { scene: ChapterScene; index: number; cycleReset: boolean } {
  const sorted = scenes.map((s, idx) => ({ s, idx })).sort((a, b) => (a.s.rank || 99) - (b.s.rank || 99));
  for (const { s, idx } of sorted) {
    if (!usedIndexes.includes(idx)) return { scene: s, index: idx, cycleReset: false };
  }
  return { scene: sorted[0].s, index: sorted[0].idx, cycleReset: true };
}

async function markSceneUsed(globalNumber: number, sceneIndex: number, currentUsed: number[]): Promise<void> {
  const updated = [...new Set([...currentUsed, sceneIndex])];
  await supabase
    .from("bhagavatam_chapter_scenes")
    .update({ used_scene_indexes: updated })
    .eq("chapter_global_number", globalNumber);
}

async function resetSceneCycle(globalNumber: number, firstSceneIndex: number): Promise<void> {
  await supabase
    .from("bhagavatam_chapter_scenes")
    .update({ used_scene_indexes: [firstSceneIndex] })
    .eq("chapter_global_number", globalNumber);
}

async function tryGenerate(prompt: string, model: string, w: number, h: number, seed?: number, steps?: number | null, signal?: AbortSignal): Promise<string | null> {
  try {
    // seed and steps go only to FLUX models (imagePayload). signal ends a
    // re-render the visual check has abandoned.
    const body = imagePayload(model, prompt, w, h, { seed, steps });
    const res = await fetch(TOGETHER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_KEY}` },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) { console.log(`${model}: ${res.status}`); return null; }
    return (await res.json()).data?.[0]?.b64_json || null;
  } catch (e) { console.log(`${model} err: ${e}`); return null; }
}

// Word-boundary anchors are load-bearing: without \b the alternation
// rewrote substrings inside ordinary words ("warm" → "blessingm").
// Kept as-is (it already has \b and covers more words than the shared
// sanitizer, e.g. fire/defeat); assemblePrompt additionally applies the shared
// sanitizeForImageModel to the scene/facts/persona head when facts are present.
const SANITIZE_RE = /\b(battle|war|fight|weapon|sword|arrow|kill|death|blood|fire|burn|destroy|attack|strike|naked|nude|tattered|humiliating|shocking|disorder|defeat)\b/gi;
function sanitizePrompt(text: string): string {
  return text.replace(SANITIZE_RE, "blessing");
}

// The style text of a cover prompt. With no configuration it is this function's
// own: ART_STYLE in the full layout, and in the compressed layout the shorter
// positives (ending with the wide composition) and negatives. An active
// configuration's style_positives, style_negatives and extra_rules take those
// places (an empty field adds nothing); a row with none of the three fields keeps
// this function's text. The gender and anachronism rules and the wide
// composition are this cover's own content and stay either way.
const COMPRESSED_STYLE_POSITIVES = "museum-quality 19th-century Indian devotional OIL PAINTING on canvas, Raja Ravi Varma 1880-1900 aesthetic, VISIBLE oil-paint brushstrokes, warm saffron palette, WIDE landscape composition";
const COMPRESSED_STYLE_NEGATIVES = "NOT cartoon, NOT anime, NOT CGI, NOT 3D render, NOT digital illustration, NOT Pixar style, NOT Midjourney style, NOT photo-realistic";
interface CoverStyle { full: string; positives: string; negatives: string; extraRules: string }
function coverStyle(cfg: ActiveGenCfg | null): CoverStyle {
  if (!cfg || (cfg.style_positives === undefined && cfg.style_negatives === undefined && cfg.extra_rules === undefined)) {
    return { full: ART_STYLE, positives: COMPRESSED_STYLE_POSITIVES, negatives: COMPRESSED_STYLE_NEGATIVES, extraRules: "" };
  }
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const positives = text(cfg.style_positives);
  const negatives = text(cfg.style_negatives);
  const extra = text(cfg.extra_rules);
  return {
    full: [positives, negatives].filter(Boolean).join(", "),
    positives: [positives, "WIDE landscape composition"].filter(Boolean).join(", "),
    negatives,
    // The gender rules follow it, so it ends a sentence.
    extraRules: extra && !/[.!?]$/.test(extra) ? `${extra}.` : extra,
  };
}

// factsUsed: the facts that made it into the prompt (none dropped for room, no
// duplicates). These are what the visual check verifies.
interface BuiltPrompt { prompt: string; factsInPrompt: number; sceneCut: boolean; factsUsed: string[] }

// With no facts and no configuration this is the v4 assembly, byte for byte.
// With facts, the head (scene, then "Canonical details: ...", then whole persona
// descriptions) is built by assemblePrompt inside the same 1050-char budget the
// v4 head had, and the compressed style + rules tail follows. (With this
// function's own style the uncompressed branch never fits at 2000: ART_STYLE +
// GENDER_RULES + ANACHRONISM_RULES alone exceed it. Facts always take the
// compressed layout.)
function buildPrompt(scenePrompt: string, matchedPersonas: Persona[], facts: string[], cfg: ActiveGenCfg | null): BuiltPrompt {
  const { maxLen, cutLen, headMax } = promptLimits(cfg);
  const style = coverStyle(cfg);
  const extraRules = style.extraRules ? `${style.extraRules} ` : "";
  const personaInject = matchedPersonas.length > 0
    ? " Characters: " + matchedPersonas.map(p => p.short_description).join(". ")
    : "";
  let fullPrompt = `${scenePrompt}${personaInject}, wide landscape composition${style.full ? `, ${style.full}` : ""}. ${extraRules}${GENDER_RULES} ${ANACHRONISM_RULES}`;
  let factsInPrompt = 0;
  let sceneCut = false;
  let factsUsed: string[] = [];
  if (fullPrompt.length > maxLen || facts.length > 0) {
    const tail = `${style.positives}${style.negatives ? `, ${style.negatives}` : ""}. ${extraRules}${GENDER_RULES.substring(0, 200)} ${ANACHRONISM_RULES.substring(0, 540)}`;
    if (facts.length > 0) {
      // Pre-sanitize with this function's regex so assemblePrompt measures the
      // final text ("fire" -> "blessing" grows) and the head stays within headMax.
      const { prompt: head, report } = assemblePrompt(
        {
          scene: sanitizePrompt(scenePrompt),
          facts: facts.map(sanitizePrompt),
          personas: matchedPersonas.map(p => sanitizePrompt(p.short_description)),
        },
        { maxLen: headMax, authorEdited: false },
      );
      factsInPrompt = Math.max(0, facts.length - report.droppedParts.filter(d => d.startsWith("facts[")).length);
      sceneCut = report.truncatedScene;
      // assemblePrompt keeps the first of any duplicate facts (same text once
      // sanitized) and names each fact it drops as facts[i].
      const dropped = new Set(report.droppedParts);
      const seen = new Set<string>();
      factsUsed = facts.filter((f, i) => {
        const k = normalizeForMatch(sanitizeForImageModel(sanitizePrompt(f)));
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return !dropped.has(`facts[${i}]`);
      });
      fullPrompt = `${head}${/[.!?,;:]$/.test(head) ? " " : ", "}${tail}`;
    } else {
      fullPrompt = `${scenePrompt}${personaInject}`.substring(0, headMax) + `, ${tail}`;
    }
    if (fullPrompt.length > maxLen) fullPrompt = fullPrompt.substring(0, cutLen);
  }
  return { prompt: sanitizePrompt(fullPrompt), factsInPrompt, sceneCut, factsUsed };
}

async function generateImage(
  scenePrompt: string,
  matchedPersonas: Persona[],
  research: SceneResearchResult | null,
  check: CheckPlan,
  label: string,
): Promise<{ b64: string; record: StoredCheck; facts: string[] }> {
  // Models, sizes, steps, style and limits come from the approved configuration when one exists.
  const __cfg = await getActiveGenConfig();
  const rawFacts: unknown = research?.facts;
  const facts = Array.isArray(rawFacts)
    ? rawFacts.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    : [];
  let built: BuiltPrompt;
  try {
    built = buildPrompt(scenePrompt, matchedPersonas, facts, __cfg);
  } catch (e) {
    // Research must never block generation: fall back to the no-facts prompt.
    console.warn(`[bulk-generate-chapter-art] fact assembly failed, using prompt without facts: ${e}`);
    built = buildPrompt(scenePrompt, matchedPersonas, [], __cfg);
  }
  if (research) {
    console.log(`[bulk-generate-chapter-art] research ${research.key} status=${research.status} facts=${facts.length} inPrompt=${built.factsInPrompt} ${research.ms}ms${built.sceneCut ? " sceneCut" : ""}`);
  }
  const sanitized = built.prompt;
  const seed = Math.floor(Math.random() * 1_000_000);
  const __m1 = __cfg?.model  || "black-forest-labs/FLUX.2-pro";
  const __w1 = __cfg?.cover_width  || __cfg?.width  || 1344;
  const __h1 = __cfg?.cover_height || __cfg?.height || 1088;
  // With a configuration the fallback model is its fallback_model, else its
  // primary model, and the fallback size keeps the cover's shape
  // (fallbackSizeFor). A configuration with no cover size renders at the scene
  // size with its own fallback size.
  const __m2 = __cfg ? (__cfg.fallback_model || __m1) : "black-forest-labs/FLUX.1.1-pro";
  const __fb = __cfg?.cover_width || __cfg?.cover_height
    ? fallbackSizeFor(__w1, __h1, __cfg?.fallback_width, __cfg?.fallback_height)
    : { w: __cfg?.fallback_width || 1024, h: __cfg?.fallback_height || 768 };
  const __steps = __cfg?.steps ?? null;
  // One render is the whole attempt chain below. renderIndex moves the seed so a
  // re-render of the same prompt draws a different picture (render 0 uses the
  // seed as before).
  const render = async (renderIndex: number, signal?: AbortSignal) => {
    const chain: FluxAttempt[] = [
      { model: __m1, prompt: sanitized, w: __w1, h: __h1, seed: seed + renderIndex },
      { model: __m2, prompt: sanitized, w: __fb.w, h: __fb.h, seed: seed + renderIndex },
      { model: __m2, prompt: SAFE_FALLBACK, w: __fb.w, h: __fb.h, safeFallback: true },
    ];
    // A re-render never ends on SAFE_FALLBACK: that image carries none of the
    // facts, so the check loop would only discard it after paying for it.
    const attempts = renderIndex === 0 ? chain : chain.filter(a => !a.safeFallback);
    const used: { attempt: FluxAttempt | null } = { attempt: null };
    // Same order and first-image-wins as before; the SAFE_FALLBACK attempt also
    // logs how many research facts it drops.
    const b64 = await runFluxAttempts(attempts, async a => {
      const img = await tryGenerate(a.prompt, a.model, a.w, a.h, a.seed, __steps, signal);
      if (img) used.attempt = a;
      return img;
    }, {
      tag: "bulk-generate-chapter-art",
      factsInPrompt: built.factsInPrompt,
      signal,
    });
    if (!b64) return null;
    // A SAFE_FALLBACK image carries none of the facts: it is kept unchecked
    // and never re-rendered, since the same prompt would only be refused again.
    const safeFallback = used.attempt?.safeFallback === true;
    return { b64, model: used.attempt?.model ?? null, safeFallback, skipCheck: safeFallback ? "safe_fallback" : null };
  };

  if (check.mode === "after_response") {
    // Chapter and sample modes: one render, stored with its initial record
    // (running, or skipped: no fact in the prompt, SAFE_FALLBACK, or the check
    // is off). generateCover starts the check once the row exists.
    const out = await render(0);
    if (!out) throw new Error("All FLUX attempts failed");
    const record = initialRecord({ factsUsed: built.factsUsed, safeFallback: out.safeFallback, imageModel: out.model, startedAt: Date.now() });
    return { b64: out.b64, record: { ...record, safe_fallback: out.safeFallback }, facts: built.factsUsed };
  }

  // Bulk: the visual check re-runs the chain while a fact is clearly contradicted.
  const checked = await renderWithVisualCheck({
    facts: built.factsUsed,
    maxAttempts: check.maxAttempts,
    deadlineAt: check.deadlineAt,
    tag: label,
    render,
  });
  // The record says when the stored image came from SAFE_FALLBACK.
  if (checked) return { b64: checked.b64, record: { ...checked.record, safe_fallback: checked.safeFallback === true }, facts: built.factsUsed };
  throw new Error("All FLUX attempts failed");
}

async function uploadImage(b64: string, ch: ChapterInfo): Promise<{ url: string; path: string }> {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const fn = `art-canto${ch.skandh}-ch${ch.number}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("chapter-art-images").upload(fn, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Upload: ${error.message}`);
  return { url: supabase.storage.from("chapter-art-images").getPublicUrl(fn).data.publicUrl, path: fn };
}

// Writes a background check's record over the running one, only while the row
// still holds the checked cover: .eq("image_path") makes the update a
// compare-and-swap, so a cover replaced meanwhile (regenerate-chapter-art) keeps
// its own record. A missing visual_check column, an error or a row that no
// longer matches is logged and not retried. A checked cover never came from
// SAFE_FALLBACK (that one is not checked), so safe_fallback stays false.
async function storeVisualCheck(id: number, imagePath: string, record: VisualCheckRecord): Promise<boolean> {
  const { data, error } = await supabase
    .from("bhagavatam_chapter_art_review")
    .update({ visual_check: { ...record, safe_fallback: false } })
    .eq("id", id)
    .eq("image_path", imagePath)
    .select("id");
  if (error) {
    const missing = error.code === "PGRST204" || error.code === "42703" || /visual_check/.test(error.message);
    console.warn(`[bulk-generate-chapter-art] visual_check for #${id} not stored: ${missing ? "the visual_check column is missing" : error.message}`);
    return false;
  }
  if (!Array.isArray(data) || data.length === 0) {
    console.log(`[bulk-generate-chapter-art] visual_check for #${id} not stored: the row no longer holds ${imagePath}`);
    return false;
  }
  return true;
}

async function listExistingChapters(): Promise<Set<number>> {
  const existing = new Set<number>();
  const { data: rows } = await supabase
    .from("bhagavatam_chapter_art_review")
    .select("chapter_canto, chapter_in_canto, status")
    .in("status", ["pending", "approved"]);
  for (const r of rows || []) {
    existing.add((r.chapter_canto as number) * 1000 + (r.chapter_in_canto as number));
  }
  return existing;
}

async function getMissingChapters(): Promise<ChapterInfo[]> {
  const indexRes = await fetch(`${BUILDISKCON}/api/bhagwatham/chapter-index`);
  if (!indexRes.ok) throw new Error("chapter-index fetch failed");
  const all: ChapterInfo[] = (await indexRes.json()).chapters || [];
  const existing = await listExistingChapters();
  return all.filter(c => !existing.has(c.skandh * 1000 + c.number));
}

async function getChapterText(chapter: ChapterInfo): Promise<string> {
  const r = await fetch(`${BUILDISKCON}/api/bhagwatham/batch/${chapter.batchNumber}`);
  if (!r.ok) return chapter.title;
  let text = "";
  for (const p of (await r.json()).pages || []) text += (p.text || "") + "\n";
  return text.substring(0, 2000);
}

async function generatePromptInline(chapter: ChapterInfo): Promise<{ prompt: string; description: string; sceneTitle: string }> {
  const text = await getChapterText(chapter);
  const chapterLabel = `Canto ${chapter.skandh}, Chapter ${chapter.number}`;
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `Create a chapter-cover image prompt for Srimad Bhagavatam ${chapterLabel} — ${chapter.title}.\n\nRequirements:\n  - WIDE LANDSCAPE composition (1344x1088), suitable as a hero image above the chapter title.\n  - Identify the central narrative moment of THIS chapter (read the content below). DO NOT default to Krishna unless Krishna actually appears.\n  - Label every character with MALE or FEMALE.\n  - Vedic/Puranic setting only: NO glasses, NO modern items, NO watches on any wrist (wrists are bare or only have traditional bangles).\n  - Each background group (attendants/courtiers/sages) must be gender-labelled.\n  - Style: Raja Ravi Varma 1880-1900 oil painting on canvas, NOT cartoon, NOT anime, NOT CGI.\n\nChapter content (Hindi/Sanskrit):\n${text}\n\nReturn ONLY JSON, no fences:\n{\"sceneTitle\":\"<short scene name under 80 chars>\",\"imagePrompt\":\"A wide landscape oil-painting establishing shot of ... Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.\",\"descriptionHi\":\"<one short Hindi sentence describing the scene>\"}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude failed: ${res.status}`);
  const out = (await res.json()).content?.[0]?.text || "";
  const cleaned = out.replace(/^```(?:json)?\s*/gm, "").replace(/^```\s*$/gm, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in Claude response");
  const parsed = JSON.parse(m[0]);
  return {
    prompt: parsed.imagePrompt || `A wide landscape oil painting of ${chapter.title}, classical Indian devotional style, Raja Ravi Varma aesthetic`,
    description: parsed.descriptionHi || chapter.title,
    sceneTitle: parsed.sceneTitle || chapter.title,
  };
}

// opts.networkResearch defaults to true (chapter/sample modes); bulk passes false.
// check carries the visual check's deadline and render limit for the request.
async function generateCover(
  chapter: ChapterInfo,
  opts: { networkResearch?: boolean },
  check: CheckPlan,
): Promise<{ ok: boolean; chapter: ChapterInfo; pendingId?: number; visualCheck?: StoredCheck; error?: string }> {
  try {
    const sceneRow = await loadChapterScenes(chapter.globalNumber);
    let imagePrompt: string;
    let sceneTitle: string;
    let descriptionHi: string;
    let sceneIndex: number | null = null;
    let sceneCharacters: string[] = [];
    let usedSceneInfo: { index: number; cycleReset: boolean } | null = null;

    if (sceneRow) {
      const { scene, index, cycleReset } = pickScene(sceneRow.scenes, sceneRow.usedIndexes);
      console.log(`Chapter ${chapter.globalNumber}: scene #${index} (rank ${scene.rank}) "${scene.title}"${cycleReset ? " [cycle reset]" : ""}`);
      imagePrompt = scene.image_prompt;
      sceneTitle = scene.title;
      descriptionHi = scene.summary;
      sceneIndex = index;
      sceneCharacters = scene.characters || [];
      usedSceneInfo = { index, cycleReset };
    } else {
      const inline = await generatePromptInline(chapter);
      imagePrompt = inline.prompt;
      sceneTitle = inline.sceneTitle;
      descriptionHi = inline.description;
    }

    // Scene research runs alongside the persona load, before the prompt is
    // built. researchScene never rejects, and getSceneResearch is hard-capped at
    // 60s; on any failure it returns canon-only or no facts. In bulk mode it
    // reads the cache only (see researchMode.ts). Note a reject moves to the NEXT
    // scene (new key), so the cache pays off for regenerates of the same scene,
    // not for rejects.
    const researchKey = sceneIndex !== null
      ? sceneKey(RESEARCH_BOOK, chapter.globalNumber, sceneIndex)
      : inlineKey(RESEARCH_BOOK, chapter.globalNumber);
    const [allPersonas, research] = await Promise.all([
      loadPersonas(),
      researchScene(runSceneResearch, {
        key: researchKey,
        book: RESEARCH_BOOK,
        sceneText: imagePrompt,
        title: sceneTitle,
        characters: sceneCharacters,
      }, opts.networkResearch !== false),
    ]);
    const matched = matchPersonas(sceneCharacters, allPersonas);

    const label = `bulk-generate-chapter-art g${chapter.globalNumber}`;
    const { b64, record, facts } = await generateImage(imagePrompt, matched, research, check, label);
    const { url, path } = await uploadImage(b64, chapter);

    const row = {
      chapter_global_number: chapter.globalNumber,
      chapter_canto: chapter.skandh,
      chapter_in_canto: chapter.number,
      chapter_title: chapter.title,
      image_url: url,
      image_path: path,
      prompt: imagePrompt.substring(0, 4000),
      description_hi: descriptionHi.substring(0, 2000),
      scene_index: sceneIndex,
      scene_title: sceneTitle.substring(0, 400),
      status: "pending",
    };
    let recordSaved = true;
    let { data: inserted, error } = await supabase
      .from("bhagavatam_chapter_art_review")
      .insert({ ...row, visual_check: record })
      .select("id")
      .single();
    if (error && /visual_check/.test(error.message)) {
      // The visual_check column is missing (migration not applied yet): keep the
      // cover rather than lose it, without the record. The check then has
      // nowhere to store its result, so it does not run.
      console.warn(`[bulk-generate-chapter-art] insert with visual_check failed (${error.message}); saving without it`);
      recordSaved = false;
      ({ data: inserted, error } = await supabase.from("bhagavatam_chapter_art_review").insert(row).select("id").single());
    }
    if (error) throw new Error(error.message);

    // Chapter and sample modes: the check runs after the response, in waitUntil.
    // It is registered here, before the handler returns its Response, and only
    // flags the row (storeVisualCheck).
    const pendingId = inserted?.id;
    if (check.mode === "after_response" && recordSaved && pendingId != null && needsBackgroundCheck(record)) {
      runInBackground(checkInBackground({
        b64,
        facts,
        imageModel: record.image_model,
        startedAt: record.started_at,
        deadlineAt: backgroundDeadline(check.invocationStart),
        tag: label,
        writeRecord: (checkedRecord) => storeVisualCheck(pendingId, path, checkedRecord),
      }));
    }

    // Advance the scene rotation only after a successful insert.
    if (usedSceneInfo && sceneRow) {
      if (usedSceneInfo.cycleReset) {
        await resetSceneCycle(chapter.globalNumber, usedSceneInfo.index);
      } else {
        await markSceneUsed(chapter.globalNumber, usedSceneInfo.index, sceneRow.usedIndexes);
      }
    }

    return { ok: true, chapter, pendingId: inserted?.id, visualCheck: record };
  } catch (e) {
    return { ok: false, chapter, error: String(e) };
  }
}

async function runInParallel<T>(items: T[], concurrency: number, fn: (item: T) => Promise<unknown>) {
  let i = 0;
  const results: unknown[] = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  // Backgrounded via EdgeRuntime.waitUntil — function logs are the only
  // place an operator can see how a bulk run actually went.
  const summary = results.map(r => (r && typeof r === "object" && "ok" in (r as Record<string, unknown>)) ? (r as { ok: boolean; error?: string; chapter?: { globalNumber?: number } }) : null);
  const failed = summary.filter(s => s && s.ok === false);
  console.log(`[bulk-generate-chapter-art] run complete: ${summary.length} attempted, ${failed.length} failed` + (failed.length ? ` — ${failed.map(f => `${f?.chapter?.globalNumber}: ${String(f?.error).substring(0, 80)}`).join("; ")}` : ""));
  return results;
}

Deno.serve(async (req: Request) => {
  const invocationStart = Date.now();
  // Chapter and sample modes: one render, checked after the response (flag only).
  const requestCheck: CheckPlan = { mode: "after_response", invocationStart };
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, authorization, apikey" } });
  }
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode: "status" | "sample" | "bulk" | "chapter" = body.mode || "status";

    if (mode === "status") {
      const missing = await getMissingChapters();
      const { count: pendingCount } = await supabase
        .from("bhagavatam_chapter_art_review")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      const { count: approvedCount } = await supabase
        .from("bhagavatam_chapter_art_review")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved");
      return new Response(JSON.stringify({
        missingCount: missing.length,
        pendingReviewCount: pendingCount || 0,
        approvedCount: approvedCount || 0,
        firstMissing: missing.slice(0, 5).map(c => ({ canto: c.skandh, chapter: c.number, title: c.title })),
      }), { headers: cors });
    }

    if (mode === "sample") {
      const missing = await getMissingChapters();
      if (missing.length === 0) {
        return new Response(JSON.stringify({ error: "No missing chapters" }), { status: 404, headers: cors });
      }
      const r = await generateCover(missing[0], {}, requestCheck);
      return new Response(JSON.stringify(r), { headers: cors });
    }

    if (mode === "chapter") {
      const v = body.chapter_global_number;
      if (typeof v !== "number" || v <= 0) {
        return new Response(JSON.stringify({ error: "chapter_global_number required" }), { status: 400, headers: cors });
      }
      const indexRes = await fetch(`${BUILDISKCON}/api/bhagwatham/chapter-index`);
      const all: ChapterInfo[] = (await indexRes.json()).chapters || [];
      const chapter = all.find(c => c.globalNumber === v);
      if (!chapter) return new Response(JSON.stringify({ error: `Chapter ${v} not in index` }), { status: 404, headers: cors });
      // A double-clicked reject or two concurrent regens previously stacked
      // duplicate pending rows for the same chapter. Skip if one is waiting.
      const { data: pendingRow } = await supabase
        .from("bhagavatam_chapter_art_review")
        .select("id")
        .eq("chapter_global_number", v)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      if (pendingRow) {
        return new Response(JSON.stringify({ ok: true, skipped: true, message: `Chapter ${v} already has a pending review row (id ${pendingRow.id})` }), { headers: cors });
      }
      const r = await generateCover(chapter, {}, requestCheck);
      return new Response(JSON.stringify(r), { headers: cors });
    }

    if (mode === "bulk") {
      const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));
      const concurrency = Math.min(5, Math.max(1, Number(body.concurrency) || 4));
      const missing = (await getMissingChapters()).slice(0, limit);
      if (missing.length === 0) {
        return new Response(JSON.stringify({ error: "No missing chapters" }), { status: 404, headers: cors });
      }
      // Bulk research reads the cache only: no Firecrawl or Claude calls and no
      // cache writes from this background worker (see researchMode.ts).
      // Every chapter in the run shares one visual-check deadline, 360s after the
      // worker started (backgroundDeadline), and is checked before its insert.
      const runCheck: CheckPlan = { mode: "before_insert", deadlineAt: backgroundDeadline(invocationStart), maxAttempts: BULK_MAX_ATTEMPTS };
      const generateOne = (c: ChapterInfo, opts: { networkResearch?: boolean }) => generateCover(c, opts, runCheck);
      // @ts-ignore - EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(runInParallel(missing, concurrency, (c: ChapterInfo) => generateOne(c, { networkResearch: false })));
      return new Response(JSON.stringify({
        started: true,
        queued: missing.length,
        concurrency,
        research: "cache-only",
        message: `Generating ${missing.length} chapter-art images in parallel (${concurrency} at a time). Watch the gallery's Chapter Art review section.`,
      }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "Invalid mode" }), { status: 400, headers: cors });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
