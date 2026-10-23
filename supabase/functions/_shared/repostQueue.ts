// The posting queue (repost-replaced-posts). Approved Instagram posts go out one
// at a time (owner, 2026-10-20): approving a post queues it (repost_requested_at,
// approve-instagram-post), and so does approving a replacement for a post that
// was published already (_shared/replacements.ts). Each run posts the oldest few —
// Instagram, then Threads, one channel per republish call — posts never published
// before ahead of reposts of replaced images, so a new post is not held behind a
// long run of reposts. A post leaves the queue (repost_requested_at cleared,
// reposted_at stamped) once Instagram took it; otherwise it stays for the next run.
//
// Only pictures with Krishna in them go out (owner, 2026-10-23): each post passes
// the gate (_shared/krishnaCheck.ts krishnaGate) before it is sent. A post the
// gate holds back is skipped and stays queued with its check on the row, and the
// run moves on to the next one. A run looks at no more than MAX_EXAMINED posts,
// which bounds the checks one run can start.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

/** Channels in the order they are posted to; Instagram decides whether the post leaves the queue. */
export const REPOST_CHANNELS = ["instagram", "threads"] as const;
export const MAX_PER_RUN = 5;
/** Queued posts one run may look at, including those the gate holds back. */
export const MAX_EXAMINED = 20;

/** How many posts a run takes: 1 unless asked, never more than MAX_PER_RUN. */
export function postsPerRun(limit: unknown): number {
  const n = typeof limit === "number" && Number.isInteger(limit) ? limit : 1;
  return Math.min(MAX_PER_RUN, Math.max(1, n));
}

export interface ChannelResult {
  ok: boolean;
  detail: string;
}

export type Republish = (id: number, service: string) => Promise<ChannelResult>;

export interface QueuedPost {
  id: number;
  chapter_title: unknown;
  repost_requested_at: string;
  image_path?: unknown;
  image_url?: unknown;
  krishna_check?: unknown;
}

/** Whether a queued post may go out now (the Krishna gate). */
export type Gate = (post: QueuedPost) => Promise<{ allowed: boolean; reason: string }>;

export interface RepostRun {
  id: number;
  channels: Record<string, ChannelResult>;
  /** Whether it left the queue. */
  done: boolean;
}

export async function runRepostQueue(o: {
  supabase: SupabaseLike;
  republish: Republish;
  gate: Gate;
  limit?: unknown;
  preview?: boolean;
  now?: () => Date;
}): Promise<{
  queued: Array<{ id: number; chapter_title: unknown; repost_requested_at: string }>;
  runs: RepostRun[];
  held: Array<{ id: number; reason: string }>;
}> {
  const now = o.now ?? (() => new Date());
  const take = postsPerRun(o.limit);
  // Never published (no channel post id yet) first, then reposts; oldest first in each.
  const read = async (neverPosted: boolean, n: number): Promise<QueuedPost[]> => {
    let q = o.supabase.from("ig_pending_review")
      .select("id, chapter_title, repost_requested_at, image_path, image_url, krishna_check")
      .eq("status", "approved")
      .not("repost_requested_at", "is", null);
    q = neverPosted ? q.is("buffer_post_ids", null) : q.not("buffer_post_ids", "is", null);
    const { data, error } = await q.order("repost_requested_at", { ascending: true }).limit(n);
    if (error) throw new Error(`Reading the posting queue: ${error.message}`);
    return Array.isArray(data) ? data : [];
  };
  const fresh = await read(true, MAX_EXAMINED);
  const candidates = fresh.length < MAX_EXAMINED ? [...fresh, ...(await read(false, MAX_EXAMINED - fresh.length))] : fresh;

  // The posts this run sends: the first `take` the gate lets through.
  const chosen: QueuedPost[] = [];
  const held: Array<{ id: number; reason: string }> = [];
  for (const post of candidates) {
    if (chosen.length >= take) break;
    let verdict: { allowed: boolean; reason: string };
    try {
      verdict = await o.gate(post);
    } catch (e) {
      verdict = { allowed: false, reason: `the Krishna check failed: ${String(e)}` };
    }
    if (verdict.allowed) chosen.push(post);
    else held.push({ id: post.id, reason: verdict.reason });
  }
  const queued = chosen.map((p) => ({ id: p.id, chapter_title: p.chapter_title, repost_requested_at: p.repost_requested_at }));
  if (o.preview) return { queued, runs: [], held };

  const runs: RepostRun[] = [];
  for (const post of chosen) {
    const channels: Record<string, ChannelResult> = {};
    for (const service of REPOST_CHANNELS) {
      try {
        channels[service] = await o.republish(post.id, service);
      } catch (e) {
        channels[service] = { ok: false, detail: String(e) };
      }
    }
    let done = false;
    if (channels.instagram?.ok) {
      // Off the queue only if it was not queued again meanwhile (a newer replacement).
      const { data: left } = await o.supabase.from("ig_pending_review")
        .update({ repost_requested_at: null, reposted_at: now().toISOString() })
        .eq("id", post.id).eq("repost_requested_at", post.repost_requested_at).select("id");
      done = Array.isArray(left) && left.length === 1;
    }
    runs.push({ id: post.id, channels, done });
  }
  return { queued, runs, held };
}
