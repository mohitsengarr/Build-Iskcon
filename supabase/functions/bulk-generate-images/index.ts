import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSceneResearch, type SceneResearchInput } from "../_shared/sceneResearch.ts";
import { imagePayload, renderWithVisualCheck, type VisualCheckRecord } from "../_shared/visualCheck.ts";
import { type FluxAttempt, runFluxAttempts } from "./fluxAttempts.ts";
import {
  assemblePrompt,
  DEFAULT_FACTS_MAX,
  inlineKey,
  normalizeForMatch,
  type PromptParts,
  sanitizeForImageModel,
} from "../_shared/sceneResearchCore.ts";

const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const BUILDISKCON = "https://buildiskcon.com";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOGETHER_KEY = Deno.env.get("TOGETHER_API_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Visual check (_shared/visualCheck.ts): Claude vision checks each render against
// the research facts and re-renders on a clear contradiction. Sample mode is a
// sync request cut at 150s: checks and re-renders only start before request
// start + 130s, with up to two re-renders. Bulk mode runs in waitUntil, which
// shares the worker's wall clock: every chapter of the run shares one deadline
// of invocation start + 360s, with at most one re-render each.
const SYNC_CHECK_DEADLINE_MS = 130_000;
const SYNC_MAX_ATTEMPTS = 3;
const BULK_CHECK_DEADLINE_MS = 360_000;
const BULK_MAX_ATTEMPTS = 2;

const MASCULINITY_RULE = "ALL adult male characters MUST look distinctly MASCULINE — NEVER androgynous, NEVER feminine, NEVER soft-featured. Male sages: elder MEN with thick grey/white beards reaching chest, weathered masculine face, sacred thread across bare chest. Male kings: muscular MEN with broad chests, strong square jaws, groomed dark beards. Male youths: clean-shaven athletic MEN with defined jawline, broad shoulders. Female characters keep feminine features but male characters MUST look VISIBLY DIFFERENT.";

const ANACHRONISM_RULES = [
  "ABSOLUTE ANACHRONISM RULES (Vedic/Puranic era — NEVER VIOLATE):",
  "1) NO eyewear of ANY kind — no spectacles, no eyeglasses, no reading glasses, no monocles, no sunglasses, no goggles. Eyes and faces are bare. Sages, scholars and elders read palm-leaf manuscripts with their naked eyes.",
  "2) NO modern clothing — no shirts, no trousers, no buttons, no zippers, no neckties, no western collars, no leather shoes, no sneakers. Only dhotis, saris, uttariyas, angavastrams, shawls, traditional jewelry, sandals or bare feet.",
  "3) NO timepieces or modern technology — NO watch, NO wristwatch, NO smartwatch, NO clock, NO leather wrist strap, NO metal watch band, NO digital display, NO fitness tracker. ALL WRISTS are either BARE or wear only TRADITIONAL bangles (kada, kangan, kankan). A watch on a wrist is FORBIDDEN. Also no pens, no paper books, no printed text, no electrical anything. Only palm-leaf manuscripts, brass vessels, oil lamps, conches.",
  "4) NO modern grooming — NO fade haircuts, NO undercuts, NO buzz cuts, NO pompadours, NO modern barber cuts, NO sharp angular barber-shaped beards, NO hipster goatees, NO designer stubble, NO sculpted beard edges, NO fade lines along the jaw, NO patchy bro-beard. Men are EITHER fully CLEAN-SHAVEN with a smooth jaw (no stubble at all) OR have a FULL NATURAL BEARD that follows the organic jawline — long flowing white/grey for sages and rishis, thick natural black/brown for kings and warriors. Beard edges are SOFT and NATURAL, never razor-sharp. Hair is long and flowing, or tied in a traditional topknot (shikha), or braided — never a modern haircut.",
  "5) NO post-Vedic objects (firearms, mechanical wheels with metal spokes, glass windows, brick architecture). Wooden/stone hermitage, thatched huts, ancient stone temples only.",
].join(" ");


const CHARACTER_LIBRARY = `
- Lord Krishna: young MAN aged 20-25, deep blue skin, masculine jawline, peacock feather crown, yellow silk dhoti, broad muscular chest, bamboo flute
- Lord Vishnu: four-armed divine MAN, dark blue skin, masculine bearing, golden crown, conch, discus, mace, lotus
- Sages/Rishis: elderly MEN with thick grey/white beards reaching chest, sacred thread across bare masculine chest, saffron dhoti, palm-leaf manuscripts
- Kings: muscular bearded MEN in royal saffron-and-gold attire, golden crowns, masculine warrior physique
- Princes/youths: clean-shaven athletic young MEN with defined jawline, broad shoulders, saffron or white dhoti
- Goddesses: graceful divine FEMALES in silk saris, gentle feminine face, ornate gold jewelry
- Devotee women: graceful FEMALES in colorful silk saris, traditional jewelry
`;

const ART_STYLE = [
  "museum-quality 19th-century Indian devotional OIL PAINTING on canvas",
  "Raja Ravi Varma 1880-1900 aesthetic, Bombay-school realism — M.V. Dhurandhar / Hemen Mazumdar lineage",
  "VISIBLE oil-paint brushstrokes and canvas weave texture",
  "matte hand-painted finish, oil glaze layers, impasto highlights on faces and ornaments",
  "warm earthy palette — saffron, ochre, burnt sienna, amber, deep crimson",
  "soft golden-hour studio lighting from a single warm source, mild chiaroscuro shadows",
  "ancient Vedic setting with palm-leaf manuscripts, brass vessels, oil lamps, stone or thatched architecture",
  "NOT photo-realistic NOT photographic NOT 3D render NOT CGI NOT octane NOT unreal engine",
  "NOT cartoon NOT anime NOT manga NOT chibi NOT comic-book NOT cel-shaded NOT line art",
  "NOT digital illustration NOT vector art NOT flat-color illustrator NOT airbrushed smooth-render",
  "NOT plastic shiny skin NOT glossy CGI surfaces NOT video-game render NOT Pixar style NOT Disney style",
  "NOT modern fantasy concept art NOT Artstation render NOT trending Midjourney style",
].join(", ");

const SAFE_FALLBACK = `A wide oil-painting scene of an elderly bearded MALE sage with thick white beard and sacred thread, seated in a forest hermitage teaching devotees, golden afternoon sunlight, manuscripts and brass vessels. ${ART_STYLE.substring(0, 600)}. ${MASCULINITY_RULE} ${ANACHRONISM_RULES}`;

interface ChapterInfo { globalNumber: number; number: number; skandh: number; title: string; batchNumber: number; pageNumber: number; }

async function getChapterText(chapter: ChapterInfo): Promise<string> {
  const r = await fetch(`${BUILDISKCON}/api/bhagwatham/batch/${chapter.batchNumber}`);
  if (!r.ok) return chapter.title;
  let text = ""; for (const p of (await r.json()).pages || []) text += (p.text || "") + "\n";
  return text.substring(0, 3000);
}

async function generateScenePrompt(chapter: ChapterInfo, content: string) {
  const chapterLabel = `Canto ${chapter.skandh}, Chapter ${chapter.number}`;
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1200,
      messages: [{ role: "user", content: `Create Instagram post for Srimad Bhagavatam ${chapterLabel}.

READ the content and identify the ACTUAL central character(s) of THIS chapter. DO NOT default to Krishna unless Krishna is actually in this chapter.

USE these characters where they appear:${CHARACTER_LIBRARY}

RULES: WIDE scene, classical Raja-Ravi-Varma OIL PAINTING with visible brushstrokes, PEACEFUL only. Always label MALE or FEMALE for every character. Vedic/Puranic era — NO glasses, NO modern clothing, NO modern technology, NO watches on any wrist (wrists are bare or only have traditional bangles). Medium: museum-quality 19th-century oil painting, NOT cartoon/anime/CGI/digital-illustration/Pixar/Midjourney style. Caption in English only.

Hindi title: ${chapter.title}
Content: ${content.substring(0, 1800)}

Return JSON only (no fences):
{"imagePrompt":"Wide shot of [scene from chapter]. Central: [character with MALE/FEMALE label]. Others: [characters with labels and actions]. Setting: [landscape]. Soft golden light. Classical oil painting.","caption":"📖 Srimad Bhagavatam — ${chapterLabel}\\n\\n[3-4 line English summary of actual story]\\n\\n🙏 Hare Krishna Hare Krishna Krishna Krishna Hare Hare\\nHare Rama Hare Rama Rama Rama Hare Hare","hashtags":"#SrimadBhagavatam #ISKCON #Krishna #HareKrishna #SrilaPrabhupada #BuildIskcon #Canto${chapter.skandh} #BhaktiYoga #KrishnaConsciousness"}` }] })
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const text = (await res.json()).content?.[0]?.text || "";
  const cleaned = text.replace(/^```(?:json)?\s*/gm, "").replace(/^```\s*$/gm, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON");
  return JSON.parse(m[0]) as { imagePrompt: string; caption: string; hashtags: string };
}

