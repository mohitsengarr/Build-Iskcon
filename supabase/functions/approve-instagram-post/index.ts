// Supabase Edge Function: approve-instagram-post (v12)
//
// v12 changes:
// - THE IMAGE THE REVIEWER SAW: the gallery sends image_path, the image its card
//   shows, and both claims require the row to still hold it. A render the
//   background check swapped in after the reviewer looked is never published or
//   deleted: the request gets 409 image_changed with the new image to review. A
//   request without image_path (an older gallery) claims whatever image the row
//   holds, as in v11.
// - PRECISE 409s: when no claim matches, the row is read again and the answer says
//   why: already_<status>, image_changed, claimed (a fresh claim: try again in a
//   few minutes) or publish_unknown (below). A claim or re-read error is 503.
// - PUBLISH MARKER: approve sets publish_started_at on its own claim right before
//   it calls Meta, Buffer or the channel, and publishes nothing when that fails. A
//   stale claim with the marker is never taken over (publish_unknown: check
//   Instagram first), so a request that died after it started publishing is never
//   repeated. A marker update that errors releases the claim and clears any marker
//   it wrote, since nothing was published: the post is not left with a dead claim
//   that blocks a regenerate, or with a marker that reads as publish_unknown. The
//   final approve update is retried once; if it still fails, the 500 says the post
//   was published and must not be approved again. The claim is never released once
//   publishing started.
// - REJECT MARKS FIRST: reject marks the row rejected on its own claim before it
//   deletes the image; a failed update releases the claim and deletes nothing.
//
// v11 changes:
// - CLAIM BEFORE PUBLISHING: instagram-post now checks each new post after it
//   responds and can swap a better render into a pending post in the background.
//   Approve and reject first claim the post (reviewed_at stamped on a pending,
//   unclaimed row, in one compare-and-swap) and then work only from the row the
//   claim returned, so the image they publish or delete cannot change under them.
//   A second request for the same post gets 409 while the claim is fresh.
//
// v10 changes:
// - CROSS-POST TO THE IN-APP BHĀGAVATAM CHANNEL: on Approve, the artwork is also
//   posted into the "श्रीमद्भागवत चर्चा" system channel (bhaktigram_groups id=2) as
//   an image message, ATTRIBUTED to the Mahājana account that spoke/appears in the
//   chapter (sender_device = "mahajan-<key>", falling back to "system"). This is the
//   third publish target alongside the Darshan feed (the approved row itself) and
//   Instagram. Like Instagram publishing, it is DECOUPLED and non-fatal: a channel
//   insert failure is recorded as a note, never a block on approval.
//
// v9 changes:
// - DIRECT INSTAGRAM PUBLISHING via the Meta Graph API is now the PRIMARY path.
//   Buffer's API only issues read-only "Public API tokens" for this account
//   (FORBIDDEN on channels — verified), so it can never publish. When
//   IG_USER_ID + META_ACCESS_TOKEN are configured, Approve publishes straight to
//   Instagram: create a media container -> (poll ready) -> media_publish. Buffer
//   is kept ONLY as a fallback for when Meta isn't configured.
// - Publishing stays DECOUPLED from approval (from v8): Approve always marks the
//   post approved (it feeds the in-app Bhaktigram feed/gallery); any publish
//   failure is a non-fatal note on the row, never a block.
//
// Secrets:
//   IG_USER_ID           Instagram Business/Creator account id (from the linked FB Page)
//   META_ACCESS_TOKEN    long-lived Page/system-user token with instagram_content_publish
//   BUFFER_API_KEY       (legacy fallback only)
//
// v7/v8 (retained): reject regen runs in the background (EdgeRuntime.waitUntil);
// verify_jwt is on (the gallery sends the anon JWT).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUFFER_API = "https://api.buffer.com";
const GRAPH = "https://graph.facebook.com/v21.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUFFER_KEY = Deno.env.get("BUFFER_API_KEY") || "";
const IG_USER_ID = Deno.env.get("IG_USER_ID") || Deno.env.get("INSTAGRAM_ACCOUNT_ID") || "";
const META_TOKEN = Deno.env.get("META_ACCESS_TOKEN") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

