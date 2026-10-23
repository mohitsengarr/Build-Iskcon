// Supabase Edge Function: krishna-check
//
// Checks one review row's picture for Krishna (_shared/krishnaCheck.ts) and says
// whether it may go to Instagram or Threads. The posting paths run the same check
// themselves; this lets the queue be checked ahead of time and lets the gallery
// show why a post is held back. A row already checked for its current image is
// answered from the stored record, so asking again costs nothing.
//
// POST { table: "ig_pending_review" | "gita_chapter_art_review" | "chaitanya_chapter_art_review", id }
//   → { id, table, allowed, reason, krishna_check }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { KRISHNA_TABLES, krishnaGate, type KrishnaTable } from "../_shared/krishnaCheck.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const table = body?.table;
    const id = body?.id;
    if (!(KRISHNA_TABLES as readonly string[]).includes(table)) {
      return new Response(JSON.stringify({ error: `table must be one of ${KRISHNA_TABLES.join(", ")}` }), { status: 400, headers: CORS });
    }
    if (!Number.isInteger(id)) return new Response(JSON.stringify({ error: "id must be a whole number" }), { status: 400, headers: CORS });
    const { data: row, error } = await supabase.from(table).select("id, status, image_path, image_url, krishna_check").eq("id", id).maybeSingle();
    if (error) return new Response(JSON.stringify({ error: `could not read the row: ${error.message}` }), { status: 500, headers: CORS });
    if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: CORS });
    const gate = await krishnaGate({ supabase, table: table as KrishnaTable, row });
    return new Response(JSON.stringify({ id, table, status: row.status, allowed: gate.allowed, reason: gate.reason, krishna_check: gate.check }), {
      status: gate.check ? 200 : 502,
      headers: CORS,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
