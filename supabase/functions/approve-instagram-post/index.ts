// Supabase Edge Function: approve-instagram-post (v8)
//
// v8 changes:
// - APPROVAL DECOUPLED FROM PUBLISHING. v7 returned 502 and left the post
//   `pending` whenever Buffer couldn't publish — so a Buffer outage (e.g. an
//   unauthorized API token) blocked ALL approvals, including the ones that only
//   feed the in-app Bhaktigram feed/gallery and don't need Buffer at all. Now
//   Approve always marks the post approved; Buffer publishing is best-effort and
//   any failure is recorded as a non-fatal note (error_message), not a block.
// - Buffer GraphQL errors are now surfaced. bufferGQL only checked the HTTP
//   status, so a 200-with-FORBIDDEN ("Not authorized to access this resource")
//   was mislabelled as "no channels connected". The real cause is now reported.
//
// v7 changes:
// - REJECT REGEN NOW RUNS IN THE BACKGROUND (EdgeRuntime.waitUntil). v6
//   awaited the full regeneration inline — Claude caption + FLUX image takes
//   30-90s, so the reject button hung for the whole duration and the edge
//   call sometimes timed out: rejected row + deleted image, but no new
//   pending row and no trace. Now the reject returns instantly and the
//   gallery's poller picks up the new row; if the background regen fails,
//   the failure is written onto the rejected row's error_message.
// - Deployed with verify_jwt. v6 was FULLY PUBLIC — anyone on the internet
//   could approve a pending post (publishing to the real Instagram/Threads
//   accounts!) with a bare curl. The gallery now sends the anon JWT.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUFFER_API = "https://api.buffer.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUFFER_KEY = Deno.env.get("BUFFER_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function bufferGQL(q: string, v?: Record<string, unknown>) {
  const r = await fetch(BUFFER_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${BUFFER_KEY}` },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`Buffer HTTP ${r.status}: ${body.substring(0, 500)}`);
  try { return JSON.parse(body); }
  catch { throw new Error(`Buffer returned non-JSON: ${body.substring(0, 200)}`); }
}

interface BufferChannel { id: string; service: string; name?: string }

async function queueToBuffer(imgUrl: string, caption: string, hashtags: string): Promise<{
  results: Array<{ service: string; postId: string }>;
  errors: Array<{ service: string; channelId: string; error: string }>;
}> {
  const cr = await bufferGQL(`query { account { organizations { channels { id name service } } } }`);
  // Buffer returns HTTP 200 even when the API token is unauthorized — the real
  // cause arrives as a GraphQL `errors` entry (e.g. FORBIDDEN "Not authorized
  // to access this resource"), which nulls `account`. Surface that instead of
  // the misleading "no channels connected".
  const gqlErrors: string[] = ((cr?.errors || []) as Array<{ message?: string }>).map(e => e?.message).filter(Boolean) as string[];
  if (gqlErrors.length > 0 && !cr?.data?.account) {
    throw new Error(`Buffer authorization failed: ${gqlErrors.join("; ")} — re-authorize the Buffer API token at https://publish.buffer.com`);
  }
  const chs: BufferChannel[] = [];
  for (const o of cr?.data?.account?.organizations || []) {
    for (const c of o.channels || []) {
      if (c.service === "instagram" || c.service === "threads") chs.push(c);
    }
  }
  if (chs.length === 0) {
    const why = gqlErrors.length > 0 ? ` (${gqlErrors.join("; ")})` : "";
    throw new Error(`No Instagram/Threads channels available in Buffer${why}. Reconnect/re-authorize at https://publish.buffer.com`);
  }
  const results: Array<{ service: string; postId: string }> = [];
  const errors: Array<{ service: string; channelId: string; error: string }> = [];
  for (const ch of chs) {
    let fc = `${caption}\n\n${hashtags}`;
    if (ch.service === "threads" && fc.length > 500) fc = fc.substring(0, 497) + "...";
    const input: Record<string, unknown> = {
      text: fc,
      channelId: ch.id,
      schedulingType: "automatic",
      mode: "shareNow",
      assets: [{ image: { url: imgUrl } }],
    };
    if (ch.service === "instagram") {
      input.metadata = { instagram: { type: "post", shouldShareToFeed: true } };
    }
    try {
      const r = await bufferGQL(
        `mutation CreatePost($input: CreatePostInput!) {
          createPost(input: $input) {
            __typename
            ... on PostActionSuccess { post { id status } }
            ... on MutationError { message }
          }
        }`,
        { input },
      );
      const gqlErr = (r?.errors || []).map((e: { message?: string }) => e.message).filter(Boolean).join("; ");
      if (gqlErr) { errors.push({ service: ch.service, channelId: ch.id, error: `GraphQL: ${gqlErr}` }); continue; }
      const payload = r?.data?.createPost;
      const tn = payload?.__typename;
      if (tn === "PostActionSuccess" && payload?.post?.id) {
        results.push({ service: ch.service, postId: payload.post.id });
      } else if (tn === "MutationError") {
        errors.push({ service: ch.service, channelId: ch.id, error: `Buffer: ${payload?.message || "unknown"}` });
      } else {
        errors.push({ service: ch.service, channelId: ch.id, error: `Unexpected: ${JSON.stringify(payload).substring(0, 200)}` });
      }
    } catch (err) {
      errors.push({ service: ch.service, channelId: ch.id, error: String(err) });
    }
  }
  return { results, errors };
}

