import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSceneResearch, type SceneResearchInput } from "../_shared/sceneResearch.ts";
import {
  backgroundDeadline,
  imagePayload,
  type IndexedRender,
  initialRecord,
  needsBackgroundCheck,
  redoInBackground,
  type RenderOutput,
  runInBackground,
  type VisualCheckRecord,
} from "../_shared/visualCheck.ts";
import { fallbackSizeFor } from "../_shared/imageSizes.ts";
import { renderFailureMessage, renderWithRetry, type TogetherFailure } from "../_shared/togetherRetry.ts";
import { type FluxAttempt, runFluxAttempts } from "./fluxAttempts.ts";
import { inlineImagePrompt } from "./inlinePrompt.ts";
import {
  assemblePrompt,
  DEFAULT_FACTS_MAX,
  inlineKey,
  normalizeForMatch,
  type PromptParts,
  sanitizeForImageModel,
  sceneKey,
} from "../_shared/sceneResearchCore.ts";

const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const BUILDISKCON = "https://buildiskcon.com";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOGETHER_KEY = Deno.env.get("TOGETHER_API_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Approved image configuration (Image Playground) ──────────────────────────
// The active configuration drives every render: model, fallback model, size,
// steps, style, rules and prompt limit. The values in this file are used only
// when no configuration is active or the table is unreachable.
interface ActiveGenCfg {
  model: string; width: number; height: number; steps: number | null;
  fallback_model: string | null; fallback_width: number | null; fallback_height: number | null;
  // Instagram-specific size. Chapter art stays portrait for the books, so this
  // is separate rather than overloading width/height.
  ig_width: number | null; ig_height: number | null;
  style_positives?: string | null; style_negatives?: string | null; extra_rules?: string | null;
  prompt_max_len?: number | null;
}
// Read on every request, never cached: a configuration approved in the
// playground reaches the next post, and a failed read is not remembered.
async function getActiveGenConfig(): Promise<ActiveGenCfg | null> {
  try {
    const { data, error } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
    if (error) console.warn(`[instagram-post] image_gen_config read failed (${error.message}); using the built-in defaults`);
    return (data as ActiveGenCfg) || null;
  } catch (e) {
    console.warn(`[instagram-post] image_gen_config read threw (${e}); using the built-in defaults`);
    return null;
  }
}

// Instagram size: the configuration's ig_width x ig_height, or its width x height
// when no Instagram size is set. A fallback render at the Instagram size keeps the
// post's shape at the scale of the configured fallback size (fallbackSizeFor: its
// long side, the other side from the post's proportions): the configuration has no
// Instagram fallback size, and fallback_width x fallback_height used as it is (the
// portrait book size) would change the crop. With no configuration, 1344x768 and a
// 1024x576 fallback as before.
function instagramSizes(cfg: ActiveGenCfg | null): { w: number; h: number; fw: number; fh: number } {
  if (!cfg) return { w: 1344, h: 768, fw: 1024, fh: 576 };
  if (cfg.ig_width && cfg.ig_height) {
    const fallback = fallbackSizeFor(cfg.ig_width, cfg.ig_height, cfg.fallback_width, cfg.fallback_height);
    return { w: cfg.ig_width, h: cfg.ig_height, fw: fallback.w, fh: fallback.h };
  }
  const w = cfg.width || 1344;
  const h = cfg.height || 768;
  return { w, h, fw: cfg.fallback_width || w, fh: cfg.fallback_height || h };
}


// v35 changes:
// - SANITIZER WORD BOUNDARIES: the bare alternation rewrote substrings inside
//   ordinary words — "warm earthy palette" (ART_STYLE!) → "blessingm earthy
//   palette", "toward" → "toblessingd". EVERY image prompt shipped corrupted.
// - Deployed with verify_jwt (v34 was fully public).
//
// v29: ART_STYLE hardened with explicit negative anchors (cartoon/anime/CGI).
// v28: BACKGROUND/CROWD figures must be unambiguously gendered.
// v27: ANACHRONISM_RULES — no glasses, no modern items.
// v26: removed MAX_REJECTIONS cap; soft safety floor of 50.

const SOFT_SAFETY_FLOOR = 50;

// Visual check (_shared/visualCheck.ts): Claude vision checks the image against
// the research facts in its prompt. The request is cut at 150s, so the post is
// stored after one render and the check runs after the response, in
// EdgeRuntime.waitUntil. This is unattended generation: while a fact is clearly
// contradicted the image is re-rendered, and a better render replaces the stored
// one only while the post is still pending with that image. One render plus up
// to two re-renders, none started more than 360s after the worker started.
const CHECK_MAX_ATTEMPTS = 3;

const GENDER_RULES = [
  "ABSOLUTE GENDER RULES (NEVER VIOLATE):",
  "1) Women MUST have completely smooth clean-shaven feminine faces — ZERO facial hair, ZERO beard, ZERO mustache, ZERO stubble.",
  "2) Men MUST have clearly masculine faces. Some sages are clean-shaven (Narada, Shukadeva, Uddhava), others are bearded (Vyasa, Suta Goswami, Bhishma) — follow the persona description, do NOT default every male sage to a long white beard.",
  "3) Men NEVER have flowers in hair — only Krishna may wear a single peacock feather.",
  "4) Male and female characters must look visually DISTINCT.",
  "5) BACKGROUND / CROWD FIGURES (attendants, courtiers, ministers, soldiers, devotees, mourners, citizens) MUST be UNAMBIGUOUSLY gendered — never androgynous. Male background figures wear DHOTI (no sari), bare chest or angavastram, may have beards or moustaches, square jaw, broader shoulders, NO bangles on wrists, NO nose-ring, NO necklace cleavage. Female background figures wear SARI + choli with feminine bodies, softer face, may have bangles + nose-ring + bindi, NEVER bare-chested, NEVER bearded. If gender of a group is unspecified in the prompt, render TWO clearly separate clusters — a CLEARLY-MALE cluster (dhoti, masculine faces) on one side and a CLEARLY-FEMALE cluster (sari, feminine faces) on the other.",
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
  // Positive anchors — pin the medium and era hard
  "museum-quality 19th-century Indian devotional OIL PAINTING on canvas",
  "Raja Ravi Varma 1880-1900 aesthetic, Bombay-school realism in the style of M.V. Dhurandhar and Hemen Mazumdar",
  "VISIBLE oil-paint brushstrokes and canvas weave texture",
  "matte hand-painted finish, oil glaze layers, impasto highlights on faces and ornaments",
  "warm earthy palette — saffron, ochre, burnt sienna, amber, deep crimson",
  "soft golden-hour studio lighting from a single warm source, mild chiaroscuro shadows",
  "ancient Vedic setting with palm-leaf manuscripts, brass vessels, oil lamps, conches, stone or thatched architecture",
  // Negative anchors — explicit list of styles to AVOID
  "NOT photo-realistic NOT photographic NOT 3D render NOT CGI NOT octane render NOT unreal engine",
  "NOT cartoon NOT anime NOT manga NOT chibi NOT comic-book NOT cel-shaded NOT line art",
  "NOT digital illustration NOT vector art NOT flat-color illustrator NOT airbrushed smooth-render",
  "NOT plastic shiny skin NOT glossy CGI surfaces NOT video-game render NOT Pixar style NOT Disney style",
  "NOT modern fantasy concept art NOT Artstation render NOT trending Midjourney style",
].join(", ");

const SAFE_FALLBACK = `A serene scene from Srimad Bhagavatam: a celestial sage chants devotional verses in a forest hermitage under golden afternoon sunlight. ${ART_STYLE.substring(0, 600)}. ${GENDER_RULES} ${ANACHRONISM_RULES}`;

interface ChapterInfo { globalNumber: number; number: number; skandh: number; title: string; batchNumber: number; pageNumber: number; }
interface Persona { key: string; name: string; short_description: string; patterns: string[]; gender: string; }
interface ChapterScene { title: string; summary: string; characters: string[]; setting: string; mood: string; image_prompt: string; rank: number; }

async function loadPersonas(): Promise<Persona[]> {
  const { data } = await supabase.from("bhagwatham_personas").select("key, name, short_description, patterns, gender");
  return data || [];
}

async function loadChapterScenes(globalNumber: number): Promise<{ scenes: ChapterScene[]; usedIndexes: number[]; rejectedIndexes: number[] } | null> {
  const { data, error } = await supabase
    .from("bhagavatam_chapter_scenes")
    .select("scenes, used_scene_indexes")
    .eq("chapter_global_number", globalNumber)
    .maybeSingle();
  if (error || !data) return null;
  const scenes = Array.isArray(data.scenes) ? (data.scenes as ChapterScene[]) : [];
  if (scenes.length === 0) return null;
  // Scenes the editor turned down with "Reject scene" on a chapter cover. This
  // rotation is shared with bulk-generate-chapter-art, so posts skip them too.
  let rejectedIndexes: number[] = [];
  const { data: rej, error: rejErr } = await supabase
    .from("bhagavatam_chapter_scenes")
    .select("rejected_scene_indexes")
    .eq("chapter_global_number", globalNumber)
    .maybeSingle();
  if (!rejErr && Array.isArray(rej?.rejected_scene_indexes)) rejectedIndexes = rej.rejected_scene_indexes;
  return { scenes, usedIndexes: data.used_scene_indexes || [], rejectedIndexes };
}

async function markSceneUsed(globalNumber: number, sceneIndex: number, currentUsed: number[]): Promise<void> {
  const updated = [...new Set([...currentUsed, sceneIndex])];
  await supabase
    .from("bhagavatam_chapter_scenes")
    .update({ used_scene_indexes: updated })
    .eq("chapter_global_number", globalNumber);
}

// A rejected scene is never picked, not even on a cycle reset. null when every
// scene has been rejected: the caller falls back to the inline prompt.
function pickScene(scenes: ChapterScene[], usedIndexes: number[], rejectedIndexes: number[] = []): { scene: ChapterScene; index: number; cycleReset: boolean } | null {
  const sorted = scenes
    .map((s, idx) => ({ s, idx }))
    .filter(({ idx }) => !rejectedIndexes.includes(idx))
    .sort((a, b) => (a.s.rank || 99) - (b.s.rank || 99));
  if (sorted.length === 0) return null;
  for (const { s, idx } of sorted) {
    if (!usedIndexes.includes(idx)) return { scene: s, index: idx, cycleReset: false };
  }
  return { scene: sorted[0].s, index: sorted[0].idx, cycleReset: true };
}

async function resetSceneCycle(globalNumber: number, firstSceneIndex: number): Promise<void> {
  await supabase
    .from("bhagavatam_chapter_scenes")
    .update({ used_scene_indexes: [firstSceneIndex] })
    .eq("chapter_global_number", globalNumber);
}

async function detectCharacterNames(chapterTitle: string, content: string): Promise<string[]> {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `From this Srimad Bhagavatam chapter, list the SPECIFIC named characters who actually appear in the scene. Include gods, sages, kings, queens, demons, and devotees. Return ONLY a JSON array of English transliterated names. Do NOT include Krishna unless Krishna is actually present.\n\nTitle: ${chapterTitle}\nContent: ${content.substring(0, 1800)}\n\nReturn: ["Name1", "Name2", ...]`,
      }],
    }),
  });
  if (!res.ok) return [];
  const text = (await res.json()).content?.[0]?.text || "";
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return JSON.parse(m[0]); } catch { return []; }
}

