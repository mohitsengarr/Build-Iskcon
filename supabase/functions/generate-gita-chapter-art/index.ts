// Supabase Edge Function: generate-gita-chapter-art
//
// Chapter artwork for the Bhagavad-gita, matching what the Bhagavatam and
// Chaitanya already have. Claude writes a scene + caption for the chapter, the
// image is rendered with the configuration approved in the Image Playground, and
// the result lands in gita_chapter_art_review as `pending` for approval.
//
// POST body:
//   { "chapter": 4 }        → that chapter
//   { "missing": true }     → the next chapter with no pending/approved art
//   { "missing": true, "limit": 5 } → up to N missing chapters in one run
//
// DEPLOY ORDER: apply supabase/migrations/20260913190000_scene_visual_research.sql
// BEFORE deploying this function. Deployed first it is still safe (research is
// skipped while scene_visual_research cannot be read), it just does no research.
// Also apply supabase/migrations/20260913230000_visual_check.sql BEFORE deploying:
// every insert writes gita_chapter_art_review.visual_check. Deployed first, a
// chapter is still saved, only without its check record.
//
// VISUAL CHECK: Claude vision checks each chapter's image against the research
// facts that went into its prompt (_shared/visualCheck.ts). Supabase cuts a request
// at 150s, so the check runs after the response, in EdgeRuntime.waitUntil. Each
// chapter is rendered once and stored with a visual_check record: "running" while
// its check is still to come, skipped when the prompt carries no facts or the
// check is off. The check starts as soon as the chapter's row is written, so it
// runs while later chapters render. The gallery starts these runs and a reviewer
// looks at the result, so the check only FLAGS a clearly contradicted fact (three
// horses, Krishna holding the bow) on the row: the image is never swapped. Only
// the facts the prompt carries are checked. Every check of a run shares one
// deadline, 360s after the worker started (backgroundDeadline). A later chapter
// is not started once it could not be stored before the request is cut: it is
// listed in skipped, and the next run picks it up. The response carries each
// chapter's stored record.
//
// RESEARCH NETWORK: a single-chapter run ({ chapter }, or { missing: true } with
// limit 1) may research on the web. A multi-chapter run ({ missing: true } with
// limit > 1, or more than one target chapter) reads research from the cache only
// (allowNetwork: false): chapters render one after another, and up to 60s of
// network research per chapter would risk the wall-clock limit. researchMode.ts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSceneResearch } from "../_shared/sceneResearch.ts";
import { gitaResearchOptions } from "./researchMode.ts";
import { assemblePrompt, extractEntities, gitaChapterKey, normalizeForMatch, sanitizeForImageModel } from "../_shared/sceneResearchCore.ts";
import { backgroundDeadline, checkInBackground, imagePayload, initialRecord, needsBackgroundCheck, runInBackground } from "../_shared/visualCheck.ts";
import { fallbackSizeFor } from "../_shared/imageSizes.ts";
import { renderFailureMessage, renderWithRetry } from "../_shared/togetherRetry.ts";
// A request is cut at 150s, a streamed one too. A run plans to have its last
// chapter stored by request start + REQUEST_BUDGET_MS, leaving time to respond.
const REQUEST_BUDGET_MS = 140_000;
// About one chapter's time now that the check runs after the response: the brief,
// cached research, one ~10s FLUX.2-pro render (and the fallback model's when that
// fails) and the upload. A later chapter starts only while it can be stored by
// request start + REQUEST_BUDGET_MS.
const CHAPTER_ESTIMATE_MS = 45_000;
const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const TOGETHER_KEY = Deno.env.get("TOGETHER_API_KEY") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
// Sanitising uses the shared sanitizeForImageModel: WHOLE words only (plus simple
// plural/tense endings). Without word boundaries "war" was rewritten INSIDE other
// words ("warrior" -> "blessingrior", "battlefield" -> "blessingfield").
const CHAPTERS = [
  {
    n: 1,
    sa: "अर्जुनविषादयोग",
    en: "Observing the Armies on the Battlefield of Kurukshetra"
  },
  {
    n: 2,
    sa: "सांख्ययोग",
    en: "Contents of the Gita Summarized"
  },
  {
    n: 3,
    sa: "कर्मयोग",
    en: "Karma-yoga"
  },
  {
    n: 4,
    sa: "ज्ञानकर्मसंन्यासयोग",
    en: "Transcendental Knowledge"
  },
  {
    n: 5,
    sa: "कर्मसंन्यासयोग",
    en: "Karma-yoga — Action in Krishna Consciousness"
  },
  {
    n: 6,
    sa: "ध्यानयोग",
    en: "Dhyana-yoga"
  },
  {
    n: 7,
    sa: "ज्ञानविज्ञानयोग",
    en: "Knowledge of the Absolute"
  },
  {
    n: 8,
    sa: "अक्षरब्रह्मयोग",
    en: "Attaining the Supreme"
  },
  {
    n: 9,
    sa: "राजविद्याराजगुह्ययोग",
    en: "The Most Confidential Knowledge"
  },
  {
    n: 10,
    sa: "विभूतियोग",
    en: "The Opulence of the Absolute"
  },
  {
    n: 11,
    sa: "विश्वरूपदर्शनयोग",
    en: "The Universal Form"
  },
  {
    n: 12,
    sa: "भक्तियोग",
    en: "Devotional Service"
  },
  {
    n: 13,
    sa: "क्षेत्रक्षेत्रज्ञविभागयोग",
    en: "Nature, the Enjoyer, and Consciousness"
  },
  {
    n: 14,
    sa: "गुणत्रयविभागयोग",
    en: "The Three Modes of Material Nature"
  },
  {
    n: 15,
    sa: "पुरुषोत्तमयोग",
    en: "The Yoga of the Supreme Person"
  },
  {
    n: 16,
    sa: "दैवासुरसम्पद्विभागयोग",
    en: "The Divine and Demoniac Natures"
  },
  {
    n: 17,
    sa: "श्रद्धात्रयविभागयोग",
    en: "The Divisions of Faith"
  },
  {
    n: 18,
    sa: "मोक्षसंन्यासयोग",
    en: "Conclusion — The Perfection of Renunciation"
  }
];
const DEFAULTS = {
  model: "black-forest-labs/FLUX.2-pro",
  width: 1088,
  height: 1344,
  steps: null,
  style_positives: "museum-quality 19th-century Indian devotional OIL PAINTING on canvas, Raja Ravi Varma 1880-1900 aesthetic, VISIBLE oil-paint brushstrokes, warm saffron palette, soft golden-hour lighting",
  style_negatives: "NOT cartoon, NOT anime, NOT CGI, NOT 3D render, NOT digital illustration, NOT Pixar style, NOT plastic shiny skin, NOT photo-realistic",
  extra_rules: "ALL adult male characters MUST look distinctly MASCULINE with beards where appropriate. Vedic era only — NO glasses, NO modern clothing, NO modern technology.",
  prompt_max_len: 2000,
  fallback_model: "black-forest-labs/FLUX.1.1-pro",
  fallback_width: 768,
  fallback_height: 1024
};
// Scenes the editor turned down with "Reject scene" for this chapter
// (approve-gita-art). The Gita has no extracted scene list to rotate through, so
// the brief is told what was rejected and asked for a different moment; without
// this the same central moment came straight back.
async function rejectedScenes(chapterNumber) {
  try {
    const { data, error } = await supabase.from("gita_chapter_art_review").select("scene_title, prompt").eq("chapter_number", chapterNumber).eq("status", "rejected").eq("scene_rejected", true).order("created_at", {
      ascending: false
    }).limit(6);
    if (error) return [];
    return (data || []).map((r)=>(typeof r.scene_title === "string" && r.scene_title.trim()) || sceneGist(r.prompt)).filter(Boolean);
  } catch  {
    return [];
  }
}
// For rows saved before scene_title existed. A stored prompt is the scene, then
// facts, style and rules; and every scene restates the same chariot iconography,
// so drop those sentences or the gist says nothing about the moment itself.
const ICONOGRAPHY = /four white horses|holding the reins|banner (bearing|with) Hanuman|peacock feather|blue skin|pitambara/i;
function sceneGist(prompt) {
  if (typeof prompt !== "string") return "";
  const scene = prompt.split(/Canonical details:|museum-quality|STRICTLY ANCIENT/i)[0];
  return scene.split(/(?<=[.!?])\s+/).filter((sentence)=>!ICONOGRAPHY.test(sentence)).join(" ").replace(/\s+/g, " ").trim().slice(0, 300);
}
function avoidNote(avoid) {
  if (!avoid.length) return "";
  return "\n\nThe editor rejected these moments for this chapter. Keep the canonical iconography, but depict a clearly DIFFERENT moment (a different action, setting or composition), not a variation of any of them:\n" + avoid.map((a)=>`- ${a}`).join("\n");
}
async function writeSceneAndCaption(ch, avoid = []) {
  const sys = [
    "You write artwork briefs for chapters of the Bhagavad-gita As It Is.",
    "Return ONLY valid JSON, no markdown fence:",
    '{"moment":"...","imagePrompt":"...","caption":"...","hashtags":"..."}',
    "moment: the moment the painting shows, in under 12 words (e.g. 'Krishna reveals his universal form to Arjuna').",
    "imagePrompt: ONE English prompt for a devotional oil painting of this chapter's central moment.",
    "  Label every figure MALE or FEMALE. Krishna is a youthful MALE charioteer with blue skin and peacock feather;",
    "  Arjuna is a muscular MALE warrior. Say who is present, what they do, and the setting. Under 90 words.",
    "CANONICAL ICONOGRAPHY — state these explicitly whenever the element appears, and never contradict them:",
    "  - Arjuna's chariot is drawn by EXACTLY FOUR WHITE HORSES (say 'exactly four white horses'). Never two, never three.",
    "  - Krishna stands at the FRONT of the chariot holding the reins as charioteer; Arjuna stands behind him with the Gandiva bow.",
    "  - The chariot flies a banner bearing HANUMAN.",
    "  - Krishna wears a peacock feather in his crown and yellow silk (pitambara); his skin is blue.",
    "  - Kurukshetra is a flat open plain; the two armies are distant, never engaged in combat.",
    "  PEACEFUL imagery only — dialogue, teaching, reverence. Never combat.",
    "caption: 3-4 lines of plain English on what the chapter teaches. No hashtags inside it.",
    "hashtags: one line of 8-10 relevant tags starting with #BhagavadGita."
  ].join("\n");
  const r = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 900,
      system: sys,
      messages: [
        {
          role: "user",
          content: `Chapter ${ch.n}: ${ch.sa} — ${ch.en}${avoidNote(avoid)}`
        }
      ]
    })
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j?.content?.[0]?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Claude returned no JSON");
  return JSON.parse(m[0]);
}
// imagePayload sends steps to FLUX (black-forest-labs/) models only: OpenAI image
// models such as openai/gpt-image-2 do not take it. A rate-limited post is
// re-sent by renderWithRetry before this attempt gives up, and the failure is
// collected so the chapter's error can name the cause.
async function tryGenerate(prompt, model, w, h, steps, failures) {
  const payload = imagePayload(model, prompt, w, h, { steps });
  // This function has never caught a request that throws: it fails the chapter
  // with its own error. renderWithRetry never throws, so the error it hands to
  // onError is rethrown here to keep that.
  let thrown = null;
  const { b64, failure } = await renderWithRetry({
    request: ()=>fetch(TOGETHER_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOGETHER_KEY}`
        },
        body: JSON.stringify(payload)
      }),
    onFailure: (status, body, kind, willRetry)=>{
      console.log(`[gita-art] ${model} HTTP ${status}: ${body} (${kind}${willRetry ? ", retrying" : ""})`);
    },
    onError: (e)=>{
      thrown = e;
    }
  });
  if (thrown) throw thrown;
  if (!b64 && failure && failures) failures.push(failure);
  return b64;
}
// The shared core treats a cache READ ERROR exactly like "no row". With the table
// missing (migration not applied yet) or the database erroring, EVERY chapter
// would spend 3 Firecrawl searches (a credit pool shared with the CRM crons), up
// to 2 scrapes and an Opus call, cache nothing, and add up to 60s. So research
// runs only when this read of the same table and row the core reads succeeds (a
// row or no row). A read with no answer within CACHE_PROBE_TIMEOUT_MS counts as
// failed, so a hung database cannot hold up the image either.
const RESEARCH_CACHE_TABLE = "scene_visual_research";
const CACHE_PROBE_TIMEOUT_MS = 5_000;
async function researchCacheReadable(key) {
  let timer;
  const timedOut = new Promise((resolve)=>{
    timer = setTimeout(()=>resolve(false), CACHE_PROBE_TIMEOUT_MS);
  });
  const read = (async ()=>{
    const { error } = await supabase.from(RESEARCH_CACHE_TABLE).select("facts, status, expires_at, research_version, hit_count").eq("research_key", key).maybeSingle();
    return !error;
  })().catch(()=>false);
  try {
    return await Promise.race([
      read,
      timedOut
    ]);
  } finally{
    clearTimeout(timer);
  }
}
// A research fact must be about someone IN the scene. A fact that names people
// (the shared built-in name list, aliases folded: Partha is Arjuna) is dropped
// when NONE of them is named in the scene. Krishna and Arjuna always count as
// present here, so the seeded chariot canon is unaffected; what this drops is,
// e.g., a web fact naming only Garuda, Surya or Sanjaya when the brief shows none
// of them. A fact naming nobody is kept. On any error: no facts.
function factsAboutScenePeople(facts, sceneText) {
  try {
    const people = (text)=>extractEntities(text).characters.map((c)=>normalizeForMatch(c));
    const present = new Set(people(sceneText));
    const kept = facts.filter((f)=>{
      const named = people(f);
      return named.length === 0 || named.some((n)=>present.has(n));
    });
    return { kept, absent: facts.length - kept.length };
  } catch {
    return { kept: [], absent: facts.length };
  }
}
// Verified canonical visual facts for this chapter (editor canon first, then
// cached or freshly researched web facts). Additive to the CANONICAL ICONOGRAPHY
// block in the brief and to the four-horses restatement, which both stay.
// NEVER throws: on any failure there are no facts and the prompt is unchanged.
// researchOptions comes from gitaResearchOptions for the whole run: cache only
// ({ allowNetwork: false }) in a multi-chapter run, network allowed otherwise.
async function researchChapter(ch, brief, researchOptions) {
  const key = gitaChapterKey(ch.n);
  const started = Date.now();
  try {
    if (!await researchCacheReadable(key)) {
      console.warn(`[gita-art] research skipped: could not read ${RESEARCH_CACHE_TABLE} (migration 20260913190000 not applied, or a database error)`);
      return { key, status: "skipped", facts: [], absent: 0, ms: Date.now() - started };
    }
    const sceneText = typeof brief?.imagePrompt === "string" ? brief.imagePrompt : "";
    // The whole Gita is Krishna speaking to Arjuna on his chariot.
    const characters = ["Krishna", "Arjuna"];
    const r = await getSceneResearch(supabase, {
      key,
      book: "gita",
      sceneText,
      title: ch.en,
      characters,
    }, researchOptions);
    const { kept, absent } = factsAboutScenePeople(Array.isArray(r.facts) ? r.facts : [], [ch.en, sceneText, ...characters].join(". "));
    return { key: r.key, status: r.status, facts: kept, absent, ms: r.ms };
  } catch {
    return { key, status: "failed", facts: [], absent: 0, ms: 0 };
  }
}
// The facts a prompt really carries, which is what the visual check verifies.
// assemblePrompt sends a repeated fact once and names each fact it leaves out for
// room as facts[i]; neither was asked for, so neither is checked.
function factsKept(facts, droppedParts) {
  const dropped = new Set(droppedParts);
  const seen = new Set();
  return facts.filter((f, i)=>{
    const k = normalizeForMatch(sanitizeForImageModel(f));
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return !dropped.has(`facts[${i}]`);
  });
}
// The image prompt. With no research facts this is byte-for-byte the prompt the
// function built before research (scene, style, rules, cut to the limit,
// sanitised). With facts, assemblePrompt puts them straight after the scene and
// trims style (negatives first) rather than the scene or the facts. factsUsed is
// the facts the prompt carries ([] for the prompt without facts).
function buildImagePrompt(scene, facts, cfg) {
  const maxLen = cfg.prompt_max_len || 2000;
  if (facts.length > 0) {
    try {
      const { prompt, report } = assemblePrompt({
        scene,
        facts,
        stylePositives: cfg.style_positives,
        styleNegatives: cfg.style_negatives,
        extraRules: cfg.extra_rules
      }, { maxLen });
      const dropped = report.droppedParts.length ? ` dropped=${report.droppedParts.join("|")}` : "";
      return { prompt, note: ` sent=${report.sentChars}/${report.maxLen}${report.truncatedScene ? " scene_cut" : ""}${dropped}`, factsUsed: factsKept(facts, report.droppedParts) };
    } catch {
      // fall through to the pre-research prompt
    }
  }
  let full = scene;
  if (cfg.style_positives) full += `, ${cfg.style_positives}`;
  if (cfg.style_negatives) full += `, ${cfg.style_negatives}`;
  if (cfg.extra_rules) full += `. ${cfg.extra_rules}`;
  if (full.length > maxLen) full = full.slice(0, maxLen);
  return { prompt: sanitizeForImageModel(full), note: "", factsUsed: [] };
}
// The response carries the record the row was stored with, "running" while its
// check is still to come; the check writes its outcome to the row, where each
// failed fact is listed with what the painting showed.
function visualCheckSummary(record) {
  return {
    status: record.status,
    attempts: record.attempts,
    chosen_attempt: record.chosen_attempt,
    failed: record.failed.length,
    unclear: record.unclear,
    reason: record.reason,
    image_model: record.image_model
  };
}
// Writes the background check's record over the chapter's "running" one. A
// compare-and-swap on the stored image: a row whose image was replaced since
// (regenerate-chapter-art stores a new image_path with its own record) or that is
// gone keeps what it has. A missing visual_check column or any other failure is
// logged and left alone; the check is never retried.
function recordWriter(id, imagePath, chapter) {
  return async (record)=>{
    const { data, error } = await supabase.from("gita_chapter_art_review").update({
      visual_check: record
    }).eq("id", id).eq("image_path", imagePath).select("id");
    if (error) {
      const missingColumn = error.code === "PGRST204" || error.code === "42703";
      console.warn(`[gita-art] ch${chapter} visual_check not stored: ${missingColumn ? "the visual_check column is missing" : `update failed (${error.code} ${String(error.message).slice(0, 200)})`}`);
      return false;
    }
    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`[gita-art] ch${chapter} visual_check not stored: the row no longer holds ${imagePath}`);
      return false;
    }
    return true;
  };
}
// requestStart is when the request began. Every chapter's background check
// shares the deadline built from it (the handler binds it once, as buildOne).
async function buildChapter(ch, researchOptions, requestStart) {
  const { data: cfgRow } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
  const cfg = {
    ...DEFAULTS,
    ...cfgRow || {}
  };
  const brief = await writeSceneAndCaption(ch, await rejectedScenes(ch.n));
  const research = await researchChapter(ch, brief, researchOptions);
  let scene = brief.imagePrompt;
  // Image models are poor at counting, and the renders kept coming back with two
  // or three horses. Restate the count in the image prompt itself whenever the
  // scene involves the chariot — the brief alone did not carry it through.
  // Skipped when a research fact already states it: the duplicate pushed the
  // style negatives out of the 2000-char prompt (live run 2026-09-13).
  const countStated = research.facts.some((f) => /\bfour\b[^.]*\bhorses\b/i.test(f));
  if (/chariot|horse|rein/i.test(scene) && !countStated) {
    scene += ". The chariot is drawn by exactly four white horses — four horses, no more and no fewer — with a banner bearing Hanuman above it";
  }
  const { prompt: sanitized, note, factsUsed } = buildImagePrompt(scene, research.facts, cfg);
  console.log(`[gita-art] research key=${research.key} status=${research.status} facts=${research.facts.length}${research.absent ? ` dropped_absent=${research.absent}` : ""} ms=${research.ms} network=${researchOptions?.allowNetwork === false ? "off" : "on"}${note}`);
  // Chapter COVERS are landscape everywhere else (Bhagavatam and Chaitanya both
  // use cover_width/cover_height). Using the generic cfg.width/height made the
  // Gita the only book with portrait chapter art.
  const cw = cfg.cover_width || cfg.width;
  const chh = cfg.cover_height || cfg.height;
  // The fallback model keeps the cover's shape at the scale of the configured
  // fallback size (DEFAULTS only with no active row), the rule
  // regenerate-chapter-art applies to this same queue.
  const fallback = fallbackSizeFor(cw, chh, cfg.fallback_width, cfg.fallback_height);
  const chain = [
    { m: cfg.model, w: cw, h: chh },
    { m: cfg.fallback_model || cfg.model, w: fallback.w, h: fallback.h },
  ];
  // One render: the model, then the fallback model if that fails, each sending
  // the request made before the visual check existed (no seed). A Together
  // request that throws fails the chapter with its own error.
  let image = null;
  // Why each attempt failed, for this chapter's chain only: a bulk run has one
  // array per chapter, so a rate-limited chapter never speaks for another.
  const failures = [];
  for (const a of chain) {
    const b64 = await tryGenerate(sanitized, a.m, a.w, a.h, cfg.steps, failures);
    if (b64) {
      image = { b64, model: a.m };
      break;
    }
  }
  if (!image) throw new Error(renderFailureMessage(failures, `All image attempts failed for chapter ${ch.n}`));
  const bytes = Uint8Array.from(atob(image.b64), (c)=>c.charCodeAt(0));
  const fn = `gita-ch${ch.n}-${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage.from("instagram-images").upload(fn, bytes, {
    contentType: "image/jpeg",
    upsert: true
  });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const url = supabase.storage.from("instagram-images").getPublicUrl(fn).data.publicUrl;
  const caption = `📖 Bhagavad-gita — Chapter ${ch.n}: ${ch.en}\n\n${brief.caption}\n\n🙏 Hare Krishna Hare Krishna Krishna Krishna Hare Hare\nHare Rama Hare Rama Rama Rama Hare Hare`;
  const saved = {
    chapter_number: ch.n,
    chapter_title: `${ch.sa} — ${ch.en}`,
    image_url: url,
    image_path: fn,
    prompt: sanitized,
    caption,
    hashtags: brief.hashtags,
    scene_title: typeof brief.moment === "string" && brief.moment.trim() ? brief.moment.trim().slice(0, 200) : null,
    status: "pending"
  };
  // Stored with the image: "running" while its check is still to come, skipped
  // when the prompt carries no facts or the check is off. Only the facts the
  // prompt carries are checked: one left out for room was never asked for.
  const queuedAt = Date.now();
  const record = initialRecord({ factsUsed, imageModel: image.model, startedAt: queuedAt });
  let { data: row, error: insErr } = await supabase.from("gita_chapter_art_review").insert({
    ...saved,
    visual_check: record
  }).select("id").single();
  if (insErr && /visual_check/.test(insErr.message)) {
    // The visual_check column is missing (migration not applied yet): keep the
    // chapter and its paid render, without the record.
    console.warn(`[gita-art] insert with visual_check failed (${insErr.message}); saving without it`);
    ({ data: row, error: insErr } = await supabase.from("gita_chapter_art_review").insert(saved).select("id").single());
  }
  if (insErr && insErr.code === "23505") {
    // gita_chapter_art_review_one_pending: another run already put a cover for this
    // chapter up for review while this one rendered. Keep that one.
    try {
      await supabase.storage.from("instagram-images").remove([fn]);
    } catch  {}
    return { chapter: ch.n, skipped: "pending" };
  }
  if (insErr) throw new Error(`Insert failed: ${insErr.message}`);
  if (needsBackgroundCheck(record)) {
    // Flag only, after the response: a wrong image is marked on the row for the
    // reviewer, never replaced. Handed over now, before the handler returns.
    runInBackground(checkInBackground({
      b64: image.b64,
      facts: factsUsed,
      imageModel: image.model,
      startedAt: queuedAt,
      deadlineAt: backgroundDeadline(requestStart),
      writeRecord: recordWriter(row?.id, fn, ch.n),
      tag: `gita-art ch${ch.n}`
    }));
  }
  return {
    chapter: ch.n,
    id: row?.id,
    image_url: url,
    visual_check: visualCheckSummary(record)
  };
}
Deno.serve(async (req)=>{
  // The check deadline counts from here, before any chapter work, or from when the
  // worker started if it was already running (backgroundDeadline).
  const requestStart = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: CORS
  });
  if (!TOGETHER_KEY || !ANTHROPIC_KEY) {
    return new Response(JSON.stringify({
      error: "TOGETHER_API_KEY / ANTHROPIC_API_KEY not configured"
    }), {
      status: 500,
      headers: CORS
    });
  }
  try {
    const body = await req.json().catch(()=>({}));
    let targets = [];
    if (body.chapter) {
      const c = CHAPTERS.find((x)=>x.n === body.chapter);
      if (!c) return new Response(JSON.stringify({
        error: "chapter must be 1-18"
      }), {
        status: 400,
        headers: CORS
      });
      // One cover awaiting review per chapter: a replacement requested while one
      // is already pending (a double click, or "Generate missing" meanwhile) is a no-op.
      const { data: pendingRow } = await supabase.from("gita_chapter_art_review").select("id").eq("chapter_number", c.n).eq("status", "pending").limit(1).maybeSingle();
      if (pendingRow) {
        return new Response(JSON.stringify({
          ok: true,
          generated: [],
          errors: [],
          skipped: [
            {
              chapter: c.n,
              reason: "pending"
            }
          ]
        }), {
          headers: CORS
        });
      }
      targets = [
        c
      ];
    } else if (body.missing) {
      const { data: have } = await supabase.from("gita_chapter_art_review").select("chapter_number").in("status", [
        "pending",
        "approved"
      ]);
      const done = new Set((have || []).map((r)=>r.chapter_number));
      targets = CHAPTERS.filter((c)=>!done.has(c.n)).slice(0, Math.max(1, Math.min(body.limit || 1, 18)));
    } else {
      return new Response(JSON.stringify({
        error: "pass { chapter } or { missing: true }"
      }), {
        status: 400,
        headers: CORS
      });
    }
    if (targets.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        generated: [],
        message: "All 18 chapters already have artwork"
      }), {
        headers: CORS
      });
    }
    // One research policy for the whole run: cache only when it renders more
    // than one chapter (researchMode.ts). Only the { missing: true } branch
    // reaches here without body.chapter.
    const researchOptions = gitaResearchOptions({
      missingPath: !body.chapter && !!body.missing,
      limit: body.limit,
      targetCount: targets.length
    });
    // One background deadline for the whole run: every chapter's check stops
    // starting 360s after the worker started (backgroundDeadline).
    const buildOne = (ch, options)=>buildChapter(ch, options, requestStart);
    const generated = [];
    const errors = [];
    // Chapters not started because the request would be cut at 150s before they
    // could be stored. They are still missing, so the next run picks them up.
    const skipped = [];
    for (const [i, ch] of targets.entries()){
      if (i > 0 && Date.now() > requestStart + REQUEST_BUDGET_MS - CHAPTER_ESTIMATE_MS) {
        skipped.push({
          chapter: ch.n,
          reason: "deadline"
        });
        continue;
      }
      try {
        const built = await buildOne(ch, researchOptions);
        if (built.skipped) skipped.push({
          chapter: ch.n,
          reason: built.skipped
        });
        else generated.push(built);
      } catch (e) {
        errors.push({
          chapter: ch.n,
          error: String(e).slice(0, 200)
        });
      }
    }
    return new Response(JSON.stringify({
      ok: generated.length > 0,
      generated,
      errors,
      skipped
    }), {
      headers: CORS
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: String(err)
    }), {
      status: 500,
      headers: CORS
    });
  }
});