type PubResult = { service: string; postId: string };
type PubError = { service: string; error: string };

// ── Instagram Graph API (primary) ───────────────────────────────────────────
async function graph(path: string, body: Record<string, unknown>) {
  const r = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: META_TOKEN }),
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json } as { ok: boolean; status: number; json: any };
}

async function publishToInstagram(imgUrl: string, caption: string, hashtags: string): Promise<{
  results: PubResult[]; errors: PubError[];
}> {
  const results: PubResult[] = [];
  const errors: PubError[] = [];
  // Instagram caption limit is 2200 chars.
  let text = `${caption || ""}\n\n${hashtags || ""}`.trim();
  if (text.length > 2200) text = text.slice(0, 2197) + "...";

  try {
    // 1) create media container
    const created = await graph(`${IG_USER_ID}/media`, { image_url: imgUrl, caption: text });
    if (!created.ok || !created.json?.id) {
      const e = created.json?.error;
      throw new Error(`container ${created.status}: ${e ? `${e.message} (code ${e.code}${e.error_subcode ? "/" + e.error_subcode : ""})` : JSON.stringify(created.json).slice(0, 300)}`);
    }
    const creationId = created.json.id as string;

    // 2) wait until the container is FINISHED (images are usually instant)
    for (let i = 0; i < 8; i++) {
      const st = await fetch(`${GRAPH}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(META_TOKEN)}`).then(r => r.json()).catch(() => ({}));
      if (st?.status_code === "FINISHED") break;
      if (st?.status_code === "ERROR") throw new Error(`container processing ERROR: ${JSON.stringify(st).slice(0, 200)}`);
      await new Promise(r => setTimeout(r, 1500));
    }

    // 3) publish
    const pub = await graph(`${IG_USER_ID}/media_publish`, { creation_id: creationId });
    if (!pub.ok || !pub.json?.id) {
      const e = pub.json?.error;
      throw new Error(`publish ${pub.status}: ${e ? `${e.message} (code ${e.code}${e.error_subcode ? "/" + e.error_subcode : ""})` : JSON.stringify(pub.json).slice(0, 300)}`);
    }
    results.push({ service: "instagram", postId: pub.json.id as string });
  } catch (err) {
    errors.push({ service: "instagram", error: String(err) });
  }
  return { results, errors };
}

// ── Buffer (legacy fallback) ─────────────────────────────────────────────────
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

// Buffer PERSONAL API keys (the only kind Buffer still issues — new OAuth "App
// Clients" are closed) are FORBIDDEN from LISTING channels via
// account.organizations.channels (no `channels` scope exists for personal keys),
// but posts:write CAN publish to a channel BY ITS ID. So we address the channels
// directly (ids overridable via secrets; defaults are the BuildIskcon channels:
// IG "dailybhagwatham", Threads "buildiskcon").
const THREADS_IMAGE_POSTS_ENABLED = Deno.env.get("THREADS_IMAGE_POSTS_ENABLED") === "true";
const BUFFER_CHANNELS: BufferChannel[] = (() => {
  const list: BufferChannel[] = [];
  const ig = Deno.env.get("BUFFER_INSTAGRAM_CHANNEL_ID") || "69db52a5031bfa423cf5dd46";
  const th = Deno.env.get("BUFFER_THREADS_CHANNEL_ID") || "69db52c2031bfa423cf5ddc7";
  if (ig) list.push({ id: ig, service: "instagram" });
  // Threads image posts are ON HOLD unless THREADS_IMAGE_POSTS_ENABLED is "true"
  // (held 2026-09-13 at the owner's request). Instagram and the Threads text
  // quotes (daily-gita-quote) are unaffected. Resume with:
  //   supabase secrets set THREADS_IMAGE_POSTS_ENABLED=true
  if (th && THREADS_IMAGE_POSTS_ENABLED) list.push({ id: th, service: "threads" });
  return list;
})();