function matchPersonas(names: string[], personas: Persona[]): Persona[] {
  const matched: Persona[] = [];
  const keys = new Set<string>();
  for (const name of names) {
    for (const p of personas) {
      if (keys.has(p.key)) continue;
      for (const pat of p.patterns || []) {
        try { if (new RegExp(pat, "i").test(name)) { matched.push(p); keys.add(p.key); break; } } catch { /* skip */ }
      }
    }
  }
  return matched;
}

// ── Mahājana attribution (the 12 authorities, SB 6.3.20-21) ──────────────────
// Tag each generated post with the Mahājana account that speaks in / appears in
// the chapter, so the app attributes the Darshan post to that account (feed +
// profile) and the approve function cross-posts it under their name. Fail-soft:
// null → no attribution, and the post falls back to the generic "bhaktigram".
let _mahajanAliases: Array<{ mahajan_key: string; alias: string }> | null = null;
async function loadMahajanAliases(): Promise<Array<{ mahajan_key: string; alias: string }>> {
  if (_mahajanAliases) return _mahajanAliases;
  const { data } = await supabase.from("bhaktigram_mahajan_aliases").select("mahajan_key, alias");
  _mahajanAliases = data || [];
  return _mahajanAliases;
}

const normName = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Resolve the Mahājana key from a chapter's detected characters, in priority
 * order (the first/most-prominent named character who is one of the 12 wins).
 * An alias matches when either side contains the other (normalized), so
 * "Narada Muni" hits the "Narada" alias and "Shuka" hits "Shukadeva".
 */
