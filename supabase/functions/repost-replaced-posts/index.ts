// Supabase Edge Function: repost-replaced-posts
//
// The posting queue's worker (_shared/repostQueue.ts): approved Instagram posts
// go out one at a time — new posts first, then reposts of replaced images. Runs
// on pg_cron (job 83, twice a day); each run takes the oldest queued post (limit,
// at most 5) and sends it to Instagram and Threads through approve-instagram-
// post's republish, which keeps each channel's new post id on the post, or why
// it failed.
//
// POST {}                 post the oldest queued post
// POST { limit: 2 }       the oldest two
// POST { preview: true }  list what the next run would post; post nothing

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runRepostQueue } from "../_shared/repostQueue.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

async function republish(id: number, service: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/approve-instagram-post`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    body: JSON.stringify({ id, action: "republish", service }),
  });
  const d = await res.json().catch(() => ({}));
  return { ok: d?.success === true, detail: String(d?.message || d?.error || `HTTP ${res.status}`) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const out = await runRepostQueue({ supabase, republish, limit: body?.limit, preview: body?.preview === true });
    for (const r of out.runs) {
      console.log(`[repost] #${r.id} ${Object.entries(r.channels).map(([s, c]) => `${s}: ${c.ok ? "ok" : c.detail}`).join(", ")}${r.done ? "" : " (stays queued)"}`);
    }
    return new Response(JSON.stringify({ ok: true, preview: body?.preview === true, ...out }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
