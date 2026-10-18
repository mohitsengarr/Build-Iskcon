// Replacement images that wait for review (migration 20261019100000).
//
// Regenerating an approved cover or Instagram post never changes it on the spot:
// the new image becomes a PENDING row that names the row it would replace
// (replaces_id), with the original's own chapter, caption and hashtags, so it is
// reviewed like any new image. An older static Bhagavatam image has no row; its
// replacement names the manifest file instead (replaces_legacy).
//
// Approving a replacement (approveReplacement) copies its image onto the
// original, which keeps its id — a post keeps its likes and comments — and marks
// the replacement 'replaced'. The original is then posted again, a little at a
// time: a Gita or Chaitanya cover rejoins the one-a-day queue of
// daily-approved-art-post (posted_at cleared), an Instagram post the re-post queue
// of repost-replaced-posts (repost_requested_at). Rejecting a replacement only
// rejects it: the original stays as it is and nothing is regenerated.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export type ReviewTable =
  | "bhagavatam_chapter_art_review"
  | "chaitanya_chapter_art_review"
  | "gita_chapter_art_review"
  | "ig_pending_review";

export interface LegacyRef {
  image: string;
  chapter_number: number;
  scene_index: number;
}

/** Fields that belong to one row, never copied from the original to its replacement. */
const OWN_FIELDS = new Set([
  "id", "status", "created_at", "reviewed_at", "image_url", "image_path", "visual_check", "error_message",
  "posted_at", "buffer_post_ids", "publish_started_at", "repost_requested_at", "reposted_at", "scene_rejected",
  "replaces_id", "replaces_legacy", "image_prompt", "prompt",
]);

/** Instagram posts keep their drawing prompt in image_prompt, covers in prompt. */
export function promptColumn(table: ReviewTable): "image_prompt" | "prompt" {
  return table === "ig_pending_review" ? "image_prompt" : "prompt";
}

/** Whether a review row is a replacement waiting to take another image's place. */
export function isReplacement(row: { replaces_id?: unknown; replaces_legacy?: unknown } | null | undefined): boolean {
  return row?.replaces_id != null || row?.replaces_legacy != null;
}

/**
 * The pending row a replacement becomes: the original's own fields (chapter,
 * caption, hashtags, verse ...), the new image, its check record and the prompt
 * it was drawn from.
 */
export function candidateRow(
  table: ReviewTable,
  source: Record<string, unknown>,
  image: { url: string; path: string },
  record: unknown,
  draft: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) if (!OWN_FIELDS.has(k)) out[k] = v;
  return {
    ...out,
    image_url: image.url,
    image_path: image.path,
    visual_check: record ?? null,
    [promptColumn(table)]: draft,
    status: "pending",
    error_message: null,
    replaces_id: source.id,
  };
}

/**
 * What approving a replacement changes on the original: its image, check record
 * and prompt — and it is posted again: a Gita or Chaitanya cover by the daily
 * poster (posted_at cleared), an Instagram post by the re-post queue. Bhagavatam
 * covers are posted nowhere.
 */
export function mergeFields(table: ReviewTable, candidate: Record<string, unknown>, now: Date): Record<string, unknown> {
  const prompt = promptColumn(table);
  const base = {
    image_url: candidate.image_url,
    image_path: candidate.image_path,
    visual_check: candidate.visual_check ?? null,
    [prompt]: candidate[prompt] ?? null,
    error_message: null,
  };
  if (table === "ig_pending_review") return { ...base, repost_requested_at: now.toISOString() };
  if (table === "gita_chapter_art_review" || table === "chaitanya_chapter_art_review") return { ...base, posted_at: null };
  return base;
}

export type ApproveResult =
  | { merged: number }
  | { approved: true; hidden?: boolean }
  | { error: string; status: number };

/**
 * Approves a pending replacement (see the header). When its original is no
 * longer approved (rejected or replaced meanwhile) the replacement is approved in
 * its place, an Instagram one queued to be posted. A static image's replacement
 * is approved itself and the static copy hidden. Each write is a compare-and-swap
 * on the status it expects, so a double click is a no-op.
 */
