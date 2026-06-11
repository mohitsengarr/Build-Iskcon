// Supabase Edge Function: sarvam-tts (v1)
//
// Browser-facing proxy for Sarvam's streaming text-to-speech API.
//
// Why: both readers (bhagwatham.tsx / chaitanya.tsx) used to ship the paid
// Sarvam API key INSIDE the client bundle and call api.sarvam.ai directly —
// anyone could lift the key from the JS and burn the quota. The key now
// lives in private_config (service-role-only table); the browser calls this
// function with the public anon key instead, and the secret never leaves
// the server. Rotating the key = updating one DB row.
//
// Abuse limiting: text is capped at 2,000 chars per request (a reader page
// section), non-POST is rejected, and the upstream is pinned — this function
// cannot be used as a general-purpose proxy.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SARVAM_URL = "https://api.sarvam.ai/text-to-speech/stream";
const MAX_TEXT_CHARS = 2_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let cachedKey: string | null = null;
async function getSarvamKey(): Promise<string | null> {
  if (cachedKey) return cachedKey;
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  const r = await fetch(
    `${url}/rest/v1/private_config?key=eq.sarvam_api_key&select=value`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!r.ok) return null;
  const rows = await r.json() as Array<{ value: string }>;
  cachedKey = rows[0]?.value || null;
  return cachedKey;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return new Response(JSON.stringify({ error: "text required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return new Response(JSON.stringify({ error: `text too long (max ${MAX_TEXT_CHARS} chars)` }), {
      status: 413,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const sarvamKey = await getSarvamKey();
  if (!sarvamKey) {
    return new Response(JSON.stringify({ error: "TTS key not configured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(SARVAM_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": sarvamKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Sarvam request failed", detail: String(err) }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Stream the upstream body straight through (audio chunks), preserving
  // status and content type so the readers' existing handling is unchanged.
  const headers = new Headers(CORS_HEADERS);
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  return new Response(upstream.body, { status: upstream.status, headers });
});