async function resolveMahajanKey(characterNames: string[], matched: Persona[]): Promise<string | null> {
  const aliases = await loadMahajanAliases();
  if (!aliases.length) return null;
  const normAliases = aliases.map(a => ({ key: a.mahajan_key, n: normName(a.alias) })).filter(a => a.n.length >= 3);
  const candidates = [...characterNames, ...matched.map(m => m.name)];
  for (const cand of candidates) {
    const nc = normName(cand);
    if (nc.length < 3) continue;
    for (const a of normAliases) {
      if (nc === a.n || nc.includes(a.n) || a.n.includes(nc)) return a.key;
    }
  }
  return null;
}

// ── Darshan verse (Sanskrit śloka + Hindi) ───────────────────────────────────
// Pull the anchor śloka in Devanagari + its Hindi translation for the depicted
// scene, shown under the artwork on the Darshan card. Fail-soft: nulls on error.
async function extractVerse(
  chapterTitle: string,
  content: string,
  sceneTitle?: string,
): Promise<{ sanskrit: string | null; hindi: string | null }> {
  const NONE = { sanskrit: null, hindi: null };
  try {
    const focus = sceneTitle ? ` The image depicts this scene: "${sceneTitle}" — prefer the verse most relevant to it.` : "";
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `From this Srimad Bhagavatam chapter, choose the SINGLE most representative Sanskrit śloka and give its faithful Hindi translation.${focus}\n\nReturn ONLY JSON: {"sanskrit":"<the ORIGINAL Sanskrit verse in Devanagari script, the two half-lines separated by a newline>","hindi":"<Hindi translation in Devanagari>"}. The "sanskrit" MUST be original Sanskrit in Devanagari — NOT transliteration, NOT Hindi. If the text contains no clear Sanskrit verse, return {"sanskrit":null,"hindi":null}.\n\nTitle: ${chapterTitle}\nContent: ${content.substring(0, 2500)}`,
        }],
      }),
    });
    if (!res.ok) return NONE;
    const text = (await res.json()).content?.[0]?.text || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return NONE;
    const parsed = JSON.parse(m[0]) as { sanskrit?: unknown; hindi?: unknown };
    const clean = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
    return { sanskrit: clean(parsed.sanskrit), hindi: clean(parsed.hindi) };
  } catch { return NONE; }
}

async function loadChapterByGlobalNumber(globalNumber: number): Promise<{ chapter: ChapterInfo; text: string }> {
  const indexRes = await fetch(`${BUILDISKCON}/api/bhagwatham/chapter-index`);
  if (!indexRes.ok) throw new Error(`chapter-index fetch failed`);
  const chapters: ChapterInfo[] = (await indexRes.json()).chapters || [];
  const chapter = chapters.find(c => c.globalNumber === globalNumber);
  if (!chapter) throw new Error(`Chapter ${globalNumber} not found in index`);
  const batchRes = await fetch(`${BUILDISKCON}/api/bhagwatham/batch/${chapter.batchNumber}`);
  if (!batchRes.ok) throw new Error(`batch fetch failed`);
  let text = ""; for (const p of (await batchRes.json()).pages || []) text += (p.text || "") + "\n";
  return { chapter, text: text.substring(0, 3000) };
}

async function getNextChapter(): Promise<{ chapter: ChapterInfo; text: string }> {
  const { data: state } = await supabase.from("ig_cron_state").select("*").single();
  const globalNum = state?.next_chapter || 170;
  return loadChapterByGlobalNumber(globalNum).catch(async () => {
    const indexRes = await fetch(`${BUILDISKCON}/api/bhagwatham/chapter-index`);
    const chapters: ChapterInfo[] = (await indexRes.json()).chapters || [];
    const chapter = chapters.find(c => c.globalNumber >= globalNum);
    if (!chapter) throw new Error(`No chapter >= ${globalNum}`);
    const batchRes = await fetch(`${BUILDISKCON}/api/bhagwatham/batch/${chapter.batchNumber}`);
    let text = ""; for (const p of (await batchRes.json()).pages || []) text += (p.text || "") + "\n";
    return { chapter, text: text.substring(0, 3000) };
  });
}

async function buildCaptionForScene(chapter: ChapterInfo, scene: ChapterScene): Promise<{ caption: string; hashtags: string }> {
  const chapterLabel = `Canto ${chapter.skandh}, Chapter ${chapter.number}`;
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `Write a 3-4 line English Instagram caption (engaging, devotional, narrative) for this Srimad Bhagavatam scene:\n\nChapter: ${chapterLabel} — ${chapter.title}\nScene: ${scene.title}\nSummary: ${scene.summary}\nCharacters: ${(scene.characters || []).join(", ")}\nSetting: ${scene.setting}\nMood: ${scene.mood}\n\nReturn ONLY the caption text (no quotes, no JSON, no preamble). Do not add hashtags or the Hare Krishna mantra — those are appended separately.`,
      }],
    }),
  });
  let summary = scene.summary;
  if (res.ok) {
    const t = (await res.json()).content?.[0]?.text || "";
    if (t.trim()) summary = t.trim();
  }
  // Caption layout (v30): summary is at the TOP so readers see the story
  // first, the mantra sits in the middle, and the chapter reference closes
  // out at the bottom right before the hashtags.
  const caption = `${summary}\n\n🙏 Hare Krishna Hare Krishna Krishna Krishna Hare Hare\nHare Rama Hare Rama Rama Rama Hare Hare\n\n📖 Srimad Bhagavatam — ${chapterLabel}`;
  const hashtags = `#SrimadBhagavatam #ISKCON #Krishna #HareKrishna #SrilaPrabhupada #BuildIskcon #Canto${chapter.skandh} #BhaktiYoga #KrishnaConsciousness`;
  return { caption, hashtags };
}

