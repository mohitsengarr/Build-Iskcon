// Supabase Edge Function: image-playground
//
// Test-bench for image generation. Builds the FULL prompt exactly the way the
// production generator does, calls Together AI once with the caller's settings,
// and returns BOTH the image and the exact request payload that was sent — so
// the configuration can be inspected and tuned before it is approved for use.
//
// It never writes to the gallery and never approves anything: it only generates
// a sample and echoes the request. Approving a configuration is a separate write
// to public.image_gen_config from the client.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const TOGETHER_KEY = Deno.env.get("TOGETHER_API_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Same sanitiser the production generator applies — FLUX rejects violent wording.
const SANITISE_RE = /battle|war|fight|weapon|sword|arrow|kill|death|blood|burn|destroy|attack|strike|naked|nude/gi;

interface Body {
  scene_prompt?: string;
  model?: string;
  width?: number;
  height?: number;
  steps?: number | null;
  style_positives?: string;
  style_negatives?: string;
  extra_rules?: string;
  prompt_max_len?: number;
  sanitize?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  if (!TOGETHER_KEY) return new Response(JSON.stringify({ error: "TOGETHER_API_KEY is not configured" }), { status: 500, headers: CORS });

  let body: Body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: CORS }); }

  const scene = (body.scene_prompt || "").trim();
  if (scene.length < 3) return new Response(JSON.stringify({ error: "scene_prompt is required" }), { status: 400, headers: CORS });

  const model = body.model || "black-forest-labs/FLUX.2-pro";
  const width = Number(body.width) || 1088;
  const height = Number(body.height) || 1344;
  const maxLen = Number(body.prompt_max_len) || 2000;
  const positives = body.style_positives || "";
  const negatives = body.style_negatives || "";
  const extra = body.extra_rules || "";

  // Assemble the final prompt the same way production does.
  let fullPrompt = scene;
  if (positives) fullPrompt += `, ${positives}`;
  if (negatives) fullPrompt += `, ${negatives}`;
  if (extra) fullPrompt += `. ${extra}`;
  if (fullPrompt.length > maxLen) fullPrompt = fullPrompt.slice(0, maxLen);
  const sanitized = body.sanitize === false ? fullPrompt : fullPrompt.replace(SANITISE_RE, "blessing");

  // The exact payload posted to Together AI — echoed back for inspection.
  const payload: Record<string, unknown> = {
    model,
    prompt: sanitized,
    width,
    height,
    n: 1,
    response_format: "b64_json",
  };
  if (body.steps != null && Number(body.steps) > 0) payload.steps = Number(body.steps);

  const startedAt = Date.now();
  let imageB64: string | null = null;
  let apiError: string | null = null;
  let httpStatus = 0;

  try {
    const res = await fetch(TOGETHER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_KEY}` },
      body: JSON.stringify(payload),
    });
    httpStatus = res.status;
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      const e = (json as { error?: { message?: string } }).error;
      apiError = e?.message || JSON.stringify(json).slice(0, 400);
    } else {
      imageB64 = (json as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json ?? null;
      if (!imageB64) apiError = "Together returned no image data";
    }
  } catch (err) {
    apiError = String(err);
  }

  return new Response(JSON.stringify({
    ok: !!imageB64,
    // Everything that was sent, so the caller can see the full configuration.
    request: { endpoint: TOGETHER_API, method: "POST", payload },
    prompt_chars: sanitized.length,
    sanitized_changed: sanitized !== fullPrompt,
    http_status: httpStatus,
    elapsed_ms: Date.now() - startedAt,
    error: apiError,
    image_b64: imageB64,
  }), { headers: CORS });
});
