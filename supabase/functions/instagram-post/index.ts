import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
// no configuration has been approved or the table is unreachable.
interface ActiveGenCfg {
  model: string; width: number; height: number; steps: number | null;
  fallback_model: string | null; fallback_width: number | null; fallback_height: number | null;
  // Instagram-specific size. Chapter art stays portrait for the books, so this
  // is separate rather than overloading width/height.
  ig_width: number | null; ig_height: number | null;
}
let __cfgCache: ActiveGenCfg | null | undefined;
async function getActiveGenConfig(): Promise<ActiveGenCfg | null> {
  if (__cfgCache !== undefined) return __cfgCache;
  try {
    const { data } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
    __cfgCache = (data as ActiveGenCfg) || null;
  } catch { __cfgCache = null; }
  return __cfgCache;
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

async function markSceneUsed(globalNumber: number, sceneIndex: number, currentUsed: number[]): Promise<void> {
  const updated = [...new Set([...currentUsed, sceneIndex])];
  await supabase
    .from("bhagavatam_chapter_scenes")
    .update({ used_scene_indexes: updated })
    .eq("chapter_global_number", globalNumber);
}

function pickScene(scenes: ChapterScene[], usedIndexes: number[]): { scene: ChapterScene; index: number; cycleReset: boolean } {
  const sorted = scenes.map((s, idx) => ({ s, idx })).sort((a, b) => (a.s.rank || 99) - (b.s.rank || 99));
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
): Promise<{ prompt: string; caption: string; hashtags: string }> {
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

async function tryGenerate(prompt: string, model: string, w: number, h: number, seed?: number): Promise<string | null> {
  try {
    const body: Record<string, unknown> = { model, prompt, width: w, height: h, n: 1, response_format: "b64_json" };
    if (seed !== undefined) body.seed = seed;
    const res = await fetch(TOGETHER_API, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.log(`${model}: ${res.status}`); return null; }
    return (await res.json()).data?.[0]?.b64_json || null;
  } catch (e) { console.log(`${model} err: ${e}`); return null; }
}

async function generateImage(prompt: string, matchedPersonas: Persona[], varietySeed: number): Promise<string> {
  const personaInject = matchedPersonas.length > 0
    ? " Characters: " + matchedPersonas.map(p => p.short_description).join(". ")
    : "";
  // Build order: scene prompt → persona injection → ART_STYLE → gender → anachronism.
  let fullPrompt = `${prompt}${personaInject}, ${ART_STYLE}. ${GENDER_RULES} ${ANACHRONISM_RULES}`;
  if (fullPrompt.length > 2000) {
    const styleNegatives = "NOT cartoon, NOT anime, NOT CGI, NOT 3D render, NOT digital illustration, NOT Pixar style, NOT Midjourney style, NOT plastic shiny skin, NOT photo-realistic";
    const stylePositives = "museum-quality 19th-century Indian devotional OIL PAINTING on canvas, Raja Ravi Varma 1880-1900 aesthetic, VISIBLE oil-paint brushstrokes, warm saffron palette, soft golden-hour lighting";
    const ruleBlock = `${GENDER_RULES.substring(0, 200)} ${ANACHRONISM_RULES.substring(0, 540)}`;
    fullPrompt = `${prompt}${personaInject}`.substring(0, 1100) + `, ${stylePositives}, ${styleNegatives}. ${ruleBlock}`;
    if (fullPrompt.length > 2000) fullPrompt = fullPrompt.substring(0, 1980);
  }
  // Word-boundary anchors are load-bearing: without \b the alternation
  // rewrote substrings inside ordinary words ("warm" → "blessingm").
  const sanitized = fullPrompt.replace(/\b(battle|war|fight|weapon|sword|arrow|kill|death|blood|fire|burn|destroy|attack|strike|naked|nude)\b/gi, "blessing");
  const seed = varietySeed > 0 ? varietySeed : Math.floor(Math.random() * 1_000_000);
  // Model/size come from the approved configuration when one exists.
  const __cfg = await getActiveGenConfig();
  const __m1 = __cfg?.model  || "black-forest-labs/FLUX.2-pro";
  // 16:9 landscape for Instagram (ig_width/ig_height), falling back to the shared
  // portrait size when no Instagram size is configured.
  const __w1 = __cfg?.ig_width  || __cfg?.width  || 1344;
  const __h1 = __cfg?.ig_height || __cfg?.height || 768;
  const __m2 = __cfg?.fallback_model  || "black-forest-labs/FLUX.1.1-pro";
  // Retry at 1024x576 — exactly 16:9 and both multiples of 64 — so a fallback
  // never silently changes the crop the post was composed for.
  const __w2 = __cfg?.ig_width ? 1024 : (__cfg?.fallback_width || 1024);
  const __h2 = __cfg?.ig_height ? 576 : (__cfg?.fallback_height || 576);
  const attempts: Array<{ model: string; prompt: string; w: number; h: number; seed?: number }> = [
    { model: __m1, prompt: sanitized, w: __w1, h: __h1, seed },
    { model: __m2, prompt: sanitized, w: __w2, h: __h2, seed },
    { model: __m2, prompt: SAFE_FALLBACK, w: __w2, h: __h2 },
  ];
  for (const a of attempts) {
    const b64 = await tryGenerate(a.prompt, a.model, a.w, a.h, a.seed);
    if (b64) return b64;
  }
  throw new Error("All FLUX attempts failed");
}

async function uploadImage(b64: string, ch: ChapterInfo): Promise<{ url: string; path: string }> {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const fn = `ig-canto${ch.skandh}-ch${ch.number}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("instagram-images").upload(fn, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Upload: ${error.message}`);
  return { url: supabase.storage.from("instagram-images").getPublicUrl(fn).data.publicUrl, path: fn };
}

async function generateForChapter(chapterOverride: number | null): Promise<Record<string, unknown>> {
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

  if (sceneRow) {
    const { scene, index, cycleReset } = pickScene(sceneRow.scenes, sceneRow.usedIndexes);
    console.log(`Using pre-extracted scene #${index} (rank ${scene.rank}): "${scene.title}"${cycleReset ? " [cycle reset]" : ""}`);
    imagePrompt = scene.image_prompt;
    characterNames = scene.characters || [];
    matched = matchPersonas(scene.characters || [], allPersonas);
    const cap = await buildCaptionForScene(chapter, scene);
    caption = cap.caption;
    hashtags = cap.hashtags;
    usedSceneInfo = { index, title: scene.title, cycleReset };
  } else {
    console.log(`No scenes in DB — falling back to inline Claude generation`);
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
    imagePrompt = inline.prompt;
    caption = inline.caption;
    hashtags = inline.hashtags;
  }

  const b64 = await generateImage(imagePrompt, matched, varietySeed);
  const { url, path } = await uploadImage(b64, chapter);

  // Attribute to the Mahājana who speaks in / appears in this chapter (fail-soft null).
  const mahajanKey = await resolveMahajanKey(characterNames, matched);
  console.log(`Mahājana attribution: ${mahajanKey || "(none)"} — characters: ${characterNames.join(", ") || "?"}`);

  // Anchor Sanskrit śloka + Hindi for the Darshan card (fail-soft null).
  const verse = await extractVerse(chapter.title, text, usedSceneInfo?.title);
  console.log(`Verse: ${verse.sanskrit ? "extracted" : "(none)"}`);

  const { data: inserted, error: insErr } = await supabase
    .from("ig_pending_review")
    .insert({
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
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`Pending insert: ${insErr.message}`);

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
    sceneSource: sceneRow ? "pre-extracted" : "inline-claude",
    rejectionsSoFar: rejectCount || 0,
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
    const result = await generateForChapter(chapterOverride);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
