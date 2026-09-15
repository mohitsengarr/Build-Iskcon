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

interface RowMeta { chapter_part?: string | null; chapter_in_part?: number | null; chapter_title?: string | null }

async function triggerRegenerate(chapterGlobalNumber: number, rowMeta?: RowMeta): Promise<void> {
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
        chapter_part: rowMeta?.chapter_part ?? null,
        chapter_in_part: rowMeta?.chapter_in_part ?? null,
        chapter_title: rowMeta?.chapter_title ?? null,
        status: "rejected",
        error_message: `auto-regen failed: ${String(detail).substring(0, 400)}`,
      });
    }
  } catch (err) {
    console.error(`Background Chaitanya regen for chapter ${chapterGlobalNumber} failed:`, err);
    try {
      await supabase.from("chaitanya_chapter_art_review").insert({
        chapter_global_number: chapterGlobalNumber,
        chapter_part: rowMeta?.chapter_part ?? null,
        chapter_in_part: rowMeta?.chapter_in_part ?? null,
        chapter_title: rowMeta?.chapter_title ?? null,
        status: "rejected",
        error_message: `auto-regen crashed: ${String(err).substring(0, 400)}`,
      });
    } catch { /* marker write is best-effort */ }
  }
}

// "Reject scene": remember the scene so rotation never picks it again. Scene
// rotation cycles back to the top-ranked scene once every scene has been used,
// which is how a rejected scene kept returning. used_scene_indexes gets it too, so
// the regeneration that follows moves straight on to the next scene.
async function rememberRejectedScene(globalNumber: number, sceneIndex: unknown): Promise<boolean> {
  if (typeof sceneIndex !== "number") return false;
  const { data, error } = await supabase
    .from("chaitanya_chapter_scenes")
    .select("used_scene_indexes, rejected_scene_indexes")
    .eq("chapter_global_number", globalNumber)
    .maybeSingle();
  if (error || !data) {
    console.warn(`rememberRejectedScene ${globalNumber}#${sceneIndex}: ${error?.message || "no scene row"}`);
    return false;
  }
  const add = (list: unknown) => [...new Set([...(Array.isArray(list) ? list as number[] : []), sceneIndex])];
  const { error: upErr } = await supabase
    .from("chaitanya_chapter_scenes")
    .update({ used_scene_indexes: add(data.used_scene_indexes), rejected_scene_indexes: add(data.rejected_scene_indexes) })
    .eq("chapter_global_number", globalNumber);
  if (upErr) console.warn(`rememberRejectedScene ${globalNumber}#${sceneIndex}: ${upErr.message}`);
  return !upErr;
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
    const { id, action } = await req.json() as { id: number; action: "approve" | "reject" | "reject_scene" };
    if (!id || (action !== "approve" && action !== "reject" && action !== "reject_scene")) {
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

    // reject: a new render, moving on to the next scene.
    // reject_scene: the same, and the scene is never used again.
    if (action === "reject" || action === "reject_scene") {
      try { await supabase.storage.from("chaitanya-art-images").remove([row.image_path]); } catch { /* best effort */ }
      const { error: upErr } = await supabase
        .from("chaitanya_chapter_art_review")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (upErr) throw new Error(`Reject update: ${upErr.message}`);
      const sceneRemembered = action === "reject_scene"
        ? await rememberRejectedScene(row.chapter_global_number, row.scene_index)
        : false;

      // @ts-ignore - EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(triggerRegenerate(row.chapter_global_number, row));

      return new Response(JSON.stringify({
        success: true,
        status: "rejected",
        id,
        scene_rejected: action === "reject_scene",
        scene_remembered: sceneRemembered,
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