export async function approveReplacement(
  supabase: SupabaseLike,
  table: ReviewTable,
  row: Record<string, unknown>,
  now: Date = new Date(),
): Promise<ApproveResult> {
  const reviewedAt = now.toISOString();
  const approveSelf = async (extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.from(table)
      .update({ status: "approved", reviewed_at: reviewedAt, ...extra })
      .eq("id", row.id).eq("status", "pending").select("id");
    if (error) return { error: `Approve update: ${error.message}`, status: 500 };
    if (!Array.isArray(data) || data.length === 0) return { error: "Already reviewed", status: 409 };
    return null;
  };

  const legacy = row.replaces_legacy as LegacyRef | null | undefined;
  if (row.replaces_id == null && legacy) {
    const failed = await approveSelf();
    if (failed) return failed;
    const { error } = await supabase.from("bhagavatam_image_deletes").upsert(
      { chapter_number: legacy.chapter_number, scene_index: legacy.scene_index ?? 0, requested_by: `approved replacement #${row.id}` },
      { onConflict: "chapter_number,scene_index", ignoreDuplicates: true },
    );
    return { approved: true, hidden: !error };
  }

  const { data: merged, error: mergeErr } = await supabase.from(table)
    .update(mergeFields(table, row, now))
    .eq("id", row.replaces_id).eq("status", "approved").select("id");
  if (mergeErr) return { error: `Replacing #${row.replaces_id}: ${mergeErr.message}`, status: 500 };
  if (Array.isArray(merged) && merged.length === 1) {
    const { error } = await supabase.from(table)
      .update({ status: "replaced", reviewed_at: reviewedAt })
      .eq("id", row.id).eq("status", "pending");
    if (error) console.warn(`[replacements] ${table} #${row.id} copied onto #${row.replaces_id} but not marked replaced: ${error.message}`);
    return { merged: Number(row.replaces_id) };
  }
  // The original is no longer approved: this image takes its place as a row of its own.
  const failed = await approveSelf(table === "ig_pending_review" ? { repost_requested_at: reviewedAt } : {});
  return failed ?? { approved: true };
}

/** A pending replacement for this row already waiting: no second one is drawn. */
export async function hasPendingReplacement(supabase: SupabaseLike, table: ReviewTable, id: number): Promise<boolean> {
  const { data } = await supabase.from(table).select("id").eq("replaces_id", id).eq("status", "pending").limit(1);
  return Array.isArray(data) && data.length > 0;
}

/**
 * Rejects a pending replacement: it is marked rejected and its own file
 * deleted. The row it would have replaced stays as it is, and nothing is
 * regenerated — the reviewer can ask for another with Regenerate.
 */
export async function rejectReplacement(
  supabase: SupabaseLike,
  table: ReviewTable,
  bucket: string,
  row: Record<string, unknown>,
  now: Date = new Date(),
): Promise<{ rejected: true } | { error: string; status: number }> {
  const { data, error } = await supabase.from(table)
    .update({ status: "rejected", reviewed_at: now.toISOString() })
    .eq("id", row.id).eq("status", "pending").select("id");
  if (error) return { error: `Reject update: ${error.message}`, status: 500 };
  if (!Array.isArray(data) || data.length === 0) return { error: "Already reviewed", status: 409 };
  if (typeof row.image_path === "string" && row.image_path) {
    try {
      await supabase.storage.from(bucket).remove([row.image_path]);
    } catch { /* best effort */ }
  }
  return { rejected: true };
}

/** The answer an approve function gives for a replacement it approved or rejected. */
export function replacementResponse(
  id: unknown,
  result: ApproveResult | { rejected: true } | { error: string; status: number },
): { status: number; body: Record<string, unknown> } {
  if ("error" in result) return { status: result.status, body: { error: result.error } };
  if ("rejected" in result) {
    return { status: 200, body: { success: true, status: "rejected", id, replacement: true, message: "Replacement rejected; the approved image is unchanged." } };
  }
  if ("merged" in result) {
    return { status: 200, body: { success: true, status: "replaced", id, replaced_id: result.merged, replacement: true, message: `Approved: the new image replaced #${result.merged}.` } };
  }
  return { status: 200, body: { success: true, status: "approved", id, replacement: true, message: "Approved." } };
}
