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
async function writeSceneAndCaption(ch) {
  const sys = [
    "You write artwork briefs for chapters of the Bhagavad-gita As It Is.",
    "Return ONLY valid JSON, no markdown fence:",
    '{"imagePrompt":"...","caption":"...","hashtags":"..."}',
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
          content: `Chapter ${ch.n}: ${ch.sa} — ${ch.en}`
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
async function tryGenerate(prompt, model, w, h, steps) {
  const payload = {
    model,
    prompt,
    width: w,
    height: h,
    n: 1,
    response_format: "b64_json"
  };
  if (steps && steps > 0) payload.steps = steps;
  const res = await fetch(TOGETHER_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOGETHER_KEY}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    console.log(`[gita-art] ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return (await res.json())?.data?.[0]?.b64_json || null;
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
// The image prompt. With no research facts this is byte-for-byte the prompt the
// function built before research (scene, style, rules, cut to the limit,
// sanitised). With facts, assemblePrompt puts them straight after the scene and
// trims style (negatives first) rather than the scene or the facts.
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
      return { prompt, note: ` sent=${report.sentChars}/${report.maxLen}${report.truncatedScene ? " scene_cut" : ""}${dropped}` };
    } catch {
      // fall through to the pre-research prompt
    }
  }
  let full = scene;
  if (cfg.style_positives) full += `, ${cfg.style_positives}`;
  if (cfg.style_negatives) full += `, ${cfg.style_negatives}`;
  if (cfg.extra_rules) full += `. ${cfg.extra_rules}`;
  if (full.length > maxLen) full = full.slice(0, maxLen);
  return { prompt: sanitizeForImageModel(full), note: "" };
}
async function buildOne(ch, researchOptions) {
  const { data: cfgRow } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
  const cfg = {
    ...DEFAULTS,
    ...cfgRow || {}
  };
  const brief = await writeSceneAndCaption(ch);
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
  const { prompt: sanitized, note } = buildImagePrompt(scene, research.facts, cfg);
  console.log(`[gita-art] research key=${research.key} status=${research.status} facts=${research.facts.length}${research.absent ? ` dropped_absent=${research.absent}` : ""} ms=${research.ms} network=${researchOptions?.allowNetwork === false ? "off" : "on"}${note}`);
  let b64 = null;
  // Chapter COVERS are landscape everywhere else (Bhagavatam and Chaitanya both
  // use cover_width/cover_height). Using the generic cfg.width/height made the
  // Gita the only book with portrait chapter art.
  const cw = cfg.cover_width || cfg.width;
  const chh = cfg.cover_height || cfg.height;
  for (const a of [
    { m: cfg.model, w: cw, h: chh },
    { m: cfg.fallback_model || cfg.model, w: 1024, h: Math.round(1024 * chh / cw) },
  ]) {
    b64 = await tryGenerate(sanitized, a.m, a.w, a.h, cfg.steps);
    if (b64) break;
  }
  if (!b64) throw new Error(`All image attempts failed for chapter ${ch.n}`);
  const bytes = Uint8Array.from(atob(b64), (c)=>c.charCodeAt(0));
  const fn = `gita-ch${ch.n}-${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage.from("instagram-images").upload(fn, bytes, {
    contentType: "image/jpeg",
    upsert: true
  });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const url = supabase.storage.from("instagram-images").getPublicUrl(fn).data.publicUrl;
  const caption = `📖 Bhagavad-gita — Chapter ${ch.n}: ${ch.en}\n\n${brief.caption}\n\n🙏 Hare Krishna Hare Krishna Krishna Krishna Hare Hare\nHare Rama Hare Rama Rama Rama Hare Hare`;
  const { data: row, error: insErr } = await supabase.from("gita_chapter_art_review").insert({
    chapter_number: ch.n,
    chapter_title: `${ch.sa} — ${ch.en}`,
    image_url: url,
    image_path: fn,
    prompt: sanitized,
    caption,
    hashtags: brief.hashtags,
    status: "pending"
  }).select("id").single();
  if (insErr) throw new Error(`Insert failed: ${insErr.message}`);
  return {
    chapter: ch.n,
    id: row?.id,
    image_url: url
  };
}
Deno.serve(async (req)=>{
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
    const generated = [];
    const errors = [];
    for (const ch of targets){
      try {
        generated.push(await buildOne(ch, researchOptions));
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
      errors
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