async function generateScenePromptInline(
  chapter: ChapterInfo,
  content: string,
  matchedPersonas: Persona[],
  varietySeed: number,
  prevRejectedPrompts: string[],
): Promise<{ imagePrompt?: unknown; prompt?: unknown; caption: string; hashtags: string }> {
  const chapterLabel = `Canto ${chapter.skandh}, Chapter ${chapter.number}`;
  const personaBlock = matchedPersonas.length > 0
    ? `\n\nCHARACTER DESCRIPTIONS (use these EXACT visual details):\n${matchedPersonas.map(p => `• ${p.short_description}`).join("\n\n")}\n`
    : "";
  const varietyHint = prevRejectedPrompts.length > 0
    ? `\n\nIMPORTANT — ${prevRejectedPrompts.length} prior generation(s) were rejected. Try a noticeably DIFFERENT scene moment. Variety seed: ${varietySeed}\nAvoid: ${prevRejectedPrompts.slice(-3).join(" | ").substring(0, 400)}\n`
    : "";

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: `Create an Instagram post for Srimad Bhagavatam ${chapterLabel}.\n\nIdentify the ACTUAL central character(s) and event of THIS chapter. NEVER force-include Krishna if not present.${personaBlock}${varietyHint}\n\nRules: WIDE establishing shot, classical Raja-Ravi-Varma OIL PAINTING with visible brushstrokes. MALE/FEMALE labels. ${GENDER_RULES}\n\nVedic/Puranic era — NO glasses, NO modern clothing, NO modern technology. ${ANACHRONISM_RULES}\n\nMedium: museum-quality 19th-century oil painting. NOT cartoon, NOT anime, NOT CGI, NOT digital illustration, NOT Pixar/Disney/Midjourney style.\n\nCaption: English only, 3-4 lines.\n\nHindi title: ${chapter.title}\nContent: ${content.substring(0, 1800)}\n\nReturn ONLY JSON:\n{"imagePrompt":"...","caption":"[summary]\\n\\n🙏 Hare Krishna Hare Krishna Krishna Krishna Hare Hare\\nHare Rama Hare Rama Rama Rama Hare Hare\\n\\n📖 Srimad Bhagavatam — ${chapterLabel}","hashtags":"#SrimadBhagavatam #ISKCON #Krishna #HareKrishna #BuildIskcon #Canto${chapter.skandh}"}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude failed: ${res.status}`);
  const text = (await res.json()).content?.[0]?.text || "";
  const cleaned = text.replace(/^```(?:json)?\s*/gm, "").replace(/^```\s*$/gm, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON");
  return JSON.parse(m[0]);
}

