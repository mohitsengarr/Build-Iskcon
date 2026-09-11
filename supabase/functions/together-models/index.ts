// Lists the image models available on the account's Together AI plan, so the
// Image Playground's model picker reflects what can actually be used rather than
// a hard-coded list. The API key stays server-side.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const KEY = Deno.env.get("TOGETHER_API_KEY") || "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!KEY) return new Response(JSON.stringify({ error: "TOGETHER_API_KEY is not configured" }), { status: 500, headers: CORS });
  try {
    const r = await fetch("https://api.together.xyz/v1/models", { headers: { Authorization: `Bearer ${KEY}` } });
    if (!r.ok) return new Response(JSON.stringify({ error: `Together ${r.status}` }), { status: 502, headers: CORS });
    const all = await r.json();
    const models = (Array.isArray(all) ? all : [])
      .filter((m: { type?: string }) => m?.type === "image")
      .map((m: { id: string; display_name?: string; organization?: string }) => ({
        id: m.id,
        label: m.display_name || m.id.split("/").pop(),
        org: m.organization || m.id.split("/")[0],
      }))
      .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
    return new Response(JSON.stringify({ ok: true, count: models.length, models }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