async function queueToBuffer(imgUrl: string, caption: string, hashtags: string, onlyService?: string): Promise<{
  results: PubResult[]; errors: Array<{ service: string; channelId: string; error: string }>;
}> {
  // `onlyService` re-queues a single channel. Needed when one channel failed
  // while the others published: re-running every channel would double-post the
  // ones that already succeeded.
  const chs = onlyService ? BUFFER_CHANNELS.filter(c => c.service === onlyService) : BUFFER_CHANNELS;
  if (chs.length === 0) {
    if (onlyService === "threads" && !THREADS_IMAGE_POSTS_ENABLED) throw new Error("Threads image posts are on hold (set THREADS_IMAGE_POSTS_ENABLED=true to resume)");
    throw new Error("No Buffer channel ids configured (set BUFFER_INSTAGRAM_CHANNEL_ID / BUFFER_THREADS_CHANNEL_ID)");
  }
  const results: PubResult[] = [];
  const errors: Array<{ service: string; channelId: string; error: string }> = [];
  for (const ch of chs) {
    let fc = `${caption}\n\n${hashtags}`;
    if (ch.service === "threads" && fc.length > 500) fc = fc.substring(0, 497) + "...";
    const input: Record<string, unknown> = {
      text: fc, channelId: ch.id, schedulingType: "automatic", mode: "shareNow",
      assets: [{ image: { url: imgUrl } }],
    };
    if (ch.service === "instagram") input.metadata = { instagram: { type: "post", shouldShareToFeed: true } };
    try {
      const r = await bufferGQL(
        `mutation CreatePost($input: CreatePostInput!) { createPost(input: $input) { __typename ... on PostActionSuccess { post { id status } } ... on MutationError { message } } }`,
        { input },
      );
      const gqlErr = (r?.errors || []).map((e: { message?: string }) => e.message).filter(Boolean).join("; ");
      if (gqlErr) { errors.push({ service: ch.service, channelId: ch.id, error: `GraphQL: ${gqlErr}` }); continue; }
      const payload = r?.data?.createPost;
      if (payload?.__typename === "PostActionSuccess" && payload?.post?.id) results.push({ service: ch.service, postId: payload.post.id });
      else if (payload?.__typename === "MutationError") errors.push({ service: ch.service, channelId: ch.id, error: `Buffer: ${payload?.message || "unknown"}` });
      else errors.push({ service: ch.service, channelId: ch.id, error: `Unexpected: ${JSON.stringify(payload).substring(0, 200)}` });
    } catch (err) {
      errors.push({ service: ch.service, channelId: ch.id, error: String(err) });
    }
  }
  return { results, errors };
}

// ── Verify Buffer actually PUBLISHED (v11) ───────────────────────────────────
// Buffer accepts a post and returns an id even when the channel's authorization
// has expired — it only fails later, at publish time. That made a broken channel
// invisible here: rows looked approved with post ids and no error, while nothing
// reached Instagram for days. Re-read each post shortly after creating it and
// record whatever Buffer reports.
async function verifyBufferPosts(results: PubResult[]): Promise<string[]> {
  if (!BUFFER_KEY || results.length === 0) return [];
  await new Promise(r => setTimeout(r, 4000));   // give Buffer a moment to attempt it
  const problems: string[] = [];
  for (const r of results) {
    try {
      const q = await bufferGQL(
        `query P($input: PostInput!) { post(input: $input) { id status error { message } } }`,
        { input: { id: r.postId } },
      );
      const post = q?.data?.post;
      if (!post) continue;
      const msg = post?.error?.message;
      if (post.status === "error" || msg) {
        problems.push(`${r.service}: ${msg || "Buffer reported status=error"}`);
      }
    } catch { /* diagnostic only — never fail an approval because of this */ }
  }
  return problems;
}

// ── Reject regeneration (retained from v7) ───────────────────────────────────
async function triggerRegenerate(chapterGlobalNumber: number): Promise<{ ok: boolean; detail: string; pendingId?: number }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/instagram-post`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
      body: JSON.stringify({ chapter_global_number: chapterGlobalNumber }),
    });
    const data = await res.json();
    if (data?.success) return { ok: true, detail: `New pending review #${data.pendingReviewId} created`, pendingId: data.pendingReviewId };
    if (data?.skipped) return { ok: false, detail: data.reason || "Generation skipped" };
    return { ok: false, detail: data?.error || `instagram-post returned ${res.status}` };
  } catch (err) {
    return { ok: false, detail: String(err) };
  }
}

