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
async function tryGenerate(prompt: string, model: string, w: number, h: number): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(TOGETHER_API, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_KEY}` },
      body: JSON.stringify({ model, prompt, width: w, height: h, n: 1, response_format: "b64_json" }),
      signal: ctrl.signal,
    });
    if (!res.ok) { console.log(`[bulk-generate-images] ${model}: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`); return null; }
    return (await res.json()).data?.[0]?.b64_json || null;
  } catch (e) { console.log(`[bulk-generate-images] ${model} err: ${e}`); return null; }
  finally { clearTimeout(timer); }
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

async function generateImage(prompt: string): Promise<string> {
  const cfg = await getActiveConfig();
  let fullPrompt: string;
  if (cfg) {
    // Assemble exactly as the playground previews it.
    fullPrompt = prompt;
    if (cfg.style_positives) fullPrompt += `, ${cfg.style_positives}`;
    if (cfg.style_negatives) fullPrompt += `, ${cfg.style_negatives}`;
    if (cfg.extra_rules) fullPrompt += `. ${cfg.extra_rules}`;
    const max = cfg.prompt_max_len || 2000;
    if (fullPrompt.length > max) fullPrompt = fullPrompt.slice(0, max);
  } else {
    fullPrompt = `${prompt}, ${ART_STYLE}. ${MASCULINITY_RULE} ${ANACHRONISM_RULES}`;
    if (fullPrompt.length > 2000) {
      const stylePositives = "museum-quality 19th-century Indian devotional OIL PAINTING on canvas, Raja Ravi Varma 1880-1900 aesthetic, VISIBLE oil-paint brushstrokes, warm saffron palette, soft golden-hour lighting";
      const styleNegatives = "NOT cartoon, NOT anime, NOT CGI, NOT 3D render, NOT digital illustration, NOT Pixar style, NOT Midjourney style, NOT plastic shiny skin, NOT photo-realistic";
      fullPrompt = `${prompt}`.substring(0, 1050) + `, ${stylePositives}, ${styleNegatives}. ${MASCULINITY_RULE.substring(0, 180)} ${ANACHRONISM_RULES.substring(0, 540)}`;
      if (fullPrompt.length > 2000) fullPrompt = fullPrompt.substring(0, 1980);
    }
  }
  const sanitized = fullPrompt.replace(/battle|war|fight|weapon|sword|arrow|kill|death|blood|fire|burn|destroy|attack|strike|naked|nude/gi, "blessing");
  const attempts = cfg
    ? [
        { model: cfg.model, prompt: sanitized, w: cfg.width, h: cfg.height },
        { model: cfg.fallback_model || cfg.model, prompt: sanitized, w: cfg.fallback_width || cfg.width, h: cfg.fallback_height || cfg.height },
        { model: cfg.fallback_model || cfg.model, prompt: SAFE_FALLBACK, w: cfg.fallback_width || cfg.width, h: cfg.fallback_height || cfg.height },
      ]
    : [
    { model: "black-forest-labs/FLUX.2-pro", prompt: sanitized, w: 1088, h: 1344 },
    { model: "black-forest-labs/FLUX.1.1-pro", prompt: sanitized, w: 768, h: 1024 },
    { model: "black-forest-labs/FLUX.1.1-pro", prompt: SAFE_FALLBACK, w: 768, h: 1024 },
  ];
  for (const a of attempts) {
    const b64 = await tryGenerate(a.prompt, a.model, a.w, a.h);
    if (b64) return b64;
  }
  throw new Error("All FLUX attempts failed");
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

async function generateOne(chapter: ChapterInfo): Promise<{ ok: boolean; chapter: ChapterInfo; pendingId?: number; error?: string }> {
  try {
    const text = await getChapterText(chapter);
    const { imagePrompt, caption, hashtags } = await generateScenePrompt(chapter, text);
    const b64 = await generateImage(imagePrompt);
    const { url, path } = await uploadImage(b64, chapter);
    const { data: inserted, error } = await supabase.from("ig_pending_review").insert({
      chapter_global_number: chapter.globalNumber,
      chapter_canto: chapter.skandh,
      chapter_in_canto: chapter.number,
      chapter_title: chapter.title,
      image_url: url, image_path: path,
      caption, hashtags, status: "pending",
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, chapter, pendingId: inserted?.id };
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
      const r = await generateOne(missing[0]);
      return new Response(JSON.stringify(r), { headers: cors });
    }
    if (mode === "bulk") {
      const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));
      const concurrency = Math.min(5, Math.max(1, Number(body.concurrency) || 4));
      const missing = (await getMissingChapters()).slice(0, limit);
      if (missing.length === 0) return new Response(JSON.stringify({ error: "No missing chapters" }), { status: 404, headers: cors });
      // @ts-ignore - EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(runInParallel(missing, concurrency, generateOne));
      return new Response(JSON.stringify({ started: true, queued: missing.length, concurrency, message: `Generating ${missing.length} images in parallel (${concurrency} at a time).` }), { headers: cors });
    }
    return new Response(JSON.stringify({ error: "Invalid mode" }), { status: 400, headers: cors });
  } catch (err) { console.error(err); return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors }); }
});