async function tryGenerate(prompt: string, model: string, w: number, h: number, steps: number | null, seed?: number, signal?: AbortSignal, failures?: TogetherFailure[]): Promise<string | null> {
  // seed and steps go only to FLUX models; openai/gpt-image-2 has neither.
  // signal ends a re-render the visual check has abandoned. A rate-limited post
  // is re-sent by renderWithRetry before this attempt gives up, and why the
  // attempt failed goes into `failures` so the post's error can name the cause.
  const body = imagePayload(model, prompt, w, h, { seed, steps });
  const { b64, failure } = await renderWithRetry({
    request: () => fetch(TOGETHER_API, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_KEY}` },
      body: JSON.stringify(body),
      signal,
    }),
    // The body snippet is new here: a bare status never said whether Together
    // was busy or the prompt was refused.
    onFailure: (status, text, kind, willRetry) => { console.log(`${model}: ${status} ${text} (${kind}${willRetry ? ", retrying" : ""})`); },
    onError: (e) => { console.log(`${model} err: ${e}`); },
    signal,
  });
  if (!b64 && failure) failures?.push(failure);
  return b64;
}

// The compressed layout every prompt uses today: ART_STYLE + GENDER_RULES +
// ANACHRONISM_RULES alone are over 2000 chars, so the full layout never fits.
const COMPRESSED_STYLE_NEGATIVES = "NOT cartoon, NOT anime, NOT CGI, NOT 3D render, NOT digital illustration, NOT Pixar style, NOT Midjourney style, NOT plastic shiny skin, NOT photo-realistic";
const COMPRESSED_STYLE_POSITIVES = "museum-quality 19th-century Indian devotional OIL PAINTING on canvas, Raja Ravi Varma 1880-1900 aesthetic, VISIBLE oil-paint brushstrokes, warm saffron palette, soft golden-hour lighting";
const COMPRESSED_RULES = [GENDER_RULES.substring(0, 200), ANACHRONISM_RULES.substring(0, 540)];
const PERSONA_INJECT_PREFIX = " Characters: ";

// The same rule text split into numbered items ("2) ...", "3) ..."; each
// header stays with its rule 1), so a lack of room drops whole rules from the
// end instead of the whole block.
const COMPRESSED_RULE_ITEMS = COMPRESSED_RULES.flatMap(r => r.split(/\s+(?=[2-9]\)\s)/));

// The style and rule text after the scene. With an active configuration it is
// exactly the configuration's style_positives, style_negatives and extra_rules,
// joined the way the Image Playground joins them; with none, today's text. full
// is tried first and compressed when full does not fit; parts is what
// assemblePrompt trims when facts are added.
interface PromptTail {
  full: string;
  compressed: string;
  parts: Pick<PromptParts, "rules" | "stylePositives" | "styleNegatives" | "extraRules">;
}
const DEFAULT_TAIL: PromptTail = {
  full: `, ${ART_STYLE}. ${GENDER_RULES} ${ANACHRONISM_RULES}`,
  compressed: `, ${COMPRESSED_STYLE_POSITIVES}, ${COMPRESSED_STYLE_NEGATIVES}. ${COMPRESSED_RULES.join(" ")}`,
  parts: { rules: COMPRESSED_RULE_ITEMS, stylePositives: COMPRESSED_STYLE_POSITIVES, styleNegatives: COMPRESSED_STYLE_NEGATIVES },
};
function configTail(cfg: ActiveGenCfg): PromptTail {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const positives = text(cfg.style_positives);
  const negatives = text(cfg.style_negatives);
  const rules = text(cfg.extra_rules);
  const joined = `${positives ? `, ${positives}` : ""}${negatives ? `, ${negatives}` : ""}${rules ? `. ${rules}` : ""}`;
  return { full: joined, compressed: joined, parts: { stylePositives: positives, styleNegatives: negatives, extraRules: rules } };
}

// Cut at a word boundary to at most `limit` chars (a hard cut only when there is
// no space at all), without a trailing separator.
function cutAtWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  if (limit <= 0) return "";
  const cut = text.slice(0, limit);
  const end = /\s/.test(text.charAt(limit)) ? limit : cut.search(/\s\S*$/);
  return (end > 0 ? cut.slice(0, end) : cut).replace(/[\s,;:–—-]+$/, "");
}

// The facts an assembled prompt really carries, which is what the visual check
// verifies: assemblePrompt sends a repeated fact once and names each fact it
// leaves out for room as facts[i]. Neither was asked for, so neither is checked.
function factsKept(facts: unknown[], droppedParts: string[]): string[] {
  const dropped = new Set(droppedParts);
  const seen = new Set<string>();
  const out: string[] = [];
  facts.forEach((f, i) => {
    if (typeof f !== "string") return;
    const k = normalizeForMatch(sanitizeForImageModel(f));
    if (!k || seen.has(k)) return;
    seen.add(k);
    if (!dropped.has(`facts[${i}]`)) out.push(f);
  });
  return out;
}

// Assemble with the verified facts straight after the scene, within `limit`
// chars. Facts only get the room the scene leaves (whole facts, at most
// DEFAULT_FACTS_MAX chars), so they never cut the scene. Everything after them
// is kept or trimmed lowest priority first: style negatives, then style
// positives, then rule items, then personas. Returns null when no fact fits,
// and the caller then sends today's prompt unchanged.
function assembleWithFacts(parts: PromptParts, limit: number): FactsPrompt | null {
  const factCount = parts.facts?.length ?? 0;
  if (factCount === 0 || !(limit > 0)) return null;
  const sceneChars = sanitizeForImageModel(parts.scene).replace(/\s+/g, " ").trim().length;
  const factsMax = Math.min(DEFAULT_FACTS_MAX, limit - sceneChars - 2);
  if (factsMax <= 0) return null;
  const { prompt, report } = assemblePrompt(parts, { maxLen: limit, factsMax });
  const droppedFacts = report.droppedParts.filter(d => d.startsWith("facts[")).length;
  if (droppedFacts >= factCount) return null;
  if (report.truncatedScene || report.droppedParts.length > 0) {
    console.log(`[instagram-post] facts budget: limit=${limit} facts=${factCount - droppedFacts}/${factCount} truncatedScene=${report.truncatedScene} dropped=${report.droppedParts.join(",") || "none"}`);
  }
  return { prompt, factsInPrompt: factCount - droppedFacts, factsUsed: factsKept(parts.facts ?? [], report.droppedParts) };
}

// An assembled prompt, how many research facts it carries (for the
// SAFE_FALLBACK log line) and which ones (what the visual check verifies).
interface FactsPrompt { prompt: string; factsInPrompt: number; factsUsed: string[] }

// Facts path. The scene and persona text share the first sceneCap (1100) chars
// and the style and rule tail gets the rest. The facts' room comes out of that
// tail, not out of the scene: the scene and persona text keep exactly the share
// they have without facts, and the tail is trimmed lowest priority first.
function buildPromptWithFacts(prompt: string, personaText: string, facts: string[], maxLen: number, sceneCap: number, tail: PromptTail): FactsPrompt | null {
  if (typeof prompt !== "string" || !prompt.trim()) return null;
  const personaRoom = sceneCap - prompt.length - PERSONA_INJECT_PREFIX.length;
  const persona = personaText && personaRoom > 0 ? cutAtWord(personaText, personaRoom) : "";
  return assembleWithFacts({
    scene: cutAtWord(prompt, sceneCap),
    facts,
    personas: persona ? [persona] : [],
    ...tail.parts,
  }, maxLen - 20);
}

// The image a request stores, before any check. model is the model that drew it,
// safeFallback is true when the chain ended on SAFE_FALLBACK (a prompt that
// carries no facts), and checkFacts are the facts the prompt carries, the only
// ones checked. render(i) draws attempt i again through the same chain: the same
// prompt, the seed moved on by i.
interface RenderedImage {
  b64: string;
  model: string | null;
  safeFallback: boolean;
  checkFacts: string[];
  render: (attemptIndex: number, signal?: AbortSignal) => Promise<RenderOutput | null>;
}

async function generateImage(
  prompt: string,
  matchedPersonas: Persona[],
  varietySeed: number,
  facts: string[] = [],
): Promise<RenderedImage> {
  const personaText = matchedPersonas.map(p => p.short_description).join(". ");
  const personaInject = matchedPersonas.length > 0 ? PERSONA_INJECT_PREFIX + personaText : "";
  // Everything below comes from the active configuration when there is one.
  const __cfg = await getActiveGenConfig();
  // The configuration's prompt_max_len; 2000 (cut to 1980) with none.
  const __cfgMax = Math.floor(Number(__cfg?.prompt_max_len));
  const maxLen = Number.isFinite(__cfgMax) && __cfgMax > 0 ? __cfgMax : 2000;
  const sceneCap = Math.max(0, Math.min(1100, maxLen - 20));
  // The style and rule text after the scene: the configuration's, or with none today's.
  const tail = __cfg ? configTail(__cfg) : DEFAULT_TAIL;
  // Verified canonical details (e.g. four white horses) go straight after the
  // scene. Research never blocks generation: any failure here, or no fact that
  // fits, means today's prompt.
  let fullPrompt: string | null = null;
  // How many research facts fullPrompt carries; SAFE_FALLBACK logs them as dropped.
  let factsInPrompt = 0;
  // The facts fullPrompt carries, the only ones checked. Today's prompt has none.
  let checkFacts: string[] = [];
  if (facts.length > 0) {
    try {
      const withFacts = buildPromptWithFacts(prompt, matchedPersonas.length > 0 ? personaText : "", facts, maxLen, sceneCap, tail);
      fullPrompt = withFacts?.prompt ?? null;
      factsInPrompt = withFacts?.factsInPrompt ?? 0;
      checkFacts = withFacts?.factsUsed ?? [];
    } catch (e) {
      console.warn(`[instagram-post] fact assembly failed, using the prompt without facts: ${e}`);
      fullPrompt = null;
      factsInPrompt = 0;
      checkFacts = [];
    }
  }
  if (fullPrompt === null) {
    // With no configuration, today's prompt byte for byte.
    // Build order: scene prompt → persona injection → style → rules.
    fullPrompt = `${prompt}${personaInject}${tail.full}`;
    if (fullPrompt.length > maxLen) {
      fullPrompt = `${prompt}${personaInject}`.substring(0, sceneCap) + tail.compressed;
      if (fullPrompt.length > maxLen) fullPrompt = fullPrompt.substring(0, maxLen - 20);
    }
  }
  // Word-boundary anchors are load-bearing: without \b the alternation
  // rewrote substrings inside ordinary words ("warm" → "blessingm").
  const sanitized = fullPrompt.replace(/\b(battle|war|fight|weapon|sword|arrow|kill|death|blood|fire|burn|destroy|attack|strike|naked|nude)\b/gi, "blessing");
  const seed = varietySeed > 0 ? varietySeed : Math.floor(Math.random() * 1_000_000);
  const __m1 = __cfg?.model || "black-forest-labs/FLUX.2-pro";
  // The configuration's fallback model (its model when none is set); FLUX.1.1-pro
  // with no configuration. The SAFE_FALLBACK attempt renders with it too.
  const __m2 = __cfg ? (__cfg.fallback_model || __m1) : "black-forest-labs/FLUX.1.1-pro";
  const __steps = __cfg?.steps ?? null;
  const __size = instagramSizes(__cfg);
  // A re-render keeps the prompt and moves the seed on by its attempt index, so
  // attempt 0 sends exactly today's seed.
  const attemptsFor = (attemptIndex: number): FluxAttempt[] => [
    { model: __m1, prompt: sanitized, w: __size.w, h: __size.h, seed: seed + attemptIndex },
    { model: __m2, prompt: sanitized, w: __size.fw, h: __size.fh, seed: seed + attemptIndex },
    { model: __m2, prompt: SAFE_FALLBACK, w: __size.fw, h: __size.fh, safeFallback: true },
  ];
  // Why each attempt failed, for this post's chain only: every post has its own
  // generateImage call, so one post's rate limit never speaks for another's.
  const failures: TogetherFailure[] = [];
  // One render is the whole chain: same order and first-image-wins as before,
  // and the SAFE_FALLBACK attempt still logs how many research facts it drops.
  // A SAFE_FALLBACK image carries none of the facts, so it is kept unchecked
  // (reason safe_fallback) and never re-rendered or swapped in: the same prompt
  // would only be refused again.
  const render = async (attemptIndex: number, signal?: AbortSignal): Promise<RenderOutput | null> => {
    // A re-render never ends on SAFE_FALLBACK: that image carries none of the facts,
    // so the redo could never swap it in and would only pay for it.
    const attempts = attemptsFor(attemptIndex).filter(a => attemptIndex === 0 || !a.safeFallback);
    const used: { attempt: FluxAttempt | null } = { attempt: null };
    const b64 = await runFluxAttempts(attempts, a => {
      used.attempt = a;
      return tryGenerate(a.prompt, a.model, a.w, a.h, __steps, a.seed, signal, failures);
    }, { tag: "instagram-post", factsInPrompt, signal });
    if (!b64) return null;
    const safeFallback = used.attempt?.safeFallback === true;
    return { b64, model: used.attempt?.model ?? null, safeFallback, skipCheck: safeFallback ? "safe_fallback" : null };
  };
  const first = await render(0);
  if (!first) throw new Error(renderFailureMessage(failures, "All FLUX attempts failed"));
  return {
    b64: first.b64,
    model: typeof first.model === "string" ? first.model : null,
    safeFallback: first.safeFallback === true,
    checkFacts,
    render,
  };
}

// getSceneResearch never rejects; the catch is a second guard so research can
// never block generation. Any failure means no facts.
async function researchFacts(input: SceneResearchInput): Promise<string[]> {
  const r = await getSceneResearch(supabase, input).catch(() => null);
  const facts = Array.isArray(r?.facts) ? r.facts : [];
  console.log(`[instagram-post] research key=${input.key} status=${r?.status ?? "failed"} facts=${facts.length} ms=${r?.ms ?? -1}`);
  return facts;
}

// suffix names a background re-render's file ("-r1"): always a new file beside the
// stored one, never an overwrite of it.
async function uploadImage(b64: string, ch: ChapterInfo, suffix = ""): Promise<{ url: string; path: string }> {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const fn = `ig-canto${ch.skandh}-ch${ch.number}-${Date.now()}${suffix}.jpg`;
  const { error } = await supabase.storage.from("instagram-images").upload(fn, bytes, { contentType: "image/jpeg", upsert: !suffix });
  if (error) throw new Error(`Upload: ${error.message}`);
  return { url: supabase.storage.from("instagram-images").getPublicUrl(fn).data.publicUrl, path: fn };
}

// Never fails the caller: a file left behind only costs storage.
async function removeImage(path: string): Promise<void> {
  try {
    const { error } = await supabase.storage.from("instagram-images").remove([path]);
    if (error) console.warn(`[instagram-post] could not delete ${path}: ${error.message}`);
  } catch (e) {
    console.warn(`[instagram-post] could not delete ${path}: ${e}`);
  }
}

// The row's image_path: null when it has none, undefined when the row could not be read.
async function storedImagePath(id: number | string): Promise<string | null | undefined> {
  try {
    const { data, error } = await supabase.from("ig_pending_review").select("image_path").eq("id", id).maybeSingle();
    if (error) return undefined;
    return typeof data?.image_path === "string" ? data.image_path : null;
  } catch {
    return undefined;
  }
}

// The visual_check column is missing (migration not applied): PGRST204 or 42703.
function missingColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "PGRST204" || error.code === "42703" || /visual_check/.test(error.message ?? ""));
}

// Unattended generation. The post was stored after one render; this checks it
// after the response, in EdgeRuntime.waitUntil. While a fact is clearly
// contradicted the image is re-rendered, and a strictly better render replaces the
// stored one by a compare-and-swap: the row must still be pending and still hold
// the image this run stored, and unclaimed (reviewed_at null: approve-instagram-post
// stamps it before it publishes or deletes the image), so a reviewer's decision,
// an approval in progress or a regenerate is never overwritten. The run also asks that (stillCurrent) before each re-render and its
// check, so a post reviewed meanwhile costs no further render or check. A render
// that is not swapped in is deleted; the replaced file is kept.
// approve-instagram-post claims the post (stamps reviewed_at) before it publishes
// its image_url or, on reject, marks it rejected and only then deletes the file, so
// no swap lands once either has started. The row's prompt, caption and every other
// field stay as inserted. Call it before the handler returns.
function redoAfterResponse(o: {
  id: number | string;
  chapter: ChapterInfo;
  image: RenderedImage;
  stored: { url: string; path: string };
  record: VisualCheckRecord;
  invocationStart: number;
}): void {
  const tag = `[instagram-post] #${o.id}`;
  // The file the row holds: the compare-and-swap target, moved on by each swap.
  let current = o.stored;
  const flagged = (record: VisualCheckRecord, image?: RenderOutput) => ({ ...record, safe_fallback: image?.safeFallback === true });

  const swap = async (attempt: IndexedRender, record: VisualCheckRecord): Promise<boolean> => {
    let next: { url: string; path: string };
    try {
      next = await uploadImage(attempt.b64, o.chapter, `-r${attempt.index}`);
    } catch (e) {
      console.warn(`${tag} re-render ${attempt.index} not stored: ${e}`);
      return false;
    }
    let result: { data: unknown; error: { message: string } | null };
    try {
      result = await supabase
        .from("ig_pending_review")
        .update({ image_url: next.url, image_path: next.path, visual_check: flagged(record, attempt) })
        .eq("id", o.id)
        .eq("status", "pending")
        .eq("image_path", current.path)
        .is("reviewed_at", null)
        .select("id");
    } catch (e) {
      result = { data: null, error: { message: String(e) } };
    }
    let swapped = !result.error && Array.isArray(result.data) && result.data.length === 1;
    if (result.error) {
      // An error can hide an update that was applied (a lost response): ask the
      // row before deleting a file it may hold.
      const held = await storedImagePath(o.id);
      if (held === undefined) {
        console.warn(`${tag} re-render ${attempt.index}: update failed (${result.error.message}) and the row could not be read; both files kept`);
        return false;
      }
      swapped = held === next.path;
    }
    if (swapped) {
      const replaced = current.path;
      current = next;
      // Kept, not deleted: an approval that read the post before this swap may
      // still be publishing the replaced file.
      console.log(`${tag} re-render ${attempt.index} replaced ${replaced} with ${next.path}; ${replaced} is kept in storage`);
      return true;
    }
    console.log(`${tag} re-render ${attempt.index} not swapped in: ${result.error ? result.error.message : "the post is no longer pending with the stored image"}`);
    await removeImage(next.path);
    return false;
  };

  // Whether the post is still pending with the image this run stored. A read that
  // fails counts as still current: the swap's compare-and-swap still guards it.
  const stillCurrent = async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from("ig_pending_review")
      .select("id")
      .eq("id", o.id)
      .eq("status", "pending")
      .eq("image_path", current.path)
      .is("reviewed_at", null);
    if (error) {
      console.warn(`${tag} could not read the post (${error.message}); carrying on`);
      return true;
    }
    return Array.isArray(data) && data.length === 1;
  };

  // The final record, for whichever image the row holds. Zero rows (the post
  // moved on) or a missing visual_check column is logged and ignored.
  const writeRecord = async (record: VisualCheckRecord, stored?: IndexedRender): Promise<boolean> => {
    const { data, error } = await supabase
      .from("ig_pending_review")
      .update({ visual_check: flagged(record, stored) })
      .eq("id", o.id)
      .eq("image_path", current.path)
      .select("id");
    if (error) {
      console.warn(`${tag} visual_check not stored: ${missingColumn(error) ? "the visual_check column is missing" : error.message}`);
      return false;
    }
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`${tag} visual_check not stored: the post no longer holds ${current.path}`);
      return false;
    }
    return true;
  };

  runInBackground(redoInBackground({
    first: { b64: o.image.b64, model: o.image.model, safeFallback: o.image.safeFallback },
    facts: o.image.checkFacts,
    render: o.image.render,
    maxAttempts: CHECK_MAX_ATTEMPTS,
    deadlineAt: backgroundDeadline(o.invocationStart),
    swap,
    stillCurrent,
    writeRecord,
    startedAt: o.record.started_at ?? null,
    tag: `instagram-post #${o.id}`,
  }));
}

