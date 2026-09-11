// Supabase Edge Function: daily-gita-quote
//
// Posts one short Bhagavad-gita quote (1-2 lines, signed "— Krishna") to Threads
// via Buffer, and once a day into the Bhaktigram app's own feed as a text post.
// Text only, so it avoids the media-spec failures that reject image posts on
// that channel.
//
// IMPORTANT: verses come from a CURATED list, not the whole book in order.
// Walking sequentially starts at 1.1 (Dhritarashtra narrating the battlefield),
// which is neither quotable nor something Krishna says — signing that "— Krishna"
// would be plainly wrong. The list below is Krishna's own teaching verses.
// Position is kept in public.gita_quote_log so nothing repeats until it wraps.
//
// verify_jwt is ON: this publishes to a live account, so it must not be callable
// anonymously. pg_cron passes the service-role key.
//
// POST body:
//   { "preview": true } → return the text only, touch nothing
//   { "draft": true }   → create it in Buffer as a DRAFT (nothing goes public)
//   {}                  → publish now

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUFFER_API = "https://api.buffer.com";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const BUFFER_KEY = Deno.env.get("BUFFER_API_KEY") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const THREADS_CHANNEL = Deno.env.get("BUFFER_THREADS_CHANNEL_ID") || "69db52c2031bfa423cf5ddc7";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** The in-app author of these quotes: a system row in bhaktigram_profiles that
 *  no device owns, so nobody can sign in as it and it never posts anything else. */
const SYSTEM_AUTHOR = "bhaktigram_official";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Krishna's teaching verses — the quotable core of the Gita. ~157 days of posts
// before the cycle repeats. Chapter 1 and pure narration are deliberately absent.
const VERSES: Array<[number, number]> = [
  [2,13],[2,14],[2,16],[2,20],[2,22],[2,23],[2,27],[2,38],[2,40],[2,47],[2,48],[2,50],[2,56],[2,57],[2,62],[2,63],[2,64],[2,66],[2,70],[2,71],
  [3,8],[3,9],[3,16],[3,19],[3,21],[3,25],[3,27],[3,30],[3,35],[3,37],[3,42],[3,43],
  [4,7],[4,8],[4,11],[4,17],[4,18],[4,19],[4,20],[4,22],[4,24],[4,34],[4,36],[4,38],[4,39],[4,42],
  [5,10],[5,11],[5,12],[5,18],[5,21],[5,22],[5,24],[5,29],
  [6,5],[6,6],[6,16],[6,17],[6,19],[6,26],[6,29],[6,30],[6,32],[6,35],[6,40],[6,45],[6,47],
  [7,3],[7,7],[7,8],[7,14],[7,16],[7,17],[7,19],[7,21],
  [8,5],[8,6],[8,7],[8,14],[8,15],[8,16],[8,20],
  [9,10],[9,11],[9,13],[9,14],[9,17],[9,22],[9,26],[9,27],[9,29],[9,30],[9,31],[9,34],
  [10,8],[10,9],[10,10],[10,11],[10,20],[10,41],
  [11,32],[11,33],[11,54],[11,55],
  [12,6],[12,7],[12,8],[12,12],[12,13],[12,14],[12,15],[12,16],[12,17],[12,18],[12,19],[12,20],
  [13,8],[13,28],[13,29],[13,31],
  [14,4],[14,22],[14,23],[14,24],[14,25],[14,26],[14,27],
  [15,5],[15,7],[15,15],[15,19],
  [16,1],[16,2],[16,3],[16,5],[16,21],[16,22],[16,23],
  [17,3],[17,15],[17,16],[17,20],
  [18,14],[18,20],[18,23],[18,46],[18,48],[18,54],[18,55],[18,58],[18,61],[18,62],[18,63],[18,65],[18,66],[18,68],[18,73],
];

