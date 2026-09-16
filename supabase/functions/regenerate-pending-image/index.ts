// Regenerate the artwork for one ig_pending_review row from an edited prompt.
//
// Lets the reviewer fix a prompt on the review card and re-render it, instead of
// only being able to Approve or Reject. Uses the configuration approved in the
// Image Playground (image_gen_config, is_active = true) so the review card and
// the playground stay in step. The new image replaces the row's image_url and the
// edited prompt is stored in image_prompt; the response names the new image_path,
// which the card sends when the reviewer approves or rejects. A post that is no
// longer pending, or that approve-instagram-post holds by a live claim (reviewed_at
// under 10 minutes old, or older with publish_started_at set), keeps its image: the
// request answers 409 with status "reviewed", before any render, or after deleting
// only its new upload when the claim lands mid-render. A dead claim (older than 10
// minutes with no publish_started_at: its request died or failed before publishing)
// does not block a regenerate, and the save clears it.
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
import { backgroundDeadline, checkInBackground, imagePayload, initialRecord, needsBackgroundCheck, runInBackground } from "../_shared/visualCheck.ts";
import { fallbackSizeFor } from "../_shared/imageSizes.ts";
import { renderFailureMessage, renderWithRetry } from "../_shared/togetherRetry.ts";
const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
// Visual check (_shared/visualCheck.ts): the request is cut at 150s, so the new
// image is stored after one render and Claude vision checks it against the
// research facts after the response (EdgeRuntime.waitUntil, until 360s after the
// worker started). A reviewer made this request from the card: a wrong image is
// only flagged there, never re-rendered or swapped under them.
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
async function tryGenerate(prompt, model, w, h, steps, failures) {
  // steps goes only to FLUX models; openai/gpt-image-2 has no steps parameter.
  // No seed is sent, as before: each regenerate is a new draw. A rate-limited
  // post is re-sent by renderWithRetry before this attempt gives up, and why the
  // attempt failed goes into `failures` for the reviewer's message.
  const payload = imagePayload(model, prompt, w, h, {
    steps
  });
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
      console.log(`[regen] ${model} HTTP ${status}: ${body} (${kind}${willRetry ? ", retrying" : ""})`);
    },
    onError: (e)=>{
      console.log(`[regen] ${model} error ${e}`);
    }
  });
  if (!b64 && failure && failures) failures.push(failure);
  return b64;
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
// The research facts the sent prompt really carries, which is what the visual
// check verifies: facts added above, and facts already written into the draft.
// A fact left out for room, or cut off with the draft, was never asked for.
function factsInSentPrompt(facts, sent) {
  const hay = ` ${normalizeForMatch(sent)} `;
  const seen = new Set();
  const out = [];
  for (const f of facts){
    if (typeof f !== "string") continue;
    const k = normalizeForMatch(sanitizeForImageModel(f));
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (hay.includes(` ${k} `)) out.push(f.trim());
  }
  return out;
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
// These rows are Instagram posts, so they regenerate at the Instagram size from
// the approved config (ig_width x ig_height): the generic width x height made a
// PORTRAIT replacement for a LANDSCAPE original, so "Regenerate" silently
// changed the post's shape. The config has no Instagram fallback size
// (fallback_width x fallback_height is the portrait size), so the fallback keeps
// the Instagram shape at that size's scale (fallbackSizeFor: its long side, the
// other side from the post's proportions). With no Instagram size configured:
// width x height and the configured fallback size.
function instagramSizes(cfg) {
  if (cfg.ig_width && cfg.ig_height) {
    const fallback = fallbackSizeFor(cfg.ig_width, cfg.ig_height, cfg.fallback_width, cfg.fallback_height);
    return {
      w: cfg.ig_width,
      h: cfg.ig_height,
      fw: fallback.w,
      fh: fallback.h
    };
  }
  return {
    w: cfg.width,
    h: cfg.height,
    fw: cfg.fallback_width || cfg.width,
    fh: cfg.fallback_height || cfg.height
  };
}
// The visual_check column is missing (migration not applied): PGRST204 or 42703.
function missingColumn(error) {
  return !!error && (error.code === "PGRST204" || error.code === "42703" || /visual_check/.test(error.message ?? ""));
}
// Never fails the regenerate: a file left behind only costs storage.
async function removeImage(path) {
  try {
    await supabase.storage.from("instagram-images").remove([
      path
    ]);
  } catch  {}
}
// A claim (reviewed_at) older than CLAIM_STALE_MS with no publish marker
// (publish_started_at) is dead. approve-instagram-post stamps reviewed_at before it
// publishes or deletes a post's image and sets publish_started_at right before it
// publishes; no request runs 10 minutes, so the request that left such a claim died,
// or failed, before it published or deleted anything, and approve-instagram-post
// takes it over. A dead claim does not stop a regenerate. A fresh claim, or a stale
// one with the marker (the post may already be on Instagram), is live and does.
// Keep it equal to CLAIM_STALE_MS in approve-instagram-post.
const CLAIM_STALE_MS = 10 * 60 * 1000;
function claimAgeMs(row, now) {
  const claimedAt = row && row.reviewed_at != null ? Date.parse(row.reviewed_at) : NaN;
  return Number.isFinite(claimedAt) ? now - claimedAt : NaN;
}
function isDeadClaim(row, now) {
  return !!row && row.publish_started_at == null && claimAgeMs(row, now) > CLAIM_STALE_MS;
}
// Why a regenerate must keep this post's image, or null when it may replace it: the
// post is no longer pending, or a live claim holds it, so its image may be
// publishing or already deleted.
function reviewedReason(id, row, now) {
  if (row.status !== "pending") return `Pending post ${id} was already ${row.status}; its image was not regenerated`;
  if (row.reviewed_at == null || isDeadClaim(row, now)) return null;
  if (row.publish_started_at != null && claimAgeMs(row, now) > CLAIM_STALE_MS) {
    return `An approval of pending post ${id} started publishing it at ${row.publish_started_at} and did not finish; its image was not regenerated. Check Instagram before approving it again`;
  }
  return `Pending post ${id} is being approved or rejected, so its image was not regenerated. If it is still pending 10 minutes after that started, regenerate it again`;
}
// Saves the new image over the one the row holds, by a compare-and-swap on
// image_path (.is null when the row has none), never by id alone: the daily post's
// background redo (instagram-post) can swap a better image into this row while the
// regenerate researches and renders, and an update by id would leave that file in
// storage with no row pointing at it. The save also needs the post still pending and
// unclaimed (reviewed_at null), so a regenerate never replaces (and then deletes) the
// image of a post being approved or rejected, or already reviewed. A post held by a
// dead claim (isDeadClaim) is saved by a compare-and-swap on that claim still being
// older than CLAIM_STALE_MS with no publish marker, and the save clears reviewed_at.
// On a miss the row is read again: a post no longer pending, or held by a live claim,
// stops the save at once; otherwise the save is retried against the image and the
// claim the row holds now, at most SAVE_TRIES saves in all. Resolves with
// { replaced } (the image_path the save replaced), { error }, { missing } (the row
// is gone), { reviewed } (the post is no longer pending, or a live claim holds it)
// or { changed } (the image changed before every try). No .or() on a PATCH.
const SAVE_TRIES = 3;
async function saveOverStoredImage(id, values, read) {
  let expected = typeof read?.image_path === "string" ? read.image_path : null;
  let deadClaim = isDeadClaim(read, Date.now());
  for(let attempt = 1;; attempt++){
    let update = supabase.from("ig_pending_review").update(deadClaim ? {
      ...values,
      reviewed_at: null
    } : values).eq("id", id).eq("status", "pending");
    update = deadClaim ? update.lt("reviewed_at", new Date(Date.now() - CLAIM_STALE_MS).toISOString()).is("publish_started_at", null) : update.is("reviewed_at", null);
    const { data, error } = await (expected === null ? update.is("image_path", null) : update.eq("image_path", expected)).select("id");
    if (error) return {
      error
    };
    if (Array.isArray(data) && data.length > 0) {
      if (deadClaim) console.log(`[regen] #${id}: cleared a claim older than 10 minutes that never started publishing`);
      return {
        replaced: expected
      };
    }
    const { data: current, error: readErr } = await supabase.from("ig_pending_review").select("image_path,status,reviewed_at,publish_started_at").eq("id", id).maybeSingle();
    if (readErr) return {
      error: readErr
    };
    if (!current) return {
      missing: true
    };
    if (reviewedReason(id, current, Date.now())) return {
      reviewed: true
    };
    if (attempt >= SAVE_TRIES) return {
      changed: true
    };
    expected = typeof current.image_path === "string" ? current.image_path : null;
    deadClaim = current.reviewed_at != null;
  }
}
// Flag only: checks the stored image once after the response and writes the
// result by a compare-and-swap on its file, so a later regenerate that replaced
// the image never gets this image's record. A missing visual_check column or a
// row that moved on is logged and ignored. Call it before the handler returns.
function checkAfterResponse({ id, path, image, facts, record, invocationStart }) {
  runInBackground(checkInBackground({
    b64: image.b64,
    facts,
    imageModel: image.model,
    startedAt: record.started_at,
    deadlineAt: backgroundDeadline(invocationStart),
    writeRecord: async (checked)=>{
      const { data, error } = await supabase.from("ig_pending_review").update({
        visual_check: checked
      }).eq("id", id).eq("image_path", path).select("id");
      if (error) {
        console.warn(`[regen] visual_check not stored for #${id}: ${missingColumn(error) ? "the visual_check column is missing" : error.message}`);
        return false;
      }
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`[regen] visual_check not stored for #${id}: the post no longer holds ${path}`);
        return false;
      }
      return true;
    },
    tag: `regen #${id}`
  }));
}
Deno.serve(async (req)=>{
  const invocationStart = Date.now();
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
    // A post that is no longer pending, or that a live claim holds, keeps its image
    // (reviewedReason): refuse before paying for research and a render. A dead claim
    // does not block, and the save clears it. The save checks all of this again.
    const refusal = reviewedReason(id, row, Date.now());
    if (refusal) return new Response(JSON.stringify({
      error: refusal,
      status: "reviewed"
    }), {
      status: 409,
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
    // One render: the approved model at the Instagram size, then the fallback
    // model, first image wins.
    const size = instagramSizes(cfg);
    let image = null;
    // Why each attempt failed, for this card's chain only.
    const failures = [];
    for (const a of [
      {
        m: cfg.model,
        w: size.w,
        h: size.h
      },
      {
        m: cfg.fallback_model || cfg.model,
        w: size.fw,
        h: size.fh
      }
    ]){
      const out = await tryGenerate(sanitized, a.m, a.w, a.h, cfg.steps, failures);
      if (out) {
        image = {
          b64: out,
          model: a.m
        };
        break;
      }
    }
    // The gallery shows this sentence in its "Regenerate failed" alert, so it says
    // whether to wait and click again or to edit the prompt.
    if (!image) return new Response(JSON.stringify({
      error: renderFailureMessage(failures, "All image attempts failed")
    }), {
      status: 502,
      headers: CORS
    });
    // The check uses the research facts the sent prompt carries (added, or
    // already in the draft); with none it is skipped.
    const checkFacts = research ? factsInSentPrompt(research.facts, sanitized) : [];
    const b64 = image.b64;
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
    // Stored with the new image before any check: skipped when nothing can be
    // checked, otherwise "running" until the background check writes its result.
    const visualCheck = initialRecord({
      factsUsed: checkFacts,
      safeFallback: false,
      imageModel: image.model,
      startedAt: Date.now()
    });
    const saved = {
      image_url: url,
      image_path: fn,
      image_prompt: prompt.trim(),
      error_message: null
    };
    let recordStored = true;
    let save = await saveOverStoredImage(id, {
      ...saved,
      visual_check: visualCheck
    }, row);
    if (save.error && /visual_check/.test(save.error.message)) {
      // The visual_check column is missing (migration not applied yet): save the
      // new image without the record rather than fail the regenerate.
      console.warn(`[regen] update with visual_check failed (${save.error.message}); saving without it`);
      recordStored = false;
      save = await saveOverStoredImage(id, saved, row);
    }
    if (save.error) return new Response(JSON.stringify({
      error: `Update failed: ${save.error.message}`
    }), {
      status: 500,
      headers: CORS
    });
    if (save.reviewed) {
      // An approval or rejection claimed the post while it was regenerated, or it
      // is no longer pending: no save landed, and the stored image is theirs to
      // publish or delete. Only the new upload goes.
      await removeImage(fn);
      return new Response(JSON.stringify({
        error: `Pending post ${id} was approved or rejected while it was regenerated; the new image was discarded`,
        status: "reviewed"
      }), {
        status: 409,
        headers: CORS
      });
    }
    if (save.missing || save.changed) {
      // No save landed, so no row points at the new file.
      await removeImage(fn);
      return new Response(JSON.stringify({
        error: save.missing ? `Pending post ${id} not found` : `Pending post ${id} changed while it was regenerated; reload the card and try again`
      }), {
        status: save.missing ? 404 : 409,
        headers: CORS
      });
    }
    // Remove the superseded images so the bucket does not accumulate drafts: the
    // one the save replaced and, when the daily post's redo swapped in its image
    // meanwhile, the one this request read (the redo keeps a file it replaces).
    // Only now: a failed update must never leave the row pointing at a deleted file.
    for (const old of new Set([
      save.replaced,
      row.image_path
    ])){
      if (typeof old === "string" && old && old !== fn) await removeImage(old);
    }
    // Started before the response; the check runs after it. With no
    // visual_check column there is nowhere to keep a result.
    if (needsBackgroundCheck(visualCheck)) {
      if (recordStored) checkAfterResponse({
        id,
        path: fn,
        image,
        facts: checkFacts,
        record: visualCheck,
        invocationStart
      });
      else console.warn(`[regen] visual check not started for #${id}: the visual_check column is missing`);
    }
    return new Response(JSON.stringify({
      ok: true,
      id,
      image_url: url,
      // The gallery keeps it on the card: Approve and Reject send it.
      image_path: fn,
      model_used: cfg.model,
      prompt_chars: sanitized.length,
      research_key: research?.key ?? null,
      research_status: research?.status ?? "skipped",
      facts_included: factsIncluded,
      visual_check: visualCheck
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
