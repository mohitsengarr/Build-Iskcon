// Supabase Edge Function: daily-approved-art-post
//
// Posts ONE approved chapter artwork per run to Threads + Instagram via Buffer,
// alternating between the Gita and Caitanya-caritamrta so both books get an
// airing. Only rows that are `approved` and never posted (posted_at IS NULL) are
// eligible, and posted_at is stamped on success so nothing repeats. Only covers
// with Krishna in them go out (owner, 2026-10-23): a cover without Him is skipped
// and keeps its check on the row (_shared/coverPick.ts, _shared/krishnaCheck.ts).
//
// Publishing is per-channel and non-fatal: if Threads rejects the media (it has
// been doing so intermittently — the images themselves are within Threads' specs)
// Instagram still goes out, and the failure is recorded in error_message.
//
// POST body:
//   { "preview": true } → show what WOULD be posted, publish nothing
//   { "draft": true }   → create Buffer DRAFTS (nothing goes public)
//   { "book": "gita" }  → force a book instead of alternating
//   {}                  → publish now
//   { "resend": "instagram" }        → re-send ONE already-posted cover whose last
//                                      attempt failed on that channel (pg_cron job
//                                      instagram-cover-catchup, 10:00 UTC daily;
//                                      _shared/coverResend.ts); add "preview": true
//                                      to see which cover without sending it

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { threadsText } from "../_shared/postText.ts";
import { COVER_BOOKS, type CoverBook, pickNextCover } from "../_shared/coverPick.ts";
import { krishnaGate, type KrishnaTable } from "../_shared/krishnaCheck.ts";
import { bufferChannelIds } from "../_shared/bufferChannels.ts";
import { logSocialPosts, postedSince } from "../_shared/socialPostLog.ts";
import { pickResend, type ResendCandidate, withoutChannelError } from "../_shared/coverResend.ts";

const BUFFER_API = "https://api.buffer.com";
const BUFFER_KEY = Deno.env.get("BUFFER_API_KEY") || "";
// Instagram mohit.bhaktigram (since 2026-10-30), Threads dailybhagwatham (_shared/bufferChannels.ts).
const { instagram: IG_CHANNEL, threads: TH_CHANNEL } = bufferChannelIds((k) => Deno.env.get(k));
// Threads image posts are ON HOLD unless THREADS_IMAGE_POSTS_ENABLED is "true"
// (held 2026-09-13 at the owner's request); Instagram still posts daily.
const THREADS_IMAGE_POSTS_ENABLED = Deno.env.get("THREADS_IMAGE_POSTS_ENABLED") === "true";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const gate = (book: CoverBook, row: Record<string, unknown>, o: { mayCheck: boolean }) =>
  krishnaGate({ supabase, table: book.table as KrishnaTable, row: row as { id: number }, mayCheck: o.mayCheck });

