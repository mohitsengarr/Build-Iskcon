// Supabase Edge Function: regenerate-chapter-art
//
// Re-renders a chapter cover from an EDITED prompt, for any of the three review
// queues (Bhagavatam, Chaitanya, Gita). Without this a near-miss cover could only
// be approved as-is or rejected — and rejecting re-rolls the same prompt blindly.
//
// Uses the configuration approved in the Image Playground. Covers take
// cover_width/cover_height (wide landscape): the shared width/height is the
// PORTRAIT scene size, and regenerating at that size would silently change the
// aspect of a cover relative to how bulk generation makes it.
//
// POST { book: "bhagavatam"|"chaitanya"|"gita", id: 45, prompt: "...", apply_style?: bool }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const TOGETHER_KEY = Deno.env.get("TOGETHER_API_KEY") || "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SANITISE_RE = /battle|war|fight|weapon|sword|arrow|kill|death|blood|burn|destroy|attack|strike|naked|nude/gi;

const BOOKS: Record<string, { table: string; bucket: string; prefix: string }> = {
  bhagavatam: { table: "bhagavatam_chapter_art_review", bucket: "instagram-images",    prefix: "art" },
  chaitanya:  { table: "chaitanya_chapter_art_review",  bucket: "chaitanya-art-images", prefix: "art-cc" },
  gita:       { table: "gita_chapter_art_review",       bucket: "instagram-images",    prefix: "gita" },
};

const DEFAULTS = {
  model: "black-forest-labs/FLUX.2-pro", width: 1088, height: 1344, steps: null as number | null,
  cover_width: 1344 as number | null, cover_height: 1088 as number | null,
  style_positives: "museum-quality 19th-century Indian devotional OIL PAINTING on canvas, Raja Ravi Varma 1880-1900 aesthetic, VISIBLE oil-paint brushstrokes, warm saffron palette, soft golden-hour lighting",
  style_negatives: "NOT cartoon, NOT anime, NOT CGI, NOT 3D render, NOT digital illustration, NOT Pixar style, NOT plastic shiny skin, NOT photo-realistic",
  extra_rules: "ALL adult male characters MUST look distinctly MASCULINE with beards where appropriate. Vedic era only — NO glasses, NO modern clothing, NO modern technology.",
  prompt_max_len: 2000,
  fallback_model: "black-forest-labs/FLUX.1.1-pro", fallback_width: 1024, fallback_height: 832,
};

async function tryGenerate(prompt: string, model: string, w: number, h: number, steps: number | null) {
  const payload: Record<string, unknown> = { model, prompt, width: w, height: h, n: 1, response_format: "b64_json" };
  if (steps && steps > 0) payload.steps = steps;
  const res = await fetch(TOGETHER_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_KEY}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) { console.log(`[regen-chapter] ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return null; }
  return (await res.json())?.data?.[0]?.b64_json || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  if (!TOGETHER_KEY) return new Response(JSON.stringify({ error: "TOGETHER_API_KEY is not configured" }), { status: 500, headers: CORS });

  try {
    const { book, id, prompt, apply_style } = await req.json() as
      { book: string; id: number; prompt: string; apply_style?: boolean };
    const b = BOOKS[book];
    if (!b) return new Response(JSON.stringify({ error: `book must be one of ${Object.keys(BOOKS).join(", ")}` }), { status: 400, headers: CORS });
    if (!id || !prompt || prompt.trim().length < 3) {
      return new Response(JSON.stringify({ error: "id and prompt are required" }), { status: 400, headers: CORS });
    }

    const { data: row, error: fErr } = await supabase.from(b.table).select("*").eq("id", id).single();
    if (fErr || !row) return new Response(JSON.stringify({ error: `${book} #${id} not found` }), { status: 404, headers: CORS });

    const { data: cfgRow } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
    const cfg = { ...DEFAULTS, ...(cfgRow || {}) } as typeof DEFAULTS;

    // The edited prompt is the author's intent; the style block is boilerplate.
    // Appending style and THEN slicing spent the budget on boilerplate and cut the
    // author's own words off the end — a 2504-char prompt lost ~500 characters
    // silently, and the style never survived either. Spend the budget on the
    // prompt first, then add only as much style as still fits.
    const maxLen = cfg.prompt_max_len || 2000;
    let base = prompt.trim();
    let style = "";
    if (apply_style !== false) {
      if (cfg.style_positives) style += `, ${cfg.style_positives}`;
      if (cfg.style_negatives) style += `, ${cfg.style_negatives}`;
      if (cfg.extra_rules) style += `. ${cfg.extra_rules}`;
    }
    let promptTruncated = false;
    if (base.length > maxLen) {
      // Cut on a word boundary so the tail is not left mid-word.
      const cut = base.slice(0, maxLen);
      const sp = cut.lastIndexOf(" ");
      base = sp > maxLen * 0.8 ? cut.slice(0, sp) : cut;
      promptTruncated = true;
    }
    const room = maxLen - base.length;
    const styleApplied = style.length > 0 && room > 0;
    const styleTruncated = styleApplied && style.length > room;
    const full = styleApplied ? base + style.slice(0, room) : base;
    const sanitized = full.replace(SANITISE_RE, "blessing");

    // Covers are wide landscape — match how bulk generation makes them.
    const w1 = cfg.cover_width  || cfg.width  || 1344;
    const h1 = cfg.cover_height || cfg.height || 1088;
    const w2 = cfg.cover_width ? 1024 : (cfg.fallback_width  || 1024);
    const h2 = cfg.cover_height ? 832  : (cfg.fallback_height || 832);

    let b64: string | null = null;
    for (const a of [
      { m: cfg.model, w: w1, h: h1 },
      { m: cfg.fallback_model || cfg.model, w: w2, h: h2 },
    ]) {
      b64 = await tryGenerate(sanitized, a.m, a.w, a.h, cfg.steps);
      if (b64) break;
    }
    if (!b64) return new Response(JSON.stringify({ error: "All image attempts failed" }), { status: 502, headers: CORS });

    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const fn = `${b.prefix}-regen-${id}-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from(b.bucket).upload(fn, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) return new Response(JSON.stringify({ error: `Upload failed: ${upErr.message}` }), { status: 500, headers: CORS });
    const url = supabase.storage.from(b.bucket).getPublicUrl(fn).data.publicUrl;

    const oldPath = row.image_path as string | null;
    if (oldPath && oldPath !== fn) {
      try { await supabase.storage.from(b.bucket).remove([oldPath]); } catch { /* best effort */ }
    }

    const { error: updErr } = await supabase.from(b.table)
      .update({ image_url: url, image_path: fn, prompt: prompt.trim(), error_message: null })
      .eq("id", id);
    if (updErr) return new Response(JSON.stringify({ error: `Update failed: ${updErr.message}` }), { status: 500, headers: CORS });

    // Report what was actually sent, so a silently-shortened prompt is visible
    // in the UI instead of looking like the edit simply had no effect.
    return new Response(JSON.stringify({
      ok: true, book, id, image_url: url, model_used: cfg.model, size: `${w1}x${h1}`,
      prompt_chars: prompt.trim().length, sent_chars: sanitized.length, max_len: maxLen,
      prompt_truncated: promptTruncated, style_applied: styleApplied, style_truncated: styleTruncated,
    }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
