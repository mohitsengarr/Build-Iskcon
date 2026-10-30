// Re-sending a cover to a channel that failed (owner, 2026-10-30: Gita covers
// #51, #53, #54 and #55 reached Threads on 24-27 Oct but not Instagram, whose
// Buffer channel had been removed; "send them to mohit.bhaktigram, one a day").
//
// daily-approved-art-post { resend: "instagram" } sends ONE such cover a run
// (pg_cron, 10:00 UTC daily): the oldest approved, already-posted cover whose
// last attempt failed on that channel (error_message carries "<channel>: ..."),
// still with Krishna in it, and not already re-sent since it was posted
// (social_post_log). A success clears that channel's error so the cover is not
// sent again; a failure keeps it, so tomorrow's run tries once more.

export interface ResendRow {
  id: unknown;
  status?: unknown;
  posted_at?: unknown;
  error_message?: unknown;
  image_url?: unknown;
}

/** The "<channel>: ..." parts of an error_message. */
export function errorParts(errorMessage: unknown): string[] {
  return String(errorMessage ?? "").split(" | ").map((s) => s.trim()).filter(Boolean);
}

/** Whether the cover's last attempt failed on this channel. */
export function failedOn(errorMessage: unknown, service: string): boolean {
  return errorParts(errorMessage).some((p) => p.toLowerCase().startsWith(`${service.toLowerCase()}:`));
}

/** error_message with this channel's failure removed; null when nothing is left. */
export function withoutChannelError(errorMessage: unknown, service: string): string | null {
  const rest = errorParts(errorMessage).filter((p) => !p.toLowerCase().startsWith(`${service.toLowerCase()}:`));
  return rest.length ? rest.join(" | ") : null;
}

/** Why this cover may not be re-sent to the channel, or null when it may. */
export function resendRefusal(row: ResendRow | null | undefined, service: string): string | null {
  if (!row) return "not found";
  if (row.status !== "approved") return `status ${String(row.status)}`;
  if (!row.posted_at) return "never posted";
  if (typeof row.image_url !== "string" || !row.image_url) return "no image";
  if (!failedOn(row.error_message, service)) return `did not fail on ${service}`;
  return null;
}

/** Oldest-posted first, so the covers go out in the order they were meant to. */
export function orderResends<T extends ResendRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(a.posted_at ?? "").localeCompare(String(b.posted_at ?? "")));
}

export interface ResendCandidate {
  book: { key: string; table: string; label: string };
  row: ResendRow & Record<string, unknown>;
}

/**
 * The one cover to re-send: the first, oldest-posted candidate that failed on
 * the channel, still has Krishna in it and has not been re-sent since. A log
 * that cannot be read (alreadySent null) holds the cover back: never a double post.
 */
export async function pickResend(o: {
  candidates: ResendCandidate[];
  service: string;
  alreadySent: (c: ResendCandidate) => Promise<boolean | null>;
  gate: (c: ResendCandidate) => Promise<{ allowed: boolean; reason: string }>;
}): Promise<{ pick: ResendCandidate | null; held: Array<{ book: string; id: unknown; reason: string }> }> {
  const held: Array<{ book: string; id: unknown; reason: string }> = [];
  const sorted = orderResends(o.candidates.map((c) => ({ ...c, posted_at: c.row.posted_at })));
  for (const c of sorted) {
    const refusal = resendRefusal(c.row, o.service);
    if (refusal) {
      held.push({ book: c.book.key, id: c.row.id, reason: refusal });
      continue;
    }
    let sent: boolean | null;
    try {
      sent = await o.alreadySent(c);
    } catch {
      sent = null;
    }
    if (sent !== false) {
      held.push({ book: c.book.key, id: c.row.id, reason: sent ? `already sent to ${o.service} since it was posted` : "could not read the post log" });
      continue;
    }
    let verdict: { allowed: boolean; reason: string };
    try {
      verdict = await o.gate(c);
    } catch (e) {
      verdict = { allowed: false, reason: `the Krishna check failed: ${String(e)}` };
    }
    if (!verdict.allowed) {
      held.push({ book: c.book.key, id: c.row.id, reason: verdict.reason });
      continue;
    }
    return { pick: { book: c.book, row: c.row }, held };
  }
  return { pick: null, held };
}
