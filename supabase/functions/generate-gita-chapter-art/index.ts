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
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
// Whole words only (plus simple plural/tense endings). Without word boundaries
// this rewrote "war" INSIDE other words: "warrior" became "blessingrior",
// "battlefield" "blessingfield", "toward" "toblessingd", "warm" "blessingm" —
// 14 stored prompts were sent to the image model with those corrupted words.
const SANITISE_RE = /\b(?:battle|war|fight|weapon|sword|arrow|kill|death|blood|burn|destroy|attack|strike|naked|nude)(?:s|es|ed|ing)?\b/gi;
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
async function buildOne(ch) {
  const { data: cfgRow } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
  const cfg = {
    ...DEFAULTS,
    ...cfgRow || {}
  };
  const brief = await writeSceneAndCaption(ch);
  let full = brief.imagePrompt;
  // Image models are poor at counting, and the renders kept coming back with two
  // or three horses. Restate the count in the image prompt itself whenever the
  // scene involves the chariot — the brief alone did not carry it through.
  if (/chariot|horse|rein/i.test(full)) {
    full += ". The chariot is drawn by exactly four white horses — four horses, no more and no fewer — with a banner bearing Hanuman above it";
  }
  if (cfg.style_positives) full += `, ${cfg.style_positives}`;
  if (cfg.style_negatives) full += `, ${cfg.style_negatives}`;
  if (cfg.extra_rules) full += `. ${cfg.extra_rules}`;
  if (full.length > (cfg.prompt_max_len || 2000)) full = full.slice(0, cfg.prompt_max_len || 2000);
  const sanitized = full.replace(SANITISE_RE, "blessing");
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
    const generated = [];
    const errors = [];
    for (const ch of targets){
      try {
        generated.push(await buildOne(ch));
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