// invocationStart is when the handler started: the background check and its
// re-renders start nothing 360s after it, or after the worker started when that
// was earlier (backgroundDeadline).
async function generateForChapter(chapterOverride: number | null, invocationStart: number = Date.now()): Promise<Record<string, unknown>> {
  const { chapter, text } = chapterOverride !== null
    ? await loadChapterByGlobalNumber(chapterOverride)
    : await getNextChapter();
  console.log(`Canto ${chapter.skandh}, Ch ${chapter.number} (g${chapter.globalNumber})`);

  const { count: rejectCount } = await supabase
    .from("ig_pending_review")
    .select("id", { count: "exact", head: true })
    .eq("chapter_global_number", chapter.globalNumber)
    .eq("status", "rejected");
  if ((rejectCount || 0) >= SOFT_SAFETY_FLOOR) {
    return { success: false, skipped: true, reason: `Chapter ${chapter.globalNumber} rejected ${rejectCount}× — soft safety floor hit (${SOFT_SAFETY_FLOOR}). This is unusual; check the chapter content / scene extraction.`, chapter: chapter.globalNumber };
  }

  const varietySeed = Date.now() % 1_000_000;
  const allPersonas = await loadPersonas();

  const sceneRow = await loadChapterScenes(chapter.globalNumber);
  let imagePrompt: string;
  let caption: string;
  let hashtags: string;
  let usedSceneInfo: { index: number; title: string; cycleReset?: boolean } | null = null;
  let matched: Persona[] = [];
  let characterNames: string[] = [];

  const picked = sceneRow ? pickScene(sceneRow.scenes, sceneRow.usedIndexes, sceneRow.rejectedIndexes) : null;
  if (sceneRow && picked) {
    const { scene, index, cycleReset } = picked;
    console.log(`Using pre-extracted scene #${index} (rank ${scene.rank}): "${scene.title}"${cycleReset ? " [cycle reset]" : ""}`);
    imagePrompt = scene.image_prompt;
    characterNames = scene.characters || [];
    matched = matchPersonas(scene.characters || [], allPersonas);
    const cap = await buildCaptionForScene(chapter, scene);
    caption = cap.caption;
    hashtags = cap.hashtags;
    usedSceneInfo = { index, title: scene.title, cycleReset };
  } else {
    console.log(sceneRow
      ? `Every extracted scene was rejected — falling back to inline Claude generation`
      : `No scenes in DB — falling back to inline Claude generation`);
    const detected = await detectCharacterNames(chapter.title, text);
    characterNames = detected;
    matched = matchPersonas(detected, allPersonas);
    const { data: prevRejected } = await supabase
      .from("ig_pending_review")
      .select("caption")
      .eq("chapter_global_number", chapter.globalNumber)
      .eq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(3);
    const prevPrompts = (prevRejected || []).map((r) => r.caption || "").filter(Boolean);
    const inline = await generateScenePromptInline(chapter, text, matched, varietySeed, prevPrompts);
    // Claude returns imagePrompt. Reading .prompt (never set) sent the text
    // "undefined" as the scene of every inline image prompt.
    imagePrompt = inlineImagePrompt(inline, chapter.title);
    caption = inline.caption;
    hashtags = inline.hashtags;
  }

  // Verified, sourced visual facts for this scene. A pre-extracted scene shares
  // its row with the Bhagavatam cover for the same scene; the inline fallback
  // shares bhagavatam:g<N>:inline with bulk-generate-images. Research never
  // throws; with no facts the image prompt is built exactly as before.
  const facts = await researchFacts({
    key: usedSceneInfo
      ? sceneKey("bhagavatam", chapter.globalNumber, usedSceneInfo.index)
      : inlineKey("bhagavatam", chapter.globalNumber),
    book: "bhagavatam",
    sceneText: imagePrompt,
    title: usedSceneInfo?.title ?? null,
    characters: characterNames,
  });

  // The Mahājana lookup and the verse (a Haiku call) run alongside the image, not
  // after it: everything before the post is stored must fit before the request
  // is cut at 150s.
  const mahajanPending = resolveMahajanKey(characterNames, matched);
  // Awaited below, where a failure still fails the post; this only keeps it from
  // counting as unhandled while the image renders.
  mahajanPending.catch(() => {});
  const versePending = extractVerse(chapter.title, text, usedSceneInfo?.title);

  const image = await generateImage(imagePrompt, matched, varietySeed, facts);
  const { url, path } = await uploadImage(image.b64, chapter);

  // Attribute to the Mahājana who speaks in / appears in this chapter (fail-soft null).
  const mahajanKey = await mahajanPending;
  console.log(`Mahājana attribution: ${mahajanKey || "(none)"} — characters: ${characterNames.join(", ") || "?"}`);

  // Anchor Sanskrit śloka + Hindi for the Darshan card (fail-soft null).
  const verse = await versePending;
  console.log(`Verse: ${verse.sanskrit ? "extracted" : "(none)"}`);

  // Stored with the post before any check: skipped when nothing can be checked
  // (no fact in the prompt, SAFE_FALLBACK, check off), otherwise "running" until
  // the background check writes its result. safe_fallback says the image came
  // from SAFE_FALLBACK.
  const visualCheck = {
    ...initialRecord({ factsUsed: image.checkFacts, safeFallback: image.safeFallback, imageModel: image.model, startedAt: Date.now() }),
    safe_fallback: image.safeFallback,
  };
  const pendingRow = {
    chapter_global_number: chapter.globalNumber,
    chapter_canto: chapter.skandh,
    chapter_in_canto: chapter.number,
    chapter_title: chapter.title,
    image_url: url,
    image_path: path,
    caption,
    hashtags,
    status: "pending",
    mahajan_key: mahajanKey,
    shlok_sanskrit: verse.sanskrit,
    anuvad_hindi: verse.hindi,
  };
  let { data: inserted, error: insErr } = await supabase
    .from("ig_pending_review")
    .insert({ ...pendingRow, visual_check: visualCheck })
    .select("id")
    .single();
  let recordStored = true;
  if (insErr && /visual_check/.test(insErr.message)) {
    // The visual_check column is missing (migration not applied yet): keep the
    // post and its paid renders, without the record.
    console.warn(`[instagram-post] insert with visual_check failed (${insErr.message}); saving without it`);
    recordStored = false;
    ({ data: inserted, error: insErr } = await supabase.from("ig_pending_review").insert(pendingRow).select("id").single());
  }
  if (insErr) throw new Error(`Pending insert: ${insErr.message}`);

  // The post exists now, so its check starts here, before the response; the
  // check and any re-render run after it. With no visual_check column there is
  // nowhere to keep a result, so nothing is started.
  if (needsBackgroundCheck(visualCheck)) {
    const id = inserted?.id;
    if (recordStored && (typeof id === "number" || typeof id === "string")) {
      redoAfterResponse({ id, chapter, image, stored: { url, path }, record: visualCheck, invocationStart });
    } else {
      console.warn(`[instagram-post] visual check not started: ${recordStored ? "no review row id" : "the visual_check column is missing"}`);
    }
  }

  if (usedSceneInfo && sceneRow) {
    if (usedSceneInfo.cycleReset) {
      await resetSceneCycle(chapter.globalNumber, usedSceneInfo.index);
    } else {
      await markSceneUsed(chapter.globalNumber, usedSceneInfo.index, sceneRow.usedIndexes);
    }
  }

  if (chapterOverride === null) {
    const { data: cs } = await supabase.from("ig_cron_state").select("total_posted").single();
    await supabase.from("ig_cron_state").update({
      next_chapter: chapter.globalNumber + 1,
      last_posted_at: new Date().toISOString(),
      last_chapter_posted: chapter.globalNumber,
      total_posted: (cs?.total_posted || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
  }

  return {
    success: true,
    canto: chapter.skandh,
    chapterInCanto: chapter.number,
    globalNumber: chapter.globalNumber,
    title: chapter.title,
    imageUrl: url,
    pendingReviewId: inserted?.id,
    status: "pending_review",
    personasUsed: matched.map(p => p.key),
    usedScene: usedSceneInfo,
    sceneSource: usedSceneInfo ? "pre-extracted" : "inline-claude",
    rejectionsSoFar: rejectCount || 0,
    visualCheck,
  };
}

// ── One-time / on-demand backfill of verses onto existing approved posts ──────
// So the Darshan card shows a śloka on already-published posts, not only new
// daily ones. Scans the most recent approved posts missing a verse.
async function backfillVerses(limit: number): Promise<{ scanned: number; updated: number; errors: number }> {
  const n = Math.max(1, Math.min(limit || 20, 40));
  const { data: rows } = await supabase
    .from("ig_pending_review")
    .select("id, chapter_global_number, chapter_title")
    .eq("status", "approved")
    .is("shlok_sanskrit", null)
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .limit(n);
  let updated = 0, errors = 0;
  for (const row of rows || []) {
    try {
      const { chapter, text } = await loadChapterByGlobalNumber(row.chapter_global_number);
      const verse = await extractVerse(chapter.title || row.chapter_title || "", text);
      if (verse.sanskrit || verse.hindi) {
        await supabase.from("ig_pending_review").update({ shlok_sanskrit: verse.sanskrit, anuvad_hindi: verse.hindi }).eq("id", row.id);
        updated++;
      }
    } catch (e) { errors++; console.error(`backfill verse ${row.id}: ${e}`); }
  }
  return { scanned: (rows || []).length, updated, errors };
}

Deno.serve(async (req: Request) => {
  const invocationStart = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "content-type, authorization, apikey" } });
  }
  if (req.method !== "POST" && req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  let chapterOverride: number | null = null;
  let body: Record<string, unknown> = {};
  if (req.method === "POST") body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // On-demand verse backfill — handled here and RETURNED, never falls through to generation.
  if (body?.action === "backfill_verses") {
    try {
      const res = await backfillVerses(Number(body?.limit) || 20);
      return new Response(JSON.stringify({ success: true, backfill: res }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  try {
    const v = body?.chapter_global_number;
    if (typeof v === "number" && v > 0) chapterOverride = v;
  } catch { /* no body */ }

  try {
    const result = await generateForChapter(chapterOverride, invocationStart);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