async function triggerRegenerate(chapterGlobalNumber: number): Promise<{ ok: boolean; detail: string; pendingId?: number }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/instagram-post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({ chapter_global_number: chapterGlobalNumber }),
    });
    const data = await res.json();
    if (data?.success) {
      return { ok: true, detail: `New pending review #${data.pendingReviewId} created`, pendingId: data.pendingReviewId };
    }
    if (data?.skipped) {
      return { ok: false, detail: data.reason || "Generation skipped" };
    }
    return { ok: false, detail: data?.error || `instagram-post returned ${res.status}` };
  } catch (err) {
    return { ok: false, detail: String(err) };
  }
}

// Background wrapper: run the (slow) regeneration after the reject response
// has already returned; surface failures on the rejected row so the reviewer
// can see WHY no new pending row appeared.
async function regenInBackground(rejectedId: number, chapterGlobalNumber: number): Promise<void> {
  const regen = await triggerRegenerate(chapterGlobalNumber);
  if (!regen.ok) {
    console.error(`IG regen for chapter ${chapterGlobalNumber} failed: ${regen.detail}`);
    try {
      await supabase
        .from("ig_pending_review")
        .update({ error_message: `auto-regen failed: ${regen.detail.substring(0, 400)}` })
        .eq("id", rejectedId);
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
  const corsHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  try {
    const { id, action } = await req.json() as { id: number; action: "approve" | "reject" };
    if (!id || (action !== "approve" && action !== "reject")) {
      return new Response(JSON.stringify({ error: "Missing id or invalid action" }), { status: 400, headers: corsHeaders });
    }

    const { data: pending, error: fetchErr } = await supabase
      .from("ig_pending_review")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchErr || !pending) {
      return new Response(JSON.stringify({ error: `Pending post ${id} not found: ${fetchErr?.message || "missing"}` }), { status: 404, headers: corsHeaders });
    }
    if (pending.status !== "pending") {
      return new Response(JSON.stringify({ error: `Already ${pending.status}`, status: pending.status }), { status: 409, headers: corsHeaders });
    }

    if (action === "reject") {
      // 1. Delete the rejected image from storage (no orphans)
      try { await supabase.storage.from("instagram-images").remove([pending.image_path]); } catch { /* best effort */ }
      // 2. Mark the row rejected
      const { error: upErr } = await supabase
        .from("ig_pending_review")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (upErr) throw new Error(`Reject update: ${upErr.message}`);

      // 3. Regenerate for the SAME chapter in the BACKGROUND — the regen
      //    takes 30-90s (Claude + FLUX) and awaiting it inline hung the
      //    reject button and sometimes timed out with no new row.
      // @ts-ignore - EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(regenInBackground(id, pending.chapter_global_number));

      return new Response(JSON.stringify({
        success: true,
        status: "rejected",
        id,
        regeneration: {
          ok: true,
          detail: "Regeneration running in background — a new pending post will appear in ~30-60s.",
        },
        message: "Rejected. New attempt queued — will appear in pending review shortly.",
      }), { headers: corsHeaders });
    }

    // action === "approve"
    let bufferResults: Array<{ service: string; postId: string }> = [];
    let bufferErrors: Array<{ service: string; channelId: string; error: string }> = [];
    let topLevelError: string | null = null;
    try {
      const r = await queueToBuffer(pending.image_url, pending.caption, pending.hashtags);
      bufferResults = r.results;
      bufferErrors = r.errors;
    } catch (err) {
      topLevelError = String(err);
    }

    // DECOUPLED FROM PUBLISHING: approval ALWAYS marks the post approved (it
    // then surfaces in the gallery + in-app Bhaktigram feed). Publishing to
    // Buffer is best-effort — a Buffer outage (e.g. an unauthorized API token)
    // is recorded as a non-fatal note on the row, never a block. Instagram/
    // Threads posting resumes automatically once the Buffer token is fixed.
    const published = bufferResults.length > 0;
    const publishNote = !published
      ? (topLevelError
          || bufferErrors.map(e => `${e.service}(${e.channelId}): ${e.error}`).join(" | ")
          || "Buffer returned no successful channels")
      : (bufferErrors.length > 0 ? bufferErrors.map(e => `${e.service}: ${e.error}`).join(" | ") : null);

    const { error: upErr } = await supabase
      .from("ig_pending_review")
      .update({
        status: "approved",
        buffer_post_ids: bufferResults,
        reviewed_at: new Date().toISOString(),
        // Non-fatal publishing note (null only when every channel posted OK).
        error_message: publishNote,
      })
      .eq("id", id);
    if (upErr) throw new Error(`Approve update: ${upErr.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        status: "approved",
        id,
        published,
        buffer: bufferResults,
        publishNote,
        partialErrors: bufferErrors,
        message: published
          ? `Approved and queued to ${bufferResults.length} channel(s).`
          : `Approved (saved to the app feed). Instagram/Threads publishing skipped: ${publishNote}`,
      }),
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
