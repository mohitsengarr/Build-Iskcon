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
// run moves on to the next one. A post already checked and held back costs
// nothing to skip, so the whole queue is read and only NEW checks are limited
// (MAX_NEW_CHECKS a run): a long run of held posts at the front can never stop the
// Krishna posts behind it (the 20-post look-ahead did, 24–27 Oct 2026).
//
// A channel that already took the post since it was queued (alreadyPosted, read
// from social_post_log) is not sent it again: when Instagram failed and Threads
// did not, a later run re-sends Instagram only, so Threads never gets the same
// picture twice.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

/** Channels in the order they are posted to; Instagram decides whether the post leaves the queue. */
export const REPOST_CHANNELS = ["instagram", "threads"] as const;
export const MAX_PER_RUN = 5;
/** New Krishna checks one run may start; posts already checked are free to skip. */
export const MAX_NEW_CHECKS = 20;
/** Queued posts read per group (never posted, then reposts). */
export const QUEUE_READ_LIMIT = 1000;

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

/**
 * Whether a queued post may go out now (the Krishna gate). mayCheck false: the
 * run has started enough new checks, so a post not checked yet waits for the next
 * run. checked: this call ran a new check.
 */
export type Gate = (post: QueuedPost, o: { mayCheck: boolean }) => Promise<{ allowed: boolean; reason: string; checked?: boolean }>;

/** Whether this channel already took the post since it was queued; null when unknown. */
export type AlreadyPosted = (post: QueuedPost, service: string) => Promise<boolean | null>;

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
  alreadyPosted?: AlreadyPosted;
  limit?: unknown;
  preview?: boolean;
  now?: () => Date;
}): Promise<{
  queued: Array<{ id: number; chapter_title: unknown; repost_requested_at: string }>;
  runs: RepostRun[];
  held: Array<{ id: number; reason: string; checked: boolean }>;
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
  const candidates = [...(await read(true, QUEUE_READ_LIMIT)), ...(await read(false, QUEUE_READ_LIMIT))];

  // The posts this run sends: the first `take` the gate lets through.
  const chosen: QueuedPost[] = [];
  const held: Array<{ id: number; reason: string; checked: boolean }> = [];
  let newChecks = 0;
  for (const post of candidates) {
    if (chosen.length >= take) break;
    let verdict: { allowed: boolean; reason: string; checked?: boolean };
    try {
      verdict = await o.gate(post, { mayCheck: newChecks < MAX_NEW_CHECKS });
    } catch (e) {
      // A gate that throws may have spent a check: it counts as one.
      verdict = { allowed: false, reason: `the Krishna check failed: ${String(e)}`, checked: true };
    }
    if (verdict.checked) newChecks++;
    if (verdict.allowed) chosen.push(post);
    else held.push({ id: post.id, reason: verdict.reason, checked: !!verdict.checked });
  }
  const queued = chosen.map((p) => ({ id: p.id, chapter_title: p.chapter_title, repost_requested_at: p.repost_requested_at }));
  if (o.preview) return { queued, runs: [], held };

  const runs: RepostRun[] = [];
  for (const post of chosen) {
    const channels: Record<string, ChannelResult> = {};
    for (const service of REPOST_CHANNELS) {
      let sent: boolean | null = null;
      try {
        sent = o.alreadyPosted ? await o.alreadyPosted(post, service) : null;
      } catch {
        sent = null;
      }
      // Unknown counts as not sent: a missed post is worse than a rare repeat.
      if (sent === true) {
        channels[service] = { ok: true, detail: "already posted since it was queued" };
        continue;
      }
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
