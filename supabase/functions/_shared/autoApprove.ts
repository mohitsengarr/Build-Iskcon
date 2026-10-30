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

export const AUTO_APPROVE_TABLES = [
  "ig_pending_review",
  "gita_chapter_art_review",
  "chaitanya_chapter_art_review",
  "bhagavatam_chapter_art_review",
] as const;
export type AutoApproveTable = typeof AUTO_APPROVE_TABLES[number];

/** Watermark checks one run may make (each decodes an image). */
export const MAX_MARK_CHECKS = 5;

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

export async function autoApproveOne(o: {
  candidates: Candidate[];
  hasMark: (c: Candidate) => Promise<boolean | null>;
  approve: (c: Candidate) => Promise<{ ok: boolean; detail: string }>;
  maxMarkChecks?: number;
}): Promise<{
  approved: { table: string; id: unknown; detail: string } | null;
  skipped: Array<{ table: string; id: unknown; reason: string }>;
}> {
  const skipped: Array<{ table: string; id: unknown; reason: string }> = [];
  const maxChecks = o.maxMarkChecks ?? MAX_MARK_CHECKS;
  let checks = 0;
  for (const c of orderCandidates(o.candidates)) {
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
    if (result.ok) return { approved: { table: c.table, id: c.row.id, detail: result.detail }, skipped };
    skipped.push({ table: c.table, id: c.row.id, reason: `approval failed: ${result.detail}` });
  }
  return { approved: null, skipped };
}
