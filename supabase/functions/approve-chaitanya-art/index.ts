// Supabase Edge Function: approve-chaitanya-art
//
// Approve / reject a Chaitanya chapter-art review row. Mirrors approve-chapter-art:
// approve flips status, reject deletes the storage file + queues a regen via
// EdgeRuntime.waitUntil (so the HTTP response returns immediately while
// FLUX runs in the background).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function triggerRegenerate(chapterGlobalNumber: number): Promise<void> {
  // The reject flow promises the reviewer "a new pending row in ~30s".
  // Parse the inner result and surface failures: the chapter-mode call
  // returns HTTP 200 with {ok:false} on generation failure, so a bare
  // fetch-and-forget left the reviewer with a deleted image, no new row,
  // and zero trace. On failure we write a rejected marker row with the
  // error so the review UI shows WHY nothing appeared.
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/bulk-generate-chaitanya-art`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({ mode: "chapter", chapter_global_number: chapterGlobalNumber }),
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !data || data.ok === false) {
      const detail = data?.error || `HTTP ${res.status}`;
      console.error(`Chaitanya regen for chapter ${chapterGlobalNumber} did not produce a row: ${detail}`);
      await supabase.from("chaitanya_chapter_art_review").insert({
        chapter_global_number: chapterGlobalNumber,
        status: "rejected",
        error_message: `auto-regen failed: ${String(detail).substring(0, 400)}`,
      });
    }
  } catch (err) {
    console.error(`Background Chaitanya regen for chapter ${chapterGlobalNumber} failed:`, err);
    try {
      await supabase.from("chaitanya_chapter_art_review").insert({
        chapter_global_number: chapterGlobalNumber,
        status: "rejected",
        error_message: `auto-regen crashed: ${String(err).substring(0, 400)}`,
      });
    } catch { /* marker write is best-effort */ }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, authorization, apikey",
      },
    });
  }
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  }

  try {
    const { id, action } = await req.json() as { id: number; action: "approve" | "reject" };
    if (!id || (action !== "approve" && action !== "reject")) {
      return new Response(JSON.stringify({ error: "Missing id or invalid action" }), { status: 400, headers: cors });
    }

    const { data: row, error: fetchErr } = await supabase
      .from("chaitanya_chapter_art_review")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchErr || !row) {
      return new Response(JSON.stringify({ error: `Pending review ${id} not found: ${fetchErr?.message || "missing"}` }), { status: 404, headers: cors });
    }
    if (row.status !== "pending") {
      return new Response(JSON.stringify({ error: `Already ${row.status}`, status: row.status }), { status: 409, headers: cors });
    }

    if (action === "reject") {
      try { await supabase.storage.from("chaitanya-art-images").remove([row.image_path]); } catch { /* best effort */ }
      const { error: upErr } = await supabase
        .from("chaitanya_chapter_art_review")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (upErr) throw new Error(`Reject update: ${upErr.message}`);

      // @ts-ignore - EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(triggerRegenerate(row.chapter_global_number));

      return new Response(JSON.stringify({
        success: true,
        status: "rejected",
        id,
        regeneration: { ok: true, detail: "Regeneration started in background — a new pending row will appear in ~30s." },
        message: "Rejected. New attempt queued — will appear in pending review shortly.",
      }), { headers: cors });
    }

    // action === "approve"
    const { error: upErr } = await supabase
      .from("chaitanya_chapter_art_review")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (upErr) throw new Error(`Approve update: ${upErr.message}`);

    return new Response(JSON.stringify({
      success: true,
      status: "approved",
      id,
      chapter_global_number: row.chapter_global_number,
      image_url: row.image_url,
    }), { headers: cors });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