// Per-attempt request timeout (no hang) + surfaced HTTP status, so a slow or
// rejected FLUX call fails fast and is visible in the function logs instead of
// silently collapsing into "All FLUX attempts failed".
async function tryGenerate(prompt: string, model: string, w: number, h: number, seed?: number, signal?: AbortSignal): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  // A re-render the visual check has abandoned aborts this request too.
  const stop = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  else signal?.addEventListener("abort", stop);
  try {
    const res = await fetch(TOGETHER_API, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_KEY}` },
      // seed goes only to FLUX models, and only on a re-render (see generateImage).
      body: JSON.stringify(imagePayload(model, prompt, w, h, { seed })),
      signal: ctrl.signal,
    });
    if (!res.ok) { console.log(`[bulk-generate-images] ${model}: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`); return null; }
    return (await res.json()).data?.[0]?.b64_json || null;
  } catch (e) { console.log(`[bulk-generate-images] ${model} err: ${e}`); return null; }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", stop); }
}

// The active configuration approved in the Image Playground (/image-playground).
// Fetched once per run; if the table is empty or unreachable we fall back to the
// hard-coded values below, so generation never depends on it being present.
interface ActiveGenConfig {
  model: string; width: number; height: number; steps: number | null;
  style_positives: string; style_negatives: string; extra_rules: string | null;
  prompt_max_len: number;
  fallback_model: string | null; fallback_width: number | null; fallback_height: number | null;
}
let activeCfgCache: ActiveGenConfig | null | undefined;
async function getActiveConfig(): Promise<ActiveGenConfig | null> {
  if (activeCfgCache !== undefined) return activeCfgCache;
  try {
    const { data } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
    activeCfgCache = (data as ActiveGenConfig) || null;
  } catch { activeCfgCache = null; }
  return activeCfgCache;
}

// The compressed layout the no-config prompt uses today: ART_STYLE +
// MASCULINITY_RULE + ANACHRONISM_RULES alone are over 2000 chars.
const COMPRESSED_STYLE_POSITIVES = "museum-quality 19th-century Indian devotional OIL PAINTING on canvas, Raja Ravi Varma 1880-1900 aesthetic, VISIBLE oil-paint brushstrokes, warm saffron palette, soft golden-hour lighting";
const COMPRESSED_STYLE_NEGATIVES = "NOT cartoon, NOT anime, NOT CGI, NOT 3D render, NOT digital illustration, NOT Pixar style, NOT Midjourney style, NOT plastic shiny skin, NOT photo-realistic";
const COMPRESSED_RULES = [MASCULINITY_RULE.substring(0, 180), ANACHRONISM_RULES.substring(0, 540)];
const COMPRESSED_SCENE_MAX = 1050;
const COMPRESSED_CUT_LEN = 1980;

// The same rule text split into numbered items ("2) ...", "3) ..."; each
// header stays with its rule 1), so a lack of room drops whole rules from the
// end instead of the whole block.
const COMPRESSED_RULE_ITEMS = COMPRESSED_RULES.flatMap(r => r.split(/\s+(?=[2-9]\)\s)/));

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
// positives, then rule items. Returns null when there are no facts or none
// fits, and the caller then builds today's prompt unchanged.
function assembleWithFacts(parts: PromptParts, limit: number): FactsPrompt | null {
  const factCount = parts.facts?.length ?? 0;
  if (factCount === 0 || !(limit > 0)) return null;
  if (typeof parts.scene !== "string" || !parts.scene.trim()) return null;
  const sceneChars = sanitizeForImageModel(parts.scene).replace(/\s+/g, " ").trim().length;
  const factsMax = Math.min(DEFAULT_FACTS_MAX, limit - sceneChars - 2);
  if (factsMax <= 0) return null;
  const { prompt, report } = assemblePrompt(parts, { maxLen: limit, factsMax });
  const droppedFacts = report.droppedParts.filter(d => d.startsWith("facts[")).length;
  if (droppedFacts >= factCount) return null;
  if (report.truncatedScene || report.droppedParts.length > 0) {
    console.log(`[bulk-generate-images] facts budget: limit=${limit} facts=${factCount - droppedFacts}/${factCount} truncatedScene=${report.truncatedScene} dropped=${report.droppedParts.join(",") || "none"}`);
  }
  return { prompt, factsInPrompt: factCount - droppedFacts, factsUsed: factsKept(parts.facts ?? [], report.droppedParts) };
}

// An assembled prompt, how many research facts it carries (for the
// SAFE_FALLBACK log line) and which ones (what the visual check verifies).
interface FactsPrompt { prompt: string; factsInPrompt: number; factsUsed: string[] }

// Research never blocks generation: an assembly failure means today's prompt.
function tryAssembleWithFacts(build: () => FactsPrompt | null): FactsPrompt | null {
  try {
    return build();
  } catch (e) {
    console.warn(`[bulk-generate-images] fact assembly failed, using the prompt without facts: ${e}`);
    return null;
  }
}

// The sanitizer this function has always applied: a bare alternation, so it also
// rewrites inside words ("warm" -> "blessingm", "warriors" -> "blessingriors",
// "fire" -> "blessing"). Kept byte for byte, so a prompt with no research facts is
// exactly today's. Moving to whole words is a separate change to approve.
const LEGACY_SANITIZE_RE = /battle|war|fight|weapon|sword|arrow|kill|death|blood|fire|burn|destroy|attack|strike|naked|nude/gi;
function legacySanitize(text: string): string {
  return text.replace(LEGACY_SANITIZE_RE, "blessing");
}

// The chosen image and the visual_check record stored with it. safe_fallback is
// true when the chain ended on SAFE_FALLBACK, a prompt that carries no facts.
interface CheckedImage { b64: string; visualCheck: VisualCheckRecord & { safe_fallback: boolean } }
interface CheckBudget { deadlineAt: number; maxAttempts: number; tag: string }

async function generateImage(
  prompt: string,
  facts: string[] = [],
  check: CheckBudget = { deadlineAt: Date.now() + SYNC_CHECK_DEADLINE_MS, maxAttempts: SYNC_MAX_ATTEMPTS, tag: "bulk-generate-images" },
): Promise<CheckedImage> {
  const cfg = await getActiveConfig();
  let fullPrompt: string;
  // How many research facts fullPrompt carries; SAFE_FALLBACK logs them as dropped.
  let factsInPrompt = 0;
  // The facts fullPrompt carries, the only ones checked. Today's prompt has none.
  let checkFacts: string[] = [];
  if (cfg) {
    // Assemble exactly as the playground previews it, with canonical details
    // straight after the scene. The existing limit is unchanged; facts only use
    // the room the scene leaves, and the appended style is still cut first.
    // With facts, every non-fact part gets legacySanitize before it is joined.
    const max = cfg.prompt_max_len || 2000;
    const withFacts = facts.length > 0 && typeof prompt === "string"
      ? tryAssembleWithFacts(() => assembleWithFacts({ scene: legacySanitize(prompt), facts }, max))
      : null;
    const part = (s: unknown) => (withFacts ? legacySanitize(String(s)) : s);
    fullPrompt = withFacts?.prompt ?? prompt;
    factsInPrompt = withFacts?.factsInPrompt ?? 0;
    checkFacts = withFacts?.factsUsed ?? [];
    if (cfg.style_positives) fullPrompt += `, ${part(cfg.style_positives)}`;
    if (cfg.style_negatives) fullPrompt += `, ${part(cfg.style_negatives)}`;
    if (cfg.extra_rules) fullPrompt += `. ${part(cfg.extra_rules)}`;
    if (fullPrompt.length > max) fullPrompt = fullPrompt.slice(0, max);
  } else {
    // With facts, the scene keeps today's 1050-char share and the facts' room
    // comes out of the style and rule tail (style negatives, then style
    // positives, then rules from the end). No facts, or none fits: today's prompt.
    // Every non-fact part gets legacySanitize before it is measured.
    const withFacts = facts.length > 0 && typeof prompt === "string"
      ? tryAssembleWithFacts(() => assembleWithFacts({
          scene: legacySanitize(cutAtWord(prompt, COMPRESSED_SCENE_MAX)),
          facts,
          rules: COMPRESSED_RULE_ITEMS.map((r) => legacySanitize(r)),
          stylePositives: legacySanitize(COMPRESSED_STYLE_POSITIVES),
          styleNegatives: legacySanitize(COMPRESSED_STYLE_NEGATIVES),
        }, COMPRESSED_CUT_LEN))
      : null;
    if (withFacts !== null) {
      fullPrompt = withFacts.prompt;
      factsInPrompt = withFacts.factsInPrompt;
      checkFacts = withFacts.factsUsed;
    } else {
      fullPrompt = `${prompt}, ${ART_STYLE}. ${MASCULINITY_RULE} ${ANACHRONISM_RULES}`;
      if (fullPrompt.length > 2000) {
        fullPrompt = `${prompt}`.substring(0, COMPRESSED_SCENE_MAX) + `, ${COMPRESSED_STYLE_POSITIVES}, ${COMPRESSED_STYLE_NEGATIVES}. ${COMPRESSED_RULES.join(" ")}`;
        if (fullPrompt.length > 2000) fullPrompt = fullPrompt.substring(0, COMPRESSED_CUT_LEN);
      }
    }
  }
  // No facts in the prompt: today's text through today's sanitizer, byte for
  // byte. With facts, every other part was already sanitized that way, and the
  // facts (verified to hold no sanitizer word) are not rewritten inside words.
  const sanitized = factsInPrompt > 0 ? fullPrompt : legacySanitize(fullPrompt);
  // This function has never sent a seed, so attempt 0 still sends none. A
  // re-render keeps the prompt and sends a new random seed to FLUX, so it draws
  // a different picture (gpt-image-2 gets no seed and varies on its own).
  const attemptsFor = (attemptIndex: number): FluxAttempt[] => {
    const seed = attemptIndex > 0 ? Math.floor(Math.random() * 1_000_000) : undefined;
    return cfg
      ? [
          { model: cfg.model, prompt: sanitized, w: cfg.width, h: cfg.height, seed },
          { model: cfg.fallback_model || cfg.model, prompt: sanitized, w: cfg.fallback_width || cfg.width, h: cfg.fallback_height || cfg.height, seed },
          { model: cfg.fallback_model || cfg.model, prompt: SAFE_FALLBACK, w: cfg.fallback_width || cfg.width, h: cfg.fallback_height || cfg.height, safeFallback: true },
        ]
      : [
          { model: "black-forest-labs/FLUX.2-pro", prompt: sanitized, w: 1088, h: 1344, seed },
          { model: "black-forest-labs/FLUX.1.1-pro", prompt: sanitized, w: 768, h: 1024, seed },
          { model: "black-forest-labs/FLUX.1.1-pro", prompt: SAFE_FALLBACK, w: 768, h: 1024, safeFallback: true },
        ];
  };
  // Each render is the whole chain: same order and first-image-wins as before,
  // and the SAFE_FALLBACK attempt still logs how many research facts it drops.
  // A SAFE_FALLBACK image carries none of the facts, so it is kept unchecked
  // (reason safe_fallback) and never re-rendered: the same prompt would only be
  // refused again. The record says it was SAFE_FALLBACK.
  const checked = await renderWithVisualCheck({
    render: async (attemptIndex, signal) => {
      const attempts = attemptsFor(attemptIndex);
      const used: { attempt: FluxAttempt | null } = { attempt: null };
      const b64 = await runFluxAttempts(attempts, a => {
        used.attempt = a;
        return tryGenerate(a.prompt, a.model, a.w, a.h, a.seed, signal);
      }, { tag: "bulk-generate-images", factsInPrompt, signal });
      if (!b64) return null;
      const safeFallback = used.attempt?.safeFallback === true;
      return { b64, model: used.attempt?.model ?? null, safeFallback, skipCheck: safeFallback ? "safe_fallback" : null };
    },
    facts: checkFacts,
    maxAttempts: check.maxAttempts,
    deadlineAt: check.deadlineAt,
    tag: check.tag,
  });
  if (checked) return { b64: checked.b64, visualCheck: { ...checked.record, safe_fallback: checked.safeFallback === true } };
  throw new Error("All FLUX attempts failed");
}

// getSceneResearch never rejects; the catch is a second guard so research can
// never fail a chapter. Any failure means no facts. networkResearch=false (bulk
// mode) serves a fresh cached row plus canon and never calls Firecrawl or Claude
// or writes the cache: a bulk run only picks chapters with no review row, so
// every one of up to 50 chapters would otherwise be a paid cache miss.
async function researchFacts(input: SceneResearchInput, networkResearch: boolean): Promise<string[]> {
  const pending = networkResearch
    ? getSceneResearch(supabase, input)
    : getSceneResearch(supabase, input, { allowNetwork: false });
  const r = await pending.catch(() => null);
  const facts = Array.isArray(r?.facts) ? r.facts : [];
  console.log(`[bulk-generate-images] research key=${input.key} status=${r?.status ?? "failed"} facts=${facts.length} ms=${r?.ms ?? -1} network=${networkResearch ? "on" : "off"}`);
  return facts;
}

async function uploadImage(b64: string, ch: ChapterInfo) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const fn = `ig-canto${ch.skandh}-ch${ch.number}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("instagram-images").upload(fn, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
  return { url: supabase.storage.from("instagram-images").getPublicUrl(fn).data.publicUrl, path: fn };
}

async function listExistingChapters(): Promise<Set<number>> {
  const existing = new Set<number>();
  const { data: deletedRows } = await supabase.from("bhagavatam_image_deletes").select("chapter_number, scene_index");
  const deletedSet = new Set<string>((deletedRows || []).map((d: { chapter_number: number; scene_index: number }) => `${d.chapter_number}-${d.scene_index}`));
  const { data: reviewRows } = await supabase.from("ig_pending_review").select("chapter_canto, chapter_in_canto, chapter_global_number, id, status, image_path");
  const rejectedPaths = new Set<string>();
  for (const r of reviewRows || []) {
    if (r.status === "rejected") { if (r.image_path) rejectedPaths.add(r.image_path); continue; }
    if (r.status !== "pending" && r.status !== "approved") continue;
    const sceneIdx = 200 + (r.id as number);
    if (deletedSet.has(`${r.chapter_global_number}-${sceneIdx}`)) continue;
    existing.add((r.chapter_canto as number) * 1000 + (r.chapter_in_canto as number));
  }
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from("instagram-images").list("", { limit: 1000, offset });
    if (error || !data || data.length === 0) break;
    for (const f of data) {
      if (rejectedPaths.has(f.name)) continue;
      const m = /ig-canto(\d+)-ch(\d+)-/.exec(f.name);
      if (m) existing.add(parseInt(m[1], 10) * 1000 + parseInt(m[2], 10));
    }
    if (data.length < 1000) break;
    offset += 1000;
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

// opts.networkResearch defaults to true (sample mode); bulk mode passes false.
// opts.deadlineAt and opts.maxAttempts bound the visual check; the defaults are
// the sync ones, counted from now.
async function generateOne(
  chapter: ChapterInfo,
  opts: { networkResearch?: boolean; deadlineAt?: number; maxAttempts?: number } = {},
): Promise<{ ok: boolean; chapter: ChapterInfo; pendingId?: number; visualCheck?: VisualCheckRecord; error?: string }> {
  try {
    const text = await getChapterText(chapter);
    const { imagePrompt, caption, hashtags } = await generateScenePrompt(chapter, text);
    // Same research row as instagram-post's inline path (bhagavatam:g<N>:inline).
    const facts = await researchFacts({
      key: inlineKey("bhagavatam", chapter.globalNumber),
      book: "bhagavatam",
      sceneText: imagePrompt,
    }, opts.networkResearch !== false);
    const { b64, visualCheck } = await generateImage(imagePrompt, facts, {
      deadlineAt: opts.deadlineAt ?? Date.now() + SYNC_CHECK_DEADLINE_MS,
      maxAttempts: opts.maxAttempts ?? SYNC_MAX_ATTEMPTS,
      tag: `bulk-generate-images g${chapter.globalNumber}`,
    });
    const { url, path } = await uploadImage(b64, chapter);
    const row = {
      chapter_global_number: chapter.globalNumber,
      chapter_canto: chapter.skandh,
      chapter_in_canto: chapter.number,
      chapter_title: chapter.title,
      image_url: url, image_path: path,
      caption, hashtags, status: "pending",
    };
    let { data: inserted, error } = await supabase.from("ig_pending_review").insert({ ...row, visual_check: visualCheck }).select("id").single();
    if (error && /visual_check/.test(error.message)) {
      // The visual_check column is missing (migration not applied yet): keep the
      // image and its paid renders, without the record.
      console.warn(`[bulk-generate-images] insert with visual_check failed (${error.message}); saving without it`);
      ({ data: inserted, error } = await supabase.from("ig_pending_review").insert(row).select("id").single());
    }
    if (error) throw new Error(error.message);
    return { ok: true, chapter, pendingId: inserted?.id, visualCheck };
  } catch (e) { return { ok: false, chapter, error: String(e) }; }
}

async function runInParallel<T>(items: T[], concurrency: number, fn: (item: T) => Promise<unknown>) {
  let i = 0;
  const results: unknown[] = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx]); }
  });
  await Promise.all(workers);
  // Backgrounded via EdgeRuntime.waitUntil — function logs are the only place
  // an operator can see how a bulk run actually went (a run could previously
  // fail every item with zero trace).
  const summary = results.map(r => (r && typeof r === "object" && "ok" in (r as Record<string, unknown>)) ? (r as { ok: boolean; error?: string; chapter?: { globalNumber?: number } }) : null);
  const failed = summary.filter(s => s && s.ok === false);
  console.log(`[bulk-generate-images] run complete: ${summary.length} attempted, ${failed.length} failed` + (failed.length ? ` — ${failed.map(f => `${f?.chapter?.globalNumber}: ${String(f?.error).substring(0, 80)}`).join("; ")}` : ""));
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, authorization, apikey" } });
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode: "status" | "sample" | "bulk" = body.mode || "status";
    if (mode === "status") {
      const missing = await getMissingChapters();
      const { count: pendingCount } = await supabase.from("ig_pending_review").select("id", { count: "exact", head: true }).eq("status", "pending");
      return new Response(JSON.stringify({ missingCount: missing.length, pendingReviewCount: pendingCount || 0, firstMissing: missing.slice(0, 5).map(c => ({ canto: c.skandh, chapter: c.number, title: c.title })) }), { headers: cors });
    }
    if (mode === "sample") {
      const missing = await getMissingChapters();
      if (missing.length === 0) return new Response(JSON.stringify({ error: "No missing chapters" }), { status: 404, headers: cors });
      const r = await generateOne(missing[0], { deadlineAt: startedAt + SYNC_CHECK_DEADLINE_MS, maxAttempts: SYNC_MAX_ATTEMPTS });
      return new Response(JSON.stringify(r), { headers: cors });
    }
    if (mode === "bulk") {
      const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));
      const concurrency = Math.min(5, Math.max(1, Number(body.concurrency) || 4));
      const missing = (await getMissingChapters()).slice(0, limit);
      if (missing.length === 0) return new Response(JSON.stringify({ error: "No missing chapters" }), { status: 404, headers: cors });
      // Research in bulk is cache-only: no Firecrawl, Claude or cache write per chapter.
      // One visual check deadline for the whole run (invocation start + 360s).
      const bulkCheck = { networkResearch: false, deadlineAt: startedAt + BULK_CHECK_DEADLINE_MS, maxAttempts: BULK_MAX_ATTEMPTS };
      // @ts-ignore - EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(runInParallel(missing, concurrency, (c: ChapterInfo) => generateOne(c, bulkCheck)));
      return new Response(JSON.stringify({ started: true, queued: missing.length, concurrency, research: "cache-only", message: `Generating ${missing.length} images in parallel (${concurrency} at a time).` }), { headers: cors });
    }
    return new Response(JSON.stringify({ error: "Invalid mode" }), { status: 400, headers: cors });
  } catch (err) { console.error(err); return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors }); }
});
