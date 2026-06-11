// Supabase Edge Function: approve-chapter-art (v3)
//
// v3 changes:
// - triggerRegenerate now PARSES the inner result. v2 fired-and-forgot: when
//   the chapter-mode generation failed (FLUX rejection, Claude hiccup), the
//   reviewer was promised "a new pending row in ~30s" but got nothing — the
//   image was already deleted and the failure left zero trace. Failures now
//   write a rejected marker row with error_message so the gallery can show
//   WHY nothing appeared.
// - Deployed with verify_jwt (v2 was fully public — anyone on the internet
//   could approve/reject rows with a bare curl). The gallery now sends the
//   anon JWT on every call.
//
// v2: reject fires regeneration via EdgeRuntime.waitUntil (background).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface ReviewRow {
  id: number;
  chapter_global_number: number;
  chapter_canto: number | null;
  chapter_in_canto: number | null;
  chapter_title: string | null;
  image_path: string;
  image_url: string;
  status: string;
}

async function triggerRegenerate(row: ReviewRow): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/bulk-generate-chapter-art`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({ mode: "chapter", chapter_global_number: row.chapter_global_number }),
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; skipped?: boolean; error?: string; message?: string } | null;
    if (!res.ok || !data || data.ok === false) {
      const detail = data?.error || data?.message || `HTTP ${res.status}`;
      console.error(`Chapter-art regen for ${row.chapter_global_number} did not produce a row: ${detail}`);
      await supabase.from("bhagavatam_chapter_art_review").insert({
        chapter_global_number: row.chapter_global_number,
        chapter_canto: row.chapter_canto,
        chapter_in_canto: row.chapter_in_canto,
        chapter_title: row.chapter_title,
        status: "rejected",
        error_message: `auto-regen failed: ${String(detail).substring(0, 400)}`,
      });
    }
  } catch (err) {
    console.error(`Background regen for chapter ${row.chapter_global_number} failed:`, err);
    try {
      await supabase.from("bhagavatam_chapter_art_review").insert({
        chapter_global_number: row.chapter_global_number,
        chapter_canto: row.chapter_canto,
        chapter_in_canto: row.chapter_in_canto,
        chapter_title: row.chapter_title,
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
      .from("bhagavatam_chapter_art_review")
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
      try { await supabase.storage.from("chapter-art-images").remove([row.image_path]); } catch { /* best effort */ }
      const { error: upErr } = await supabase
        .from("bhagavatam_chapter_art_review")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (upErr) throw new Error(`Reject update: ${upErr.message}`);

      // @ts-ignore - EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(triggerRegenerate(row as ReviewRow));

      return new Response(JSON.stringify({
        success: true,
        status: "rejected",
        id,
        regeneration: {
          ok: true,
          detail: "Regeneration started in background — a new pending row will appear in ~30-60s.",
        },
        message: "Rejected. New attempt queued — will appear in pending review shortly.",
      }), { headers: cors });
    }

    // action === "approve"
    const { error: upErr } = await supabase
      .from("bhagavatam_chapter_art_review")
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
