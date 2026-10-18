// The decisions regenerate-chapter-art makes when it redraws an APPROVED cover,
// kept pure so node tests import them directly: the scene it redraws from,
// whether the new image may replace the approved one with nobody looking, and
// what changes on the row when it does.

/**
 * The scene to redraw an approved cover from. A stored prompt may be the scene
 * alone (bulk generation) or the whole prompt that was sent: scene, canonical
 * details, rules and style (the Gita, a reviewer's regenerate). Details, rules
 * and style are added again from the approved configuration, so only the scene
 * is kept — and never a correction lead an earlier redraw put in front of it.
 */
export function sceneDraft(prompt: unknown): string {
  if (typeof prompt !== "string") return "";
  let text = prompt.split(/\s*(?:Canonical details:|museum-quality|STRICTLY ANCIENT|ABSOLUTE GENDER RULES|ABSOLUTE ANACHRONISM RULES)/i)[0];
  text = text.replace(/^\s*CORRECTION — the painting must clearly show:[^]*?\.(?:\s+The previous attempt was wrong:[^]*?\.)?(?=\s|$)\s*/u, "");
  return text.trim();
}

/**
 * Whether a redrawn image may replace an approved one with no reviewer looking.
 * Only a check that passed, or one with nothing to check (no research fact in
 * the prompt, or the check switched off: the same as any new cover). A detail
 * still wrong after the corrected attempts keeps the approved image, and so does
 * a check that could not run (an API error, a timeout, the time budget): an
 * unchecked image never replaces one a reviewer chose.
 */
export function mayReplace(record: { status?: unknown; reason?: unknown } | null | undefined): boolean {
  if (record?.status === "pass") return true;
  return record?.status === "skipped" && (record.reason === "no_facts" || record.reason === "disabled");
}

/**
 * What changes on the row when the new image replaces the approved one. A book
 * whose approved covers are posted to social media (daily-approved-art-post: the
 * Gita and the Chaitanya Charitamrita, one a day) gets posted_at cleared, so the
 * new image goes out again: the poster takes unposted covers oldest first.
 */
export function replacementFields(reposts: boolean, url: string, path: string, record: Record<string, unknown>) {
  return {
    image_url: url,
    image_path: path,
    visual_check: record,
    error_message: null,
    ...(reposts ? { posted_at: null } : {}),
  };
}

/** How every note a redraw leaves on the row begins (the gallery waits for one). */
export const KEPT_PREFIX = "Regenerate kept the approved image";

/** What the row says when a redraw could not replace the approved image. */
export function keptMessage(
  record: { status?: unknown; reason?: unknown; failed?: unknown[]; attempts?: unknown } | null,
  rendered: boolean,
): string {
  if (!rendered || !record) return `${KEPT_PREFIX}: every image attempt failed.`;
  if (record.status === "fail") {
    const n = Array.isArray(record.failed) ? record.failed.length : 0;
    const attempts = Number(record.attempts) || 1;
    return `${KEPT_PREFIX}: ${n} detail${n === 1 ? "" : "s"} still wrong after ${attempts} attempt${attempts === 1 ? "" : "s"}.`;
  }
  const why = typeof record.reason === "string" && record.reason ? record.reason : String(record.status ?? "unknown");
  return `${KEPT_PREFIX}: the new image could not be checked (${why}).`;
}
