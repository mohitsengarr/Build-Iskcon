// Supabase Edge Function: generate-scene-image
//
// Generates artwork for one reader-saved scene (public.reader_scenes).
// The saved text is Hindi prose, so it is first turned into an English VISUAL
// prompt by Claude, then rendered with Together AI using the configuration
// approved in the Image Playground (public.image_gen_config, is_active = true).
// The image is stored in the instagram-images bucket and the row is updated with
// the public URL, so the Gallery flips it from "Not generated" to "Image generated".

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const TOGETHER_KEY = Deno.env.get("TOGETHER_API_KEY") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SANITISE_RE = /battle|war|fight|weapon|sword|arrow|kill|death|blood|burn|destroy|attack|strike|naked|nude/gi;

// Defaults used only when no configuration has been approved yet.
const DEFAULTS = {
  model: "black-forest-labs/FLUX.2-pro", width: 1088, height: 1344, steps: null as number | null,
  style_positives: "museum-quality 19th-century Indian devotional OIL PAINTING on canvas, Raja Ravi Varma 1880-1900 aesthetic, VISIBLE oil-paint brushstrokes, warm saffron palette, soft golden-hour lighting",
  style_negatives: "NOT cartoon, NOT anime, NOT CGI, NOT 3D render, NOT digital illustration, NOT Pixar style, NOT plastic shiny skin, NOT photo-realistic",
  extra_rules: "ALL adult male characters MUST look distinctly MASCULINE with beards where appropriate. Vedic era only — NO glasses, NO modern clothing, NO modern technology.",
  prompt_max_len: 2000,
  fallback_model: "black-forest-labs/FLUX.1.1-pro", fallback_width: 768, fallback_height: 1024,
};

async function scenePromptFromText(passage: string, book: string): Promise<string> {
  if (!ANTHROPIC_KEY) return passage.slice(0, 400);
  const sys = "You turn a passage of Hindi scripture into ONE English prompt for a devotional oil painting. Reply with the prompt only — no preamble, no quotes. Describe WHO is present (label each as MALE or FEMALE), what they are doing, and the setting. Keep it under 90 words. Peaceful imagery only.";
  try {
    const r = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5", max_tokens: 400, system: sys,
        messages: [{ role: "user", content: `Book: ${book}\n\nPassage:\n${passage.slice(0, 1500)}` }],
      }),
    });
    const j = await r.json();
    const t = j?.content?.[0]?.text;
    return (typeof t === "string" && t.trim()) ? t.trim() : passage.slice(0, 400);
  } catch { return passage.slice(0, 400); }
}

async function tryGenerate(prompt: string, model: string, w: number, h: number, steps: number | null) {
  const payload: Record<string, unknown> = { model, prompt, width: w, height: h, n: 1, response_format: "b64_json" };
  if (steps && steps > 0) payload.steps = steps;
  try {
    const res = await fetch(TOGETHER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_KEY}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { console.log(`[scene] ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return null; }
    return (await res.json())?.data?.[0]?.b64_json || null;
  } catch (e) { console.log(`[scene] ${model} error ${e}`); return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  if (!TOGETHER_KEY) return new Response(JSON.stringify({ error: "TOGETHER_API_KEY is not configured" }), { status: 500, headers: CORS });

  try {
    const { scene_id } = await req.json() as { scene_id: number };
    if (!scene_id) return new Response(JSON.stringify({ error: "scene_id is required" }), { status: 400, headers: CORS });

    const { data: scene, error: fErr } = await supabase.from("reader_scenes").select("*").eq("id", scene_id).single();
    if (fErr || !scene) return new Response(JSON.stringify({ error: `Scene ${scene_id} not found` }), { status: 404, headers: CORS });

    await supabase.from("reader_scenes").update({ status: "generating", error_message: null }).eq("id", scene_id);

    // Use the configuration approved in the playground.
    const { data: cfgRow } = await supabase.from("image_gen_config").select("*").eq("is_active", true).limit(1).maybeSingle();
    const cfg = { ...DEFAULTS, ...(cfgRow || {}) } as typeof DEFAULTS;

    const visual = await scenePromptFromText(scene.selected_text, scene.book);
    let full = visual;
    if (cfg.style_positives) full += `, ${cfg.style_positives}`;
    if (cfg.style_negatives) full += `, ${cfg.style_negatives}`;
    if (cfg.extra_rules) full += `. ${cfg.extra_rules}`;
    if (full.length > (cfg.prompt_max_len || 2000)) full = full.slice(0, cfg.prompt_max_len || 2000);
    const sanitized = full.replace(SANITISE_RE, "blessing");

    const attempts = [
      { m: cfg.model, w: cfg.width, h: cfg.height },
      { m: cfg.fallback_model || cfg.model, w: cfg.fallback_width || cfg.width, h: cfg.fallback_height || cfg.height },
    ];
    let b64: string | null = null;
    for (const a of attempts) {
      b64 = await tryGenerate(sanitized, a.m, a.w, a.h, cfg.steps);
      if (b64) break;
    }
    if (!b64) {
      await supabase.from("reader_scenes").update({ status: "failed", error_message: "All image attempts failed" }).eq("id", scene_id);
      return new Response(JSON.stringify({ error: "All image attempts failed" }), { status: 502, headers: CORS });
    }

    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const fn = `scene-${scene_id}-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("instagram-images").upload(fn, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) {
      await supabase.from("reader_scenes").update({ status: "failed", error_message: `upload: ${upErr.message}` }).eq("id", scene_id);
      return new Response(JSON.stringify({ error: `Upload failed: ${upErr.message}` }), { status: 500, headers: CORS });
    }
    const url = supabase.storage.from("instagram-images").getPublicUrl(fn).data.publicUrl;

    await supabase.from("reader_scenes").update({
      image_generated: true, image_url: url, image_prompt: sanitized,
      status: "generated", generated_at: new Date().toISOString(), error_message: null,
    }).eq("id", scene_id);

    return new Response(JSON.stringify({ ok: true, scene_id, image_url: url, image_prompt: sanitized, model_used: cfg.model }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
