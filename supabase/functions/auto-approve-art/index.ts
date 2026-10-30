// Supabase Edge Function: auto-approve-art
//
// Approves ONE waiting Bhaktigram image a run (pg_cron, every 30 minutes), the
// same way a reviewer's Approve does (_shared/autoApprove.ts for which image and
// why). Instagram posts go through approve-instagram-post, which queues them; the
// posting queue then sends one at a time, Krishna pictures only. A cover is
// approved with the same writes as the approve-*-art functions: a replacement is
// copied onto the cover it replaces (_shared/replacements.ts), any other cover
// becomes approved by a compare-and-swap on the image it was checked with.
//
// POST {}                 approve the next eligible image
// POST { preview: true }  say which image would be approved next; approve nothing

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AUTO_APPROVE_TABLES, autoApproveOne, autoApproveRefusal, type Candidate, orderCandidates } from "../_shared/autoApprove.ts";
import { approveReplacement, isReplacement, type ReviewTable } from "../_shared/replacements.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const PER_TABLE = 50;

async function fn(name: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function readCandidates(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const table of AUTO_APPROVE_TABLES) {
    const { data, error } = await supabase.from(table).select("*").eq("status", "pending")
      .order("created_at", { ascending: true }).limit(PER_TABLE);
    if (error) throw new Error(`Reading ${table}: ${error.message}`);
    for (const row of Array.isArray(data) ? data : []) out.push({ table, row });
  }
  return out;
}

const hasMark = async (c: Candidate) => {
  const r = await fn("watermark-image", { check: { url: c.row.image_url } });
  return typeof r.json?.marked === "boolean" ? r.json.marked : null;
};

async function approve(c: Candidate): Promise<{ ok: boolean; detail: string }> {
  const id = c.row.id as number;
  if (c.table === "ig_pending_review") {
    // Claims the post only while it still holds the image that was checked.
    const r = await fn("approve-instagram-post", { id, action: "approve", image_path: c.row.image_path });
    return { ok: r.json?.success === true, detail: String(r.json?.message || r.json?.error || `HTTP ${r.status}`) };
  }
  // The row as it is now: approved only if it still holds the image that was checked.
  const { data: now, error } = await supabase.from(c.table).select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, detail: `could not re-read the row: ${error.message}` };
  if (!now || now.status !== "pending" || now.image_path !== c.row.image_path) return { ok: false, detail: "the row changed meanwhile" };
  if (isReplacement(now)) {
    const result = await approveReplacement(supabase, c.table as ReviewTable, now);
    if ("error" in result) return { ok: false, detail: result.error };
    return { ok: true, detail: "merged" in result ? `replaced #${result.merged}` : "approved" };
  }
  const { data: done, error: upErr } = await supabase.from(c.table)
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending").eq("image_path", c.row.image_path).select("id");
  if (upErr) return { ok: false, detail: upErr.message };
  return Array.isArray(done) && done.length === 1 ? { ok: true, detail: "approved" } : { ok: false, detail: "the row changed meanwhile" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const candidates = await readCandidates();
    if (body?.preview === true) {
      const next = orderCandidates(candidates).find((c) => autoApproveRefusal(c.table, c.row) === null);
      const waiting = candidates.filter((c) => autoApproveRefusal(c.table, c.row) === null).length;
      const held = candidates.length - waiting;
      return new Response(JSON.stringify({ ok: true, preview: true, next: next ? { table: next.table, id: next.row.id } : null, eligible: waiting, left_for_review: held }), { headers: CORS });
    }
    const out = await autoApproveOne({ candidates, hasMark, approve });
    console.log(`[auto-approve] ${out.approved ? `approved ${out.approved.table} #${String(out.approved.id)} (${out.approved.detail})` : "nothing approved"}`);
    for (const s of out.skipped.filter((x) => !x.reason.startsWith("image check"))) console.log(`[auto-approve] skipped ${s.table} #${String(s.id)}: ${s.reason}`);
    return new Response(JSON.stringify({ ok: true, ...out }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
