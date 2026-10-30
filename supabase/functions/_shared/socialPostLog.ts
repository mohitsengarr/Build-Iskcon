// Every picture Buffer accepted for Instagram or Threads, one row per channel
// (table social_post_log, migration 20261030120000). It answers two questions:
// - has a picture gone to Threads today? (threads-daily-image, owner 2026-10-30:
//   "make sure daily one image goes in Threads")
// - has this queued post already gone to a channel since it was queued? (the
//   posting queue then skips that channel instead of posting it twice)
// Writing is best effort: a failed log write never fails a post.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface SocialPost {
  service: string;
  source_table: string;
  source_id: number;
  buffer_post_id: string;
  image_url?: string | null;
}

export async function logSocialPosts(supabase: SupabaseLike, posts: SocialPost[], log: (line: string) => void = console.log): Promise<void> {
  const rows = posts.filter((p) => p && p.service && p.buffer_post_id);
  if (rows.length === 0) return;
  try {
    const { error } = await supabase.from("social_post_log").insert(rows);
    if (error) log(`[social-log] could not log ${rows.length} post(s): ${error.message}`);
  } catch (e) {
    log(`[social-log] could not log ${rows.length} post(s): ${String(e)}`);
  }
}

/**
 * Whether a picture went to this channel since `since` (optionally: this source
 * row's picture). null when the log could not be read, so callers can tell
 * "no" from "unknown".
 */
export async function postedSince(
  supabase: SupabaseLike,
  o: { service: string; since: string; source_table?: string; source_id?: number },
): Promise<boolean | null> {
  try {
    let q = supabase.from("social_post_log").select("id").eq("service", o.service).gte("created_at", o.since);
    if (o.source_table) q = q.eq("source_table", o.source_table);
    if (o.source_id != null) q = q.eq("source_id", o.source_id);
    const { data, error } = await q.limit(1);
    if (error) return null;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return null;
  }
}
