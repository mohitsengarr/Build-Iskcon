// Supabase Edge Function: watermark-image
//
// Lays the Bhaktigram mark over an image (_shared/watermark.ts) and returns it as
// JPEG, with x-watermark: marked (or unmarked) and x-watermark-ms. It stores
// nothing: the generators send each image they drew here and store what comes
// back (_shared/watermarkClient.ts), so marking never spends their CPU budget.
//
// POST <JPEG bytes> (Content-Type: image/*)   the image to mark
// POST { url: "<this project>/storage/v1/object/public/<bucket>/<file>" }
//                                             one of our stored images, to check the mark

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isOwnStorageUrl, watermarkBytes } from "../_shared/watermark.ts";

const STORAGE_PREFIX = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/`;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-watermark, x-watermark-ms",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  let original: Uint8Array;
  if ((req.headers.get("content-type") ?? "").startsWith("image/")) {
    original = new Uint8Array(await req.arrayBuffer());
  } else {
    const { url } = await req.json().catch(() => ({}));
    if (!isOwnStorageUrl(url, STORAGE_PREFIX)) {
      return new Response(JSON.stringify({ error: "send image bytes, or a url of an image in this project's public storage" }), { status: 400, headers: CORS });
    }
    const res = await fetch(url);
    if (!res.ok) return new Response(JSON.stringify({ error: `could not read the image (HTTP ${res.status})` }), { status: 502, headers: CORS });
    original = new Uint8Array(await res.arrayBuffer());
  }
  const started = performance.now();
  const { bytes, marked } = await watermarkBytes(original);
  const ms = Math.round(performance.now() - started);
  return new Response(bytes, {
    headers: { ...CORS, "Content-Type": "image/jpeg", "x-watermark": marked ? "marked" : "unmarked", "x-watermark-ms": String(ms) },
  });
});