async function createPost(text: string, channelId: string, imgUrl: string, isInstagram: boolean, draft: boolean) {
  const input: Record<string, unknown> = {
    text, channelId, schedulingType: "automatic", mode: "shareNow",
    assets: [{ image: { url: imgUrl } }],
  };
  if (isInstagram) input.metadata = { instagram: { type: "post", shouldShareToFeed: true } };
  if (draft) input.saveToDraft = true;
  const r = await fetch(BUFFER_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${BUFFER_KEY}` },
    body: JSON.stringify({
      query: `mutation CreatePost($input: CreatePostInput!) { createPost(input: $input) { __typename ... on PostActionSuccess { post { id status } } ... on MutationError { message } } }`,
      variables: { input },
    }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
  const j = JSON.parse(body);
  const gql = (j?.errors || []).map((e: { message?: string }) => e.message).filter(Boolean).join("; ");
  if (gql) throw new Error(gql);
  const p = j?.data?.createPost;
  if (p?.__typename === "PostActionSuccess" && p?.post?.id) return p.post.id as string;
  throw new Error(p?.message || JSON.stringify(p).slice(0, 160));
}

/** The Instagram and Threads texts for a cover. */
function postTexts(book: CoverBook, row: Record<string, unknown>) {
  const caption = String(row.caption || row.chapter_title || book.label);
  const hashtags = String(row.hashtags || "");
  // Instagram caps at 2200 characters; Threads carries the story alone, no mantra,
  // reference or hashtags, within 500 characters (_shared/postText.ts).
  return {
    instagram: `${caption}\n\n${hashtags}`.trim().slice(0, 2200),
    threads: threadsText(row.caption, row.chapter_title || book.label),
  };
}

const RESEND_CHANNELS: Record<string, { id: string; ig: boolean }> = {
  instagram: { id: IG_CHANNEL, ig: true },
  threads: { id: TH_CHANNEL, ig: false },
};
const RESEND_READ_LIMIT = 100;

/**
 * Re-sends ONE already-posted cover to a channel its last attempt failed on
 * (_shared/coverResend.ts). The covers are read from every book, oldest posted
 * first; the first that failed on the channel, has Krishna in it and was not
 * re-sent since (social_post_log) goes out. Success clears the channel's error
 * on the row, failure records the new one so tomorrow tries once more.
 */
async function resendOne(service: string, preview: boolean): Promise<Response> {
  const ch = RESEND_CHANNELS[service];
  if (!ch) return new Response(JSON.stringify({ error: `unknown channel '${service}'` }), { status: 400, headers: CORS });
  if (service === "threads" && !THREADS_IMAGE_POSTS_ENABLED) {
    return new Response(JSON.stringify({ ok: false, blocked: "threads image posts are on hold" }), { status: 409, headers: CORS });
  }
  const candidates: ResendCandidate[] = [];
  for (const book of COVER_BOOKS) {
    const { data, error } = await supabase.from(book.table).select("*")
      .eq("status", "approved").not("posted_at", "is", null).ilike("error_message", `%${service}:%`)
      .order("posted_at", { ascending: true }).limit(RESEND_READ_LIMIT);
    if (error) throw new Error(`Reading ${book.table}: ${error.message}`);
    for (const row of Array.isArray(data) ? data : []) candidates.push({ book, row });
  }
  const { pick, held } = await pickResend({
    candidates,
    service,
    alreadySent: (c) => postedSince(supabase, { service, since: String(c.row.posted_at), source_table: c.book.table, source_id: Number(c.row.id) }),
    gate: async (c) => {
      const v = await krishnaGate({ supabase, table: c.book.table as KrishnaTable, row: c.row as { id: number }, mayCheck: true });
      return { allowed: v.allowed, reason: v.reason };
    },
  });
  for (const h of held) console.log(`[daily-art] resend ${service}: ${h.book} #${String(h.id)} held back: ${h.reason}`);
  if (!pick) {
    return new Response(JSON.stringify({ ok: true, resend: service, posted: false, held, message: `No posted cover with Krishna in it is waiting for ${service}` }), { headers: CORS });
  }
  const { book, row } = pick;
  const imgUrl = String(row.image_url || "");
  const text = postTexts(book as CoverBook, row)[service as "instagram" | "threads"];
  if (preview) {
    return new Response(JSON.stringify({ ok: true, preview: true, resend: service, book: book.key, id: row.id, chapter: row.chapter_number, image_url: imgUrl, text, held }), { headers: CORS });
  }
  if (!BUFFER_KEY) return new Response(JSON.stringify({ error: "BUFFER_API_KEY not configured" }), { status: 500, headers: CORS });
  try {
    const postId = await createPost(text, ch.id, imgUrl, ch.ig, false);
    await logSocialPosts(supabase, [{ service, source_table: book.table, source_id: Number(row.id), buffer_post_id: postId, image_url: imgUrl }]);
    const { error } = await supabase.from(book.table).update({ error_message: withoutChannelError(row.error_message, service) }).eq("id", row.id);
    if (error) console.log(`[daily-art] resend ${service}: ${book.key} #${String(row.id)} posted but its error could not be cleared: ${error.message}`);
    console.log(`[daily-art] resend ${service}: ${book.key} #${String(row.id)} posted (${postId})`);
    return new Response(JSON.stringify({ ok: true, resend: service, book: book.key, id: row.id, chapter: row.chapter_number, posted: { [service]: postId }, held }), { headers: CORS });
  } catch (e) {
    const err = `${service}: ${String(e).slice(0, 200)}`;
    const kept = withoutChannelError(row.error_message, service);
    await supabase.from(book.table).update({ error_message: kept ? `${kept} | ${err}` : err }).eq("id", row.id);
    console.log(`[daily-art] resend ${service}: ${book.key} #${String(row.id)} failed: ${err}`);
    return new Response(JSON.stringify({ ok: false, resend: service, book: book.key, id: row.id, errors: [err], held }), { headers: CORS });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({})) as { preview?: boolean; draft?: boolean; book?: string; resend?: string };
    if (typeof body.resend === "string") return await resendOne(body.resend, !!body.preview);

    const { pick: next, held } = await pickNextCover({ supabase, gate, bookKey: body.book });
    for (const h of held.filter((x) => x.checked)) console.log(`[daily-art] ${h.book} #${String(h.id)} held back: ${h.reason}`);
    if (held.length) console.log(`[daily-art] ${held.length} covers held back (${held.filter((x) => x.checked).length} newly checked)`);
    if (!next) {
      return new Response(JSON.stringify({ ok: true, posted: false, held, message: "No approved, unposted artwork with Krishna in it available" }), { headers: CORS });
    }
    const { book, row } = next;
    const imgUrl = String(row.image_url || "");
    if (!imgUrl) throw new Error(`row ${row.id} has no image_url`);
    const { instagram: igText, threads: thText } = postTexts(book, row);

    if (body.preview) {
      return new Response(JSON.stringify({
        ok: true, preview: true, book: book.key, id: row.id, held,
        chapter: row.chapter_number, image_url: imgUrl,
        instagram_text: igText, threads_text: thText,
      }), { headers: CORS });
    }
    if (!BUFFER_KEY) return new Response(JSON.stringify({ error: "BUFFER_API_KEY not configured" }), { status: 500, headers: CORS });

    // Per-channel and non-fatal: one failing must not block the other.
    const results: Record<string, string> = {};
    const errors: string[] = [];
    const channels = [
      { id: IG_CHANNEL, name: "instagram", text: igText, ig: true },
      { id: TH_CHANNEL, name: "threads",   text: thText, ig: false },
    ].filter(ch => ch.name !== "threads" || THREADS_IMAGE_POSTS_ENABLED);
    for (const ch of channels) {
      try { results[ch.name] = await createPost(ch.text, ch.id, imgUrl, ch.ig, !!body.draft); }
      catch (e) { errors.push(`${ch.name}: ${String(e).slice(0, 200)}`); }
    }
    if (!body.draft) {
      await logSocialPosts(supabase, Object.entries(results).map(([service, postId]) => ({
        service, source_table: book.table, source_id: Number(row.id), buffer_post_id: String(postId), image_url: imgUrl,
      })));
    }

    // Only stamp posted_at when something actually went out, so a total failure
    // is retried tomorrow rather than silently skipped forever.
    if (Object.keys(results).length > 0 && !body.draft) {
      await supabase.from(book.table).update({
        posted_at: new Date().toISOString(),
        error_message: errors.length ? errors.join(" | ") : null,
      }).eq("id", row.id);
    } else if (errors.length) {
      await supabase.from(book.table).update({ error_message: errors.join(" | ") }).eq("id", row.id);
    }

    return new Response(JSON.stringify({
      ok: Object.keys(results).length > 0,
      book: book.key, id: row.id, chapter: row.chapter_number,
      posted: results, errors, draft: !!body.draft,
      threads_on_hold: !THREADS_IMAGE_POSTS_ENABLED,
    }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
