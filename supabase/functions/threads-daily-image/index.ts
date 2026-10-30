// Supabase Edge Function: threads-daily-image
//
// At least one picture on Threads every day (owner, 2026-10-30). Runs once a day
// on pg_cron after the posting queue (_shared/threadsDaily.ts): when no picture
// went to Threads in the last 24 hours, it runs the posting queue for one post,
// then the daily cover, one at a time, until one is on Threads. Both keep their
// own rules: only pictures with Krishna in them, one post at a time.
//
// POST {}                 check, and post one picture if Threads had none today
// POST { preview: true }  only say whether a picture went to Threads in the last 24 hours

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureDailyThreadsImage } from "../_shared/threadsDaily.ts";
import { postedSince } from "../_shared/socialPostLog.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const postedRecently = () => postedSince(supabase, { service: "threads", since: new Date(Date.now() - DAY_MS).toISOString() });

async function call(fn: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`[threads-daily] ${fn}: HTTP ${res.status} ${text.slice(0, 300)}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.preview === true) {
      return new Response(JSON.stringify({ ok: true, preview: true, threads_picture_in_last_24h: await postedRecently() }), { headers: CORS });
    }
    const out = await ensureDailyThreadsImage({
      postedRecently,
      steps: [
        { name: "posting queue", run: () => call("repost-replaced-posts", {}) },
        { name: "daily cover", run: () => call("daily-approved-art-post", {}) },
      ],
    });
    console.log(`[threads-daily] ${out.outcome}${"via" in out ? ` via ${out.via}` : ""}`);
    return new Response(JSON.stringify({ ok: true, ...out }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
