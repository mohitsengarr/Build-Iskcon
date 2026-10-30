// Auto-approval of new Bhaktigram images (owner, 2026-10-30: "auto approve all
// new Bhaktigram watermarked images ... but do not bulk push in the mobile app or
// Threads/Insta anywhere, just one at a time").
//
// auto-approve-art runs every 30 minutes and approves ONE waiting image a run,
// through the same steps a reviewer's Approve takes. Instagram posts go first
// (approve-instagram-post queues them for Instagram and Threads, where the posting
// queue sends one at a time and only pictures with Krishna in them), then the
// oldest cover of any book. An image is approved only when:
//   - it is waiting for review (pending) and no reviewer has claimed it,
//   - its image check passed, or had no facts to check (no_facts); a failed,
//     running or errored check stays for a person to review,
//   - it carries the Bhaktigram watermark (checked on the image itself).
//
// Bulk mode (owner, 2026-10-31, looking at 197 waiting covers: "auto approve all
// these"): a call may take up to MAX_BULK_APPROVALS images with the same rules,
// from one scope — covers only, Instagram posts only, or all. Covers are chapter
// art in the reader, posted nowhere by approval (Gita and Chaitanya covers then
// go out one a day), so approving them together pushes nothing in bulk.

export const AUTO_APPROVE_TABLES = [
  "ig_pending_review",
  "gita_chapter_art_review",
  "chaitanya_chapter_art_review",
  "bhagavatam_chapter_art_review",
] as const;
export type AutoApproveTable = typeof AUTO_APPROVE_TABLES[number];

/** Watermark checks a one-image run may make (each decodes an image). */
export const MAX_MARK_CHECKS = 5;
/** Approvals one bulk call may make. */
export const MAX_BULK_APPROVALS = 25;

/** How many images a call takes: 1 unless asked, never more than MAX_BULK_APPROVALS. */
export function approvalsPerRun(limit: unknown): number {
  const n = typeof limit === "number" && Number.isInteger(limit) ? limit : 1;
  return Math.min(MAX_BULK_APPROVALS, Math.max(1, n));
}

/** The review tables a call takes from: all (default), covers only, or Instagram posts only. */
export function scopeTables(scope: unknown): readonly AutoApproveTable[] {
  if (scope == null || scope === "all") return AUTO_APPROVE_TABLES;
  if (scope === "covers") return AUTO_APPROVE_TABLES.filter((t) => t !== "ig_pending_review");
  if (scope === "posts") return ["ig_pending_review"];
  throw new Error(`unknown scope '${String(scope)}'`);
}

export interface Candidate {
  table: AutoApproveTable;
  row: Record<string, unknown>;
}

/** Why a waiting row may not be approved automatically, or null when it may. */
export function autoApproveRefusal(table: string, row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return "not found";
  if (row.status !== "pending") return `status ${String(row.status)}`;
  if (typeof row.image_path !== "string" || !row.image_path || typeof row.image_url !== "string" || !row.image_url) return "no image";
  // An Instagram post a reviewer is approving or rejecting right now.
  if (table === "ig_pending_review" && row.reviewed_at != null) return "a reviewer is acting on it";
  // deno-lint-ignore no-explicit-any
  const vc = row.visual_check as any;
  const status = vc?.status;
  if (status === "pass") return null;
  if (status === "skipped" && vc?.reason === "no_facts") return null;
  return `image check ${status ?? "missing"}${vc?.reason ? ` (${vc.reason})` : ""}: left for a person to review`;
}

/** Instagram posts first, then covers oldest first. */
export function orderCandidates(candidates: Candidate[]): Candidate[] {
  const t = (c: Candidate) => String(c.row.created_at ?? "");
  return [...candidates].sort((a, b) => {
    const ai = a.table === "ig_pending_review" ? 0 : 1;
    const bi = b.table === "ig_pending_review" ? 0 : 1;
    return ai !== bi ? ai - bi : t(a).localeCompare(t(b));
  });
}

export interface Approved {
  table: string;
  id: unknown;
  detail: string;
}

/** Approves up to `limit` eligible images (1 unless asked), in order, with the same rules for each. */
export async function autoApproveMany(o: {
  candidates: Candidate[];
  hasMark: (c: Candidate) => Promise<boolean | null>;
  approve: (c: Candidate) => Promise<{ ok: boolean; detail: string }>;
  limit?: unknown;
  maxMarkChecks?: number;
}): Promise<{
  approved: Approved[];
  skipped: Array<{ table: string; id: unknown; reason: string }>;
}> {
  const take = approvalsPerRun(o.limit);
  const approved: Approved[] = [];
  const skipped: Array<{ table: string; id: unknown; reason: string }> = [];
  // A bulk call may look past a few unmarked images for each one it approves.
  const maxChecks = o.maxMarkChecks ?? (take === 1 ? MAX_MARK_CHECKS : take + MAX_MARK_CHECKS);
  let checks = 0;
  for (const c of orderCandidates(o.candidates)) {
    if (approved.length >= take) break;
    const refusal = autoApproveRefusal(c.table, c.row);
    if (refusal) {
      skipped.push({ table: c.table, id: c.row.id, reason: refusal });
      continue;
    }
    if (checks >= maxChecks) break;
    checks++;
    let marked: boolean | null;
    try {
      marked = await o.hasMark(c);
    } catch {
      marked = null;
    }
    if (marked !== true) {
      skipped.push({ table: c.table, id: c.row.id, reason: marked === false ? "no Bhaktigram watermark on the image" : "could not check the watermark" });
      continue;
    }
    let result: { ok: boolean; detail: string };
    try {
      result = await o.approve(c);
    } catch (e) {
      result = { ok: false, detail: String(e) };
    }
    if (result.ok) approved.push({ table: c.table, id: c.row.id, detail: result.detail });
    else skipped.push({ table: c.table, id: c.row.id, reason: `approval failed: ${result.detail}` });
  }
  return { approved, skipped };
}

/** One image a run (pg_cron): the first eligible one. */
export async function autoApproveOne(o: {
  candidates: Candidate[];
  hasMark: (c: Candidate) => Promise<boolean | null>;
  approve: (c: Candidate) => Promise<{ ok: boolean; detail: string }>;
  maxMarkChecks?: number;
}): Promise<{
  approved: Approved | null;
  skipped: Array<{ table: string; id: unknown; reason: string }>;
}> {
  const out = await autoApproveMany({ ...o, limit: 1 });
  return { approved: out.approved[0] ?? null, skipped: out.skipped };
}