// ── Cross-post to the in-app Bhāgavatam channel (bhaktigram_groups id=2) ───────
const BHAGAVATAM_CHANNEL_ID = 2;

/**
 * Post the approved artwork into the "श्रीमद्भागवत चर्चा" channel as an image
 * message, attributed to the Mahājana account that spoke/appears in the chapter.
 * Non-fatal: returns an error string on failure instead of throwing.
 */
async function crossPostToBhagavatamChannel(pending: {
  image_url: string; caption?: string | null; mahajan_key?: string | null; chapter_title?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const sender = pending.mahajan_key ? `mahajan-${pending.mahajan_key}` : "system";
    // Prefer the caption; fall back to the chapter title so the bubble is never empty.
    const body = (pending.caption && pending.caption.trim()) || (pending.chapter_title || "").trim() || null;
    const { error } = await supabase.from("bhaktigram_group_messages").insert({
      group_id: BHAGAVATAM_CHANNEL_ID,
      sender_device: sender,
      body,
      media_url: pending.image_url,
      kind: "image",
      source: "bhagavatam_daily",
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function regenInBackground(rejectedId: number, chapterGlobalNumber: number): Promise<void> {
  const regen = await triggerRegenerate(chapterGlobalNumber);
  if (!regen.ok) {
    console.error(`IG regen for chapter ${chapterGlobalNumber} failed: ${regen.detail}`);
    try {
      await supabase.from("ig_pending_review").update({ error_message: `auto-regen failed: ${regen.detail.substring(0, 400)}` }).eq("id", rejectedId);
    } catch { /* best effort */ }
  }
}

// ── Claim the post before publishing or deleting its image (v11) ─────────────
// instagram-post re-renders a post whose image contradicts the scene's facts in
// the background, after it has responded, and swaps a better render into the row
// only while the post is still pending AND unclaimed (reviewed_at is null);
// regenerate-pending-image saves over the image only under the same condition.
// Approve and reject claim the post by stamping reviewed_at on a pending,
// unclaimed row in one compare-and-swap, then use the row that claim returns: no
// swap can change the image they publish or delete after that. When the request
// names the image the reviewer saw (image_path), both claims also need the row to
// still hold that image, so a render swapped in after the reviewer looked is never
// published or deleted (explainClaimMiss answers image_changed). A claim older
// than CLAIM_STALE_MS was left by a request that died and can be taken over, but
// only while publish_started_at is null: approve sets it on its own claim right
// before it publishes, and a request that died after that may already have posted
// (explainClaimMiss answers publish_unknown). regenerate-pending-image treats a
// stale claim without the marker as dead too. A claim is released only when nothing
// was published or deleted under it (releaseClaim), and never after publishing
// starts: a second approval would post twice.
const CLAIM_STALE_MS = 10 * 60 * 1000;

async function claimPending(id: number, imagePath: string | null): Promise<{ row: any | null; stamp: string; error: string | null }> {
  const stamp = new Date().toISOString();
  const claim = () => {
    const q = supabase.from("ig_pending_review").update({ reviewed_at: stamp }).eq("id", id).eq("status", "pending");
    return imagePath ? q.eq("image_path", imagePath) : q;
  };
  const fresh = await claim().is("reviewed_at", null).select("*");
  if (fresh.error) return { row: null, stamp, error: fresh.error.message };
  if (Array.isArray(fresh.data) && fresh.data.length === 1) return { row: fresh.data[0], stamp, error: null };
  const cutoff = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
  const stale = await claim().lt("reviewed_at", cutoff).is("publish_started_at", null).select("*");
  if (stale.error) return { row: null, stamp, error: stale.error.message };
  if (Array.isArray(stale.data) && stale.data.length === 1) return { row: stale.data[0], stamp, error: null };
  return { row: null, stamp, error: null };
}

// Neither claim matched: read the row again and answer precisely why, so the
// gallery can show a changed image or the right message. A read error is 503.
async function explainClaimMiss(id: number, imagePath: string | null): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: row, error } = await supabase.from("ig_pending_review")
    .select("id,status,reviewed_at,image_url,image_path,publish_started_at,visual_check")
    .eq("id", id).maybeSingle();
  if (error) return { status: 503, body: { error: `Could not read post ${id} after its claim missed: ${error.message}` } };
  if (!row) return { status: 404, body: { error: `Pending post ${id} not found` } };
  if (row.status !== "pending") return { status: 409, body: { error: `Already ${row.status}`, status: `already_${row.status}` } };
  if (row.reviewed_at) {
    const claimedAt = Date.parse(row.reviewed_at);
    if (!Number.isFinite(claimedAt) || Date.now() - claimedAt <= CLAIM_STALE_MS) {
      return { status: 409, body: { error: `Post ${id} is already being approved or rejected. Try again in a few minutes.`, status: "claimed" } };
    }
    if (row.publish_started_at) {
      return {
        status: 409,
        body: {
          error: `An earlier approval of post ${id} started publishing at ${row.publish_started_at} and did not finish. Check Instagram before approving again.`,
          status: "publish_unknown",
          publish_started_at: row.publish_started_at,
        },
      };
    }
  }
  if (imagePath && row.image_path !== imagePath) {
    return {
      status: 409,
      body: {
        error: `Post ${id} now holds a different image than the one you reviewed. Review the new image, then approve or reject again.`,
        status: "image_changed",
        id,
        image_url: row.image_url,
        image_path: row.image_path,
        visual_check: row.visual_check ?? null,
      },
    };
  }
  // Nothing explains the miss any more: a claim was released or taken in between.
  return { status: 409, body: { error: `Post ${id} was being approved or rejected by another request. Try again in a few minutes.`, status: "claimed" } };
}

// Gives back this request's own claim (reviewed_at still its stamp) when nothing was
// published or deleted under it: a reject whose update failed, or an approval whose
// publish marker could not be written. The post can then be approved, rejected or
// regenerated at once instead of waiting out a dead claim. It also clears
// publish_started_at: while this claim holds, only this request's failed marker
// update can have set it (a stale claim is taken over only without the marker), and
// a marker left behind would make a later claim that dies before its own marker look
// like one that started publishing (publish_unknown). Best effort: a claim left
// behind goes stale after CLAIM_STALE_MS.
async function releaseClaim(id: number, stamp: string): Promise<void> {
  try {
    const { error } = await supabase.from("ig_pending_review").update({ reviewed_at: null, publish_started_at: null }).eq("id", id).eq("reviewed_at", stamp);
    if (error) console.error(`Could not release the claim on post ${id}: ${error.message}`);
  } catch (err) {
    console.error(`Could not release the claim on post ${id}: ${err}`);
  }
}

// The approve update after publishing, retried once on error: it writes the same
// values again, so repeating it is safe. Returns the last error, or null once it
// succeeded.
const APPROVE_UPDATE_TRIES = 2;

async function markApproved(id: number, values: Record<string, unknown>): Promise<string | null> {
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= APPROVE_UPDATE_TRIES; attempt++) {
    try {
      const { error } = await supabase.from("ig_pending_review").update(values).eq("id", id);
      if (!error) return null;
      lastError = error.message;
    } catch (err) {
      lastError = String(err);
    }
    console.error(`Approve update for post ${id} failed (try ${attempt} of ${APPROVE_UPDATE_TRIES}): ${lastError}`);
  }
  return lastError;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, authorization, apikey" } });
  }
  const corsHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });

  try {
    const { id, action, service, image_path } = await req.json() as { id: number; action: "approve" | "reject" | "republish"; service?: string; image_path?: string | null };
    if (!id || (action !== "approve" && action !== "reject" && action !== "republish")) {
      return new Response(JSON.stringify({ error: "Missing id or invalid action" }), { status: 400, headers: corsHeaders });
    }
    // The image the reviewer saw (v12). A request without it (an older gallery)
    // claims whatever image the row holds.
    const seenPath = typeof image_path === "string" && image_path.length > 0 ? image_path : null;

    const { data: pending, error: fetchErr } = await supabase.from("ig_pending_review").select("*").eq("id", id).single();
    if (fetchErr || !pending) return new Response(JSON.stringify({ error: `Pending post ${id} not found: ${fetchErr?.message || "missing"}` }), { status: 404, headers: corsHeaders });

    // Re-send an already-approved row to ONE channel. Buffer can accept a post,
    // return an id, then drop it at publish time (an expired channel does this),
    // which leaves a row looking approved while nothing ever reached the feed.
    // Recovering those needs a path that skips the channels that did publish.
    if (action === "republish") {
      if (pending.status !== "approved") {
        return new Response(JSON.stringify({ error: `Can only republish an approved row (this one is ${pending.status})` }), { status: 409, headers: corsHeaders });
      }
      const svc = service || "instagram";
      const r = await queueToBuffer(pending.image_url, pending.caption, pending.hashtags, svc);
      const problems = await verifyBufferPosts(r.results);
      const ok = r.results.length > 0 && problems.length === 0;
      // Keep the ids from the channels that already published; swap in the new
      // id for the one we just re-sent.
      const prior: PubResult[] = Array.isArray(pending.buffer_post_ids) ? pending.buffer_post_ids : [];
      const merged = [...prior.filter(p => p.service !== svc), ...r.results];
      const note = [...r.errors.map(e => `${e.service}: ${e.error}`), ...problems].join(" | ") || null;
      await supabase.from("ig_pending_review").update({ buffer_post_ids: merged, error_message: note }).eq("id", id);
      return new Response(JSON.stringify({
        success: ok, id, service: svc, republished: r.results, problems, publishNote: note,
        message: ok ? `Re-sent to ${svc}.` : `Re-send to ${svc} failed: ${note || "no channel accepted it"}`,
      }), { headers: corsHeaders });
    }

    if (pending.status !== "pending") return new Response(JSON.stringify({ error: `Already ${pending.status}`, status: pending.status }), { status: 409, headers: corsHeaders });

    // Claim the post (claimPending); everything below works from the claimed row.
    const claim = await claimPending(id, seenPath);
    if (claim.error) return new Response(JSON.stringify({ error: `Could not claim post ${id}: ${claim.error}` }), { status: 503, headers: corsHeaders });
    if (!claim.row) {
      const miss = await explainClaimMiss(id, seenPath);
      return new Response(JSON.stringify(miss.body), { status: miss.status, headers: corsHeaders });
    }
    const post = claim.row;

    if (action === "reject") {
      // Mark the post rejected on this request's own claim first, and delete its
      // image only after that: a failed update must never leave a pending post whose
      // file is gone. When the update fails nothing is deleted and the claim is
      // released, so the post can be reviewed again at once.
      const { data: rejected, error: rejectErr } = await supabase.from("ig_pending_review")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", id).eq("reviewed_at", claim.stamp).select("id");
      if (rejectErr || !Array.isArray(rejected) || rejected.length !== 1) {
        await releaseClaim(id, claim.stamp);
        if (rejectErr) return new Response(JSON.stringify({ error: `Reject update: ${rejectErr.message}. Nothing was deleted; try again.` }), { status: 500, headers: corsHeaders });
        return new Response(JSON.stringify({ error: `Post ${id} was claimed by another request before it could be rejected. Nothing was deleted.`, status: "claimed" }), { status: 409, headers: corsHeaders });
      }
      if (post.image_path) {
        try { await supabase.storage.from("instagram-images").remove([post.image_path]); } catch { /* best effort */ }
      }
      // @ts-ignore - EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(regenInBackground(id, post.chapter_global_number));
      return new Response(JSON.stringify({ success: true, status: "rejected", id, regeneration: { ok: true, detail: "Regeneration running in background — a new pending post will appear in ~30-60s." }, message: "Rejected. New attempt queued — will appear in pending review shortly." }), { headers: corsHeaders });
    }

    // action === "approve". Record that publishing starts, on this request's own
    // claim, before any Meta, Buffer or channel call: a stale claim with this marker
    // is never taken over, so a request that dies from here on is never repeated.
    // Nothing is published unless the marker was written. An error releases this
    // request's claim, and any marker the failed update did write (releaseClaim):
    // nothing was published under it. No row means another request took the claim
    // over, and it is left alone. Once the marker is written the claim is never
    // released.
    const { data: marked, error: markErr } = await supabase.from("ig_pending_review")
      .update({ publish_started_at: new Date().toISOString() })
      .eq("id", id).eq("reviewed_at", claim.stamp).select("id");
    if (markErr) {
      await releaseClaim(id, claim.stamp);
      return new Response(JSON.stringify({ error: `Could not mark post ${id} as publishing: ${markErr.message}. Nothing was published; try again.` }), { status: 503, headers: corsHeaders });
    }
    if (!Array.isArray(marked) || marked.length !== 1) {
      return new Response(JSON.stringify({ error: `Post ${id} was claimed by another request before publishing started. Nothing was published.`, status: "claimed" }), { status: 409, headers: corsHeaders });
    }

    // Publish to Instagram (Meta) primary; Buffer fallback.
    let results: PubResult[] = [];
    let publishErrors: PubError[] = [];
    let topLevelError: string | null = null;
    let via = "meta";

    if (IG_USER_ID && META_TOKEN) {
      const r = await publishToInstagram(post.image_url, post.caption, post.hashtags);
      results = r.results; publishErrors = r.errors;
    } else {
      via = "buffer";
      try {
        const r = await queueToBuffer(post.image_url, post.caption, post.hashtags);
        results = r.results;
        publishErrors = r.errors.map(e => ({ service: e.service, error: e.error }));
      } catch (err) {
        topLevelError = String(err);
      }
    }

    // Cross-post the artwork into the in-app Bhāgavatam channel (decoupled, non-fatal).
    const channel = await crossPostToBhagavatamChannel(post);

    // Ask Buffer what it actually did, so an expired channel surfaces here rather
    // than as silence on the feed.
    const bufferProblems = via === "buffer" ? await verifyBufferPosts(results) : [];
    const published = results.length > 0 && bufferProblems.length < results.length;
    const notes: string[] = [];
    if (!published) notes.push(topLevelError || publishErrors.map(e => `${e.service}: ${e.error}`).join(" | ") || `${via}: no successful channel`);
    else if (publishErrors.length > 0) notes.push(publishErrors.map(e => `${e.service}: ${e.error}`).join(" | "));
    if (bufferProblems.length > 0) notes.push(...bufferProblems);
    if (!channel.ok) notes.push(`bhagavatam-channel: ${channel.error}`);
    const publishNote = notes.length > 0 ? notes.join(" | ") : null;

    // Retried once (markApproved). When it still fails the post has gone out: say
    // so, and keep the claim and the marker so no later request publishes it again.
    const approveErr = await markApproved(id, {
      status: "approved",
      buffer_post_ids: results,
      reviewed_at: new Date().toISOString(),
      error_message: publishNote,
    });
    if (approveErr) {
      const sent = published
        ? `Post ${id} was published to Instagram${channel.ok ? " and the Bhāgavatam channel" : ""}`
        : `Post ${id} was sent for publishing${channel.ok ? " and posted to the Bhāgavatam channel" : ""} (${publishNote || "no channel accepted it"})`;
      return new Response(JSON.stringify({
        success: false, id, published, via, buffer: results, publishNote,
        channelPosted: channel.ok, partialErrors: publishErrors, bufferProblems, doNotRepeat: true,
        error: `Approve update: ${approveErr}. ${sent}, but it could not be marked approved. Do not approve it again: check Instagram first.`,
      }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({
      success: true, status: "approved", id, published, via, buffer: results,
      channelPosted: channel.ok, publishNote, partialErrors: publishErrors,
      bufferProblems,
      message: published
        ? `Approved and published to Instagram (${results.length})${channel.ok ? " + Bhāgavatam channel" : ""}.`
        : `Approved (saved to the app feed${channel.ok ? " + Bhāgavatam channel" : ""}). Instagram publishing skipped: ${publishNote}`,
    }), { headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