async function writeQuote(chapter: number, verse: number): Promise<string> {
  const sys = [
    "You render a single verse of the Bhagavad-gita as a short quote for social media.",
    "Rules:",
    "- ONE or TWO lines. Under 200 characters total.",
    "- Faithful to the verse's actual meaning. Never invent teaching that is not in it.",
    "- Plain, direct modern English that reads as timeless wisdom.",
    "- Krishna is the speaker: use 'I' / 'you' where the verse does.",
    "- No Sanskrit, no verse numbers, no hashtags, no emoji, no quotation marks.",
    "Reply with the quote text ONLY — nothing else.",
  ].join("\n");
  const r = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5", max_tokens: 200, system: sys,
      messages: [{ role: "user", content: `Bhagavad-gita, chapter ${chapter}, verse ${verse}.` }],
    }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const t = j?.content?.[0]?.text;
  if (typeof t !== "string" || !t.trim()) throw new Error("Claude returned no quote");
  return t.trim().replace(/^["']|["']$/g, "");
}

async function postToThreads(text: string, draft: boolean) {
  const input: Record<string, unknown> = {
    text, channelId: THREADS_CHANNEL, schedulingType: "automatic", mode: "shareNow",
  };
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
  if (!r.ok) throw new Error(`Buffer HTTP ${r.status}: ${body.slice(0, 300)}`);
  const j = JSON.parse(body);
  const gql = (j?.errors || []).map((e: { message?: string }) => e.message).filter(Boolean).join("; ");
  if (gql) throw new Error(`Buffer GraphQL: ${gql}`);
  const p = j?.data?.createPost;
  if (p?.__typename === "PostActionSuccess" && p?.post?.id) return { id: p.post.id as string, status: p.post.status as string };
  throw new Error(`Buffer: ${p?.message || JSON.stringify(p).slice(0, 200)}`);
}

/**
 * Whether today's in-app slot is still open. Read-only, so `preview` can call
 * it to prove the gate works without publishing anything.
 */
async function appSlotFree(): Promise<{ free: boolean; reason?: string }> {
  const midnightUtc = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const { data, error } = await supabase
    .from("bhaktigram_posts")
    .select("id")
    .eq("author_device", SYSTEM_AUTHOR)
    .gte("created_at", midnightUtc)
    .limit(1);
  if (error) return { free: false, reason: `read: ${error.message}` };
  if (data && data.length) return { free: false, reason: "already posted today" };
  return { free: true };
}

/**
 * Mirror the quote into the app's feed as a text-only post — at most once per
 * UTC day.
 *
 * The cron fires three times a day (04:00, 09:00, 16:00 UTC) because Threads
 * wants that cadence; a feed does not. So the gate is "has this author already
 * posted today?" rather than "is it the 04:00 run?". Asking the table instead
 * of the clock means a retried or manually-triggered run cannot produce a
 * second post, and the schedule can change without this needing to know.
 *
 * Never throws. Buffer has already published by the time this runs, so a
 * failure here must not turn a successful publish into a 500 that the cron
 * retries — that would double-post to Threads. The outcome is reported instead.
 */
async function mirrorToApp(text: string): Promise<{ posted: boolean; reason?: string; id?: number }> {
  try {
    const slot = await appSlotFree();
    if (!slot.free) return { posted: false, reason: slot.reason };

    const { data, error } = await supabase
      .from("bhaktigram_posts")
      .insert({ author_device: SYSTEM_AUTHOR, caption: text, media: [], hashtags: [] })
      .select("id")
      .single();
    if (error) return { posted: false, reason: `insert: ${error.message}` };
    return { posted: true, id: data?.id };
  } catch (err) {
    return { posted: false, reason: String(err) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!ANTHROPIC_KEY) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500, headers: CORS });

  const body = await req.json().catch(() => ({})) as { draft?: boolean; preview?: boolean };

  try {
    const { count } = await supabase.from("gita_quote_log").select("id", { count: "exact", head: true });
    const [chapter, verse] = VERSES[(count || 0) % VERSES.length];

    const quote = await writeQuote(chapter, verse);
    const text = `${quote}\n\n— Krishna`;

    if (body.preview) {
      const slot = await appSlotFree();
      return new Response(JSON.stringify({ ok: true, preview: true, chapter, verse, text, pool: VERSES.length, appSlot: slot }), { headers: CORS });
    }
    if (!BUFFER_KEY) return new Response(JSON.stringify({ error: "BUFFER_API_KEY not configured" }), { status: 500, headers: CORS });

    const posted = await postToThreads(text, !!body.draft);
    await supabase.from("gita_quote_log").insert({
      chapter, verse, text, buffer_post_id: posted.id,
      is_draft: !!body.draft, posted_at: new Date().toISOString(),
    });

    // A draft is not public anywhere, so it must not appear in the app either.
    const app = body.draft ? { posted: false, reason: "draft" } : await mirrorToApp(text);

    return new Response(JSON.stringify({ ok: true, chapter, verse, text, buffer: posted, app, draft: !!body.draft }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
