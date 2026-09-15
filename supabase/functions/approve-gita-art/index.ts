// Supabase Edge Function: approve-gita-art
//
// Review actions for the Bhagavad-gita chapter covers, the Gita's counterpart of
// approve-chapter-art and approve-chaitanya-art. The gallery used to write these
// rows straight from the browser, so gita_chapter_art_review had to accept writes
// from anyone holding the public key, and approved rows feed the daily social
// post. Review writes now come through here with the service role.
//
// POST { id, action: "approve" }       status approved.
// POST { id, action: "reject_scene" }  status rejected and scene_rejected, then a
//   new cover for the chapter is generated in the background. The generator's
//   brief lists every scene rejected this way and asks for a different moment.
//
// Re-rendering the same scene is regenerate-chapter-art (book "gita"), not this.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TABLE = "gita_chapter_art_review";
const BUCKET = "instagram-images";

const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface GitaRow {
  id: number;
  chapter_number: number;
  image_path: string | null;
  status: string;
}

// Runs after the response. A failure is written to the rejected row's
// error_message, so the reason is on record even though no new card appears.
async function generateReplacement(row: GitaRow): Promise<void> {
  let detail: string | null = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-gita-chapter-art`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({ chapter: row.chapter_number }),
    });
    const data = await res.json().catch(() => null) as
      { ok?: boolean; error?: string; errors?: Array<{ error?: string }>; skipped?: unknown[] } | null;
    // skipped: the chapter already has a cover awaiting review, which is the goal.
    const skipped = Array.isArray(data?.skipped) && data.skipped.length > 0;
    if (!res.ok || !data || (data.ok === false && !skipped)) {
      detail = data?.errors?.[0]?.error || data?.error || `HTTP ${res.status}`;
    }
  } catch (err) {
    detail = String(err);
  }
  if (detail) {
    console.error(`[approve-gita-art] chapter ${row.chapter_number} replacement failed: ${detail}`);
    await supabase.from(TABLE)
      .update({ error_message: `auto-regen failed: ${String(detail).substring(0, 400)}` })
      .eq("id", row.id);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  }

  try {
    const { id, action } = await req.json().catch(() => ({})) as { id?: number; action?: string };
    if (!id || (action !== "approve" && action !== "reject_scene")) {
      return new Response(JSON.stringify({ error: "Missing id or invalid action" }), { status: 400, headers: cors });
    }

    const { data: row, error: fetchErr } = await supabase
      .from(TABLE)
      .select("id, chapter_number, image_path, status")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr || !row) {
      return new Response(JSON.stringify({ error: `Gita cover ${id} not found${fetchErr ? `: ${fetchErr.message}` : ""}` }), { status: 404, headers: cors });
    }
    if (row.status !== "pending") {
      return new Response(JSON.stringify({ error: `Already ${row.status}`, status: row.status }), { status: 409, headers: cors });
    }

    const reviewedAt = new Date().toISOString();

    if (action === "approve") {
      // The status filter makes a double click a no-op rather than a second write.
      const { data: updated, error } = await supabase.from(TABLE)
        .update({ status: "approved", reviewed_at: reviewedAt })
        .eq("id", id).eq("status", "pending")
        .select("id");
      if (error) throw new Error(`Approve update: ${error.message}`);
      if (!updated?.length) {
        return new Response(JSON.stringify({ error: "Already reviewed" }), { status: 409, headers: cors });
      }
      return new Response(JSON.stringify({ success: true, status: "approved", id }), { headers: cors });
    }

    // reject_scene
    const { data: updated, error } = await supabase.from(TABLE)
      .update({ status: "rejected", scene_rejected: true, reviewed_at: reviewedAt })
      .eq("id", id).eq("status", "pending")
      .select("id");
    if (error) throw new Error(`Reject update: ${error.message}`);
    if (!updated?.length) {
      return new Response(JSON.stringify({ error: "Already reviewed" }), { status: 409, headers: cors });
    }
    if (row.image_path) {
      try { await supabase.storage.from(BUCKET).remove([row.image_path]); } catch { /* best effort */ }
    }

    // @ts-ignore - EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(generateReplacement(row as GitaRow));

    return new Response(JSON.stringify({
      success: true,
      status: "rejected",
      id,
      scene_rejected: true,
      message: "Scene rejected. A cover showing a different moment is being generated.",
    }), { headers: cors });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
