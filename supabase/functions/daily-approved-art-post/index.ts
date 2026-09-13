// Supabase Edge Function: daily-approved-art-post
//
// Posts ONE approved chapter artwork per run to Threads + Instagram via Buffer,
// alternating between the Gita and Caitanya-caritamrta so both books get an
// airing. Only rows that are `approved` and never posted (posted_at IS NULL) are
// eligible, and posted_at is stamped on success so nothing repeats.
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

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUFFER_API = "https://api.buffer.com";
const BUFFER_KEY = Deno.env.get("BUFFER_API_KEY") || "";
const IG_CHANNEL = Deno.env.get("BUFFER_INSTAGRAM_CHANNEL_ID") || "69db52a5031bfa423cf5dd46";
const TH_CHANNEL = Deno.env.get("BUFFER_THREADS_CHANNEL_ID") || "69db52c2031bfa423cf5ddc7";
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

const BOOKS = [
  { key: "gita",      table: "gita_chapter_art_review",      label: "Bhagavad-gita" },
  { key: "chaitanya", table: "chaitanya_chapter_art_review", label: "Caitanya-caritamrta" },
];

async function pickNext(bookKey?: string) {
  // Alternate by how many have already gone out, so the books stay balanced.
  let order = BOOKS;
  if (bookKey) {
    const b = BOOKS.find(x => x.key === bookKey);
    if (!b) throw new Error(`unknown book '${bookKey}'`);
    order = [b];
  } else {
    const counts = await Promise.all(BOOKS.map(async b => {
      const { count } = await supabase.from(b.table).select("id", { count: "exact", head: true }).not("posted_at", "is", null);
      return count || 0;
    }));
    order = counts[0] <= counts[1] ? BOOKS : [BOOKS[1], BOOKS[0]];
  }
  for (const b of order) {
    const { data } = await supabase.from(b.table).select("*")
      .eq("status", "approved").is("posted_at", null)
      .order("created_at", { ascending: true }).limit(1);
    if (data && data.length) return { book: b, row: data[0] as Record<string, unknown> };
  }
  return null;
}

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({})) as { preview?: boolean; draft?: boolean; book?: string };

    const next = await pickNext(body.book);
    if (!next) {
      return new Response(JSON.stringify({ ok: true, posted: false, message: "No approved, unposted artwork available" }), { headers: CORS });
    }
    const { book, row } = next;
    const caption = String(row.caption || row.chapter_title || book.label);
    const hashtags = String(row.hashtags || "");
    const imgUrl = String(row.image_url || "");
    if (!imgUrl) throw new Error(`row ${row.id} has no image_url`);

    const igText = `${caption}\n\n${hashtags}`.trim().slice(0, 2200);
    // Threads caps at 500 characters.
    let thText = `${caption}\n\n${hashtags}`.trim();
    if (thText.length > 500) thText = thText.slice(0, 497) + "...";

    if (body.preview) {
      return new Response(JSON.stringify({
        ok: true, preview: true, book: book.key, id: row.id,
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
