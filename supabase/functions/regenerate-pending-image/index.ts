// Regenerate the artwork for one ig_pending_review row from an edited prompt.
//
// Lets the reviewer fix a prompt on the review card and re-render it, instead of
// only being able to Approve or Reject. Uses the configuration approved in the
// Image Playground (image_gen_config, is_active = true) so the review card and
// the playground stay in step. The new image replaces the row's image_url and the
// edited prompt is stored in image_prompt.
//
// Scene research: verified canonical visual details for the row's chapter
// (_shared/sceneResearch.ts) go straight after the edited prompt, which is never
// cut to make room for them. Research never blocks a regenerate: if it fails,
// finds nothing, or no fact fits, the prompt is assembled exactly as before.
// Send apply_facts: false to skip research for a request. The draft is usually
// the Instagram caption, so research matches triggers and builds its search
// queries from the draft with the caption's fixed mantra, book reference and
// hashtags removed; the image model still receives the full edited text.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSceneResearch } from "../_shared/sceneResearch.ts";
import { assemblePrompt, inlineKey, normalizeForMatch, sanitizeForImageModel, sceneKey } from "../_shared/sceneResearchCore.ts";
const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const TOGETHER_KEY = Deno.env.get("TOGETHER_API_KEY") || "";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
// ig_pending_review rows are Bhagavatam posts (instagram-post, bulk-generate-images).
const RESEARCH_BOOK = "bhagavatam";
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
  try {
    const res = await fetch(TOGETHER_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOGETHER_KEY}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.log(`[regen] ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return (await res.json())?.data?.[0]?.b64_json || null;
  } catch (e) {
    console.log(`[regen] ${model} error ${e}`);
    return null;
  }
}
// The assembly this function has always used; a regenerate that gets no
// research fact sends exactly this.
function legacyPrompt(prompt, cfg, applyStyle) {
  // apply_style defaults to true: append the approved style so a short edit
  // still renders in house style. Send false to use the prompt verbatim.
  let full = prompt.trim();
  if (applyStyle) {
    if (cfg.style_positives) full += `, ${cfg.style_positives}`;
    if (cfg.style_negatives) full += `, ${cfg.style_negatives}`;
    if (cfg.extra_rules) full += `. ${cfg.extra_rules}`;
  }
  if (full.length > (cfg.prompt_max_len || 2000)) full = full.slice(0, cfg.prompt_max_len || 2000);
  // Whole words only: "warrior", "warm" and "toward" pass through untouched.
  return sanitizeForImageModel(full);
}
// The gallery pre-fills the edit box with image_prompt || caption, and
// image_prompt is NULL until a regenerate completes, so the draft is usually the
// Instagram caption. Every caption carries fixed boilerplate: the Hare Krishna
// maha-mantra, a '📖 Srimad Bhagavatam — Canto x, Chapter y' reference (after
// the summary from instagram-post, before it from bulk-generate-images) and,
// when pasted, hashtags. Left in, it makes every draft "mention" Krishna and
// Rama, so Krishna's canon lands on scenes he is not in and the mantra names go
// into the paid search queries. Research and fact de-duplication see the text
// with that boilerplate removed; the image model still gets the reviewer's full
// text. The summary itself is kept whole, including any Krishna it names.
const CHANT_RUN_RE = /(?<![\p{L}\p{N}])hare(?:[\s,/\-–—]+(?:hare|krishna|krsna|kṛṣṇa|rama|rāma))+(?![\p{L}\p{N}])/giu;
const BOOK_REFERENCE_RE = /(?:📖\s*)?(?:srimad|śrīmad)\s+bh[aā]gavatam\s*[—–:\-]\s*canto\s+\d+\s*,?\s*chapter\s+\d+/giu;
const HASHTAG_RE = /(?<![\p{L}\p{N}_])#[\p{L}\p{N}_]+/gu;
const CAPTION_EMOJI_RE = /[📖🙏]/gu;
function researchTextOf(draft) {
  try {
    return String(draft).normalize("NFC").replace(CHANT_RUN_RE, " ").replace(BOOK_REFERENCE_RE, " ").replace(HASHTAG_RE, " ").replace(CAPTION_EMOJI_RE, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  } catch  {
    return String(draft ?? "").trim();
  }
}
// True when the text has a letter or digit left to research.
function hasResearchableText(text) {
  return /[\p{L}\p{N}]/u.test(text);
}
// Facts already written into the draft are not sent a second time, and
// duplicates collapse to one.
function factsNotInDraft(facts, draft) {
  const hay = ` ${normalizeForMatch(sanitizeForImageModel(draft))} `;
  const seen = new Set();
  return facts.filter((f)=>{
    const k = normalizeForMatch(sanitizeForImageModel(f));
    if (!k || seen.has(k) || hay.includes(` ${k} `)) return false;
    seen.add(k);
    return true;
  });
}
// Edited prompt first, never cut unless it alone exceeds prompt_max_len; facts
// take the room after it, then rules and style. Null when no fact fits, so the
// caller sends the legacy prompt unchanged. researchText is the draft without
// caption boilerplate (researchTextOf); the full draft is what gets sent.
function promptWithFacts(prompt, researchText, facts, cfg, applyStyle) {
  const draft = prompt.trim();
  const fresh = factsNotInDraft(facts, researchText);
  if (fresh.length === 0) return null;
  const { prompt: sent, report } = assemblePrompt({
    scene: draft,
    facts: fresh,
    ...applyStyle ? {
      extraRules: cfg.extra_rules,
      stylePositives: cfg.style_positives,
      styleNegatives: cfg.style_negatives
    } : {}
  }, {
    maxLen: cfg.prompt_max_len || 2000,
    authorEdited: true
  });
  const factsIncluded = fresh.length - report.droppedParts.filter((d)=>d.startsWith("facts[")).length;
  return factsIncluded > 0 ? {
    sent,
    factsIncluded
  } : null;
}
function wholeNumber(v, min) {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min ? n : null;
}
// Keyed from the row's own columns. The table has no scene_index column, so a
// post made from a pre-extracted scene cannot recover its '<book>:g<n>:s<i>'
// key and the chapter's inline key is used (scene_index is honoured if added).
// Never throws: any failure means no research, and the regenerate goes ahead.
async function researchRow(row, draft) {
  try {
    const g = wholeNumber(row.chapter_global_number, 1);
    if (g === null) return null;
    const idx = wholeNumber(row.scene_index, 0);
    return await getSceneResearch(supabase, {
      key: idx === null ? inlineKey(RESEARCH_BOOK, g) : sceneKey(RESEARCH_BOOK, g, idx),
      book: RESEARCH_BOOK,
      sceneText: draft,
      title: typeof row.chapter_title === "string" ? row.chapter_title : null
    });
  } catch  {
    return null;
  }
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: CORS
  });
  if (req.method !== "POST") return new Response(JSON.stringify({
    error: "POST only"
  }), {
    status: 405,
    headers: CORS
  });
  if (!TOGETHER_KEY) return new Response(JSON.stringify({
    error: "TOGETHER_API_KEY is not configured"
  }), {
    status: 500,
    headers: CORS
  });
  try {
    const { id, prompt, apply_style, apply_facts } = await req.json();
    if (!id || !prompt || prompt.trim().length < 3) {
      return new Response(JSON.stringify({
        error: "id and prompt are required"
      }), {
        status: 400,
        headers: CORS
      });
    }
    const { data: row, error: fErr } = await supabase.from("ig_pending_review").select("*").eq("id", id).single();
    if (fErr || !row) return new Response(JSON.stringify({
      error: `Pending post ${id} not found`
    }), {
      status: 404,
      headers: CORS
    });
    const { data: cfgRow } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
    const cfg = {
      ...DEFAULTS,
      ...cfgRow || {}
    };
    const applyStyle = apply_style !== false;
    // Verified canonical details for this chapter. With no fact (research failed,
    // found nothing, or none fits) the prompt is exactly the legacy one. Research
    // sees the draft without caption boilerplate (mantra, book reference,
    // hashtags); a draft that is nothing but boilerplate is not researched.
    const researchText = researchTextOf(prompt.trim());
    const researchable = hasResearchableText(researchText);
    const research = apply_facts === false || !researchable ? null : await researchRow(row, researchText);
    let withFacts = null;
    if (research && research.facts.length > 0) {
      try {
        withFacts = promptWithFacts(prompt, researchText, research.facts, cfg, applyStyle);
      } catch  {
        withFacts = null;
      }
    }
    const sanitized = withFacts ? withFacts.sent : legacyPrompt(prompt, cfg, applyStyle);
    const factsIncluded = withFacts ? withFacts.factsIncluded : 0;
    const boilerplateChars = prompt.trim().length - researchText.length;
    console.log(research ? `[regen] research key=${research.key} status=${research.status} facts=${research.facts.length} used=${factsIncluded} ms=${research.ms} boilerplate_chars=${boilerplateChars}` : `[regen] research ${apply_facts === false ? "off" : !researchable ? "skipped (draft is only caption boilerplate)" : "skipped (no key for row)"} #${id}`);
    let b64 = null;
    // These rows are Instagram posts, so they must regenerate at the Instagram
    // aspect from the approved config (ig_width/ig_height, 16:9). Using the
    // generic cfg.width/height produced a PORTRAIT replacement for a LANDSCAPE
    // original, so "Regenerate" silently changed the post's shape.
    const igW = cfg.ig_width || cfg.width;
    const igH = cfg.ig_height || cfg.height;
    for (const a of [
      {
        m: cfg.model,
        w: igW,
        h: igH
      },
      {
        m: cfg.fallback_model || cfg.model,
        w: 1024,
        h: Math.round(1024 * igH / igW)
      }
    ]){
      b64 = await tryGenerate(sanitized, a.m, a.w, a.h, cfg.steps);
      if (b64) break;
    }
    if (!b64) return new Response(JSON.stringify({
      error: "All image attempts failed"
    }), {
      status: 502,
      headers: CORS
    });
    const bytes = Uint8Array.from(atob(b64), (c)=>c.charCodeAt(0));
    const fn = `pending-${id}-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("instagram-images").upload(fn, bytes, {
      contentType: "image/jpeg",
      upsert: true
    });
    if (upErr) return new Response(JSON.stringify({
      error: `Upload failed: ${upErr.message}`
    }), {
      status: 500,
      headers: CORS
    });
    const url = supabase.storage.from("instagram-images").getPublicUrl(fn).data.publicUrl;
    // Remove the superseded image so the bucket does not accumulate drafts.
    if (row.image_path && row.image_path !== fn) {
      try {
        await supabase.storage.from("instagram-images").remove([
          row.image_path
        ]);
      } catch  {}
    }
    const { error: updErr } = await supabase.from("ig_pending_review").update({
      image_url: url,
      image_path: fn,
      image_prompt: prompt.trim(),
      error_message: null
    }).eq("id", id);
    if (updErr) return new Response(JSON.stringify({
      error: `Update failed: ${updErr.message}`
    }), {
      status: 500,
      headers: CORS
    });
    return new Response(JSON.stringify({
      ok: true,
      id,
      image_url: url,
      model_used: cfg.model,
      prompt_chars: sanitized.length,
      research_key: research?.key ?? null,
      research_status: research?.status ?? "skipped",
      facts_included: factsIncluded
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
