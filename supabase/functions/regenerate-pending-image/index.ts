// Regenerate the artwork for one ig_pending_review row from an edited prompt.
//
// Lets the reviewer fix a prompt on the review card and re-render it, instead of
// only being able to Approve or Reject. Uses the configuration approved in the
// Image Playground (image_gen_config, is_active = true) so the review card and
// the playground stay in step. The new image replaces the row's image_url and the
// edited prompt is stored in image_prompt.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const TOGETHER_KEY = Deno.env.get("TOGETHER_API_KEY") || "";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const SANITISE_RE = /battle|war|fight|weapon|sword|arrow|kill|death|blood|burn|destroy|attack|strike|naked|nude/gi;
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
    const { id, prompt, apply_style } = await req.json();
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
    // apply_style defaults to true: append the approved style so a short edit
    // still renders in house style. Send false to use the prompt verbatim.
    let full = prompt.trim();
    if (apply_style !== false) {
      if (cfg.style_positives) full += `, ${cfg.style_positives}`;
      if (cfg.style_negatives) full += `, ${cfg.style_negatives}`;
      if (cfg.extra_rules) full += `. ${cfg.extra_rules}`;
    }
    if (full.length > (cfg.prompt_max_len || 2000)) full = full.slice(0, cfg.prompt_max_len || 2000);
    const sanitized = full.replace(SANITISE_RE, "blessing");
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
      prompt_chars: sanitized.length
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
