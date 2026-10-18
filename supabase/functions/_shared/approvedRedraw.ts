// The decisions made when an APPROVED image is redrawn — a chapter cover
// (regenerate-chapter-art) or a published Instagram post (regenerate-pending-
// image) — kept pure so node tests import them directly: the scene it redraws
// from, whether the new image may replace the approved one with nobody looking,
// and what changes on the row when it does.

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

// ── Older static images ──────────────────────────────────────────────────────
// The first Bhagavatam chapter images are static files listed in the site's
// /api/bhagwatham/image-manifest, with no review row. Redrawing one first adopts
// it: the file is copied into storage as an approved cover row for its chapter
// and the static copy is hidden (bhagavatam_image_deletes), so the chapter keeps
// a database-backed image even when the redraw itself does not pass.

export interface LegacyManifestEntry {
  chapterNumber?: unknown;
  cantoNumber?: unknown;
  chapterTitle?: unknown;
  imagePath?: unknown;
  prompt?: unknown;
  descriptionHi?: unknown;
  sceneIndex?: unknown;
}

/** A manifest file name: one plain name, never a path. */
export function isLegacyImageName(name: unknown): name is string {
  return typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:jpe?g|png|webp)$/i.test(name) && !name.includes("..");
}

/** Where an adopted static image is kept in the covers' bucket. */
export function legacyStoragePath(name: string): string {
  return `art-legacy-${name}`;
}

export function imageContentType(name: string): string {
  return /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : "image/jpeg";
}

const wholeAtLeast = (v: unknown, min: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min ? v : null;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The approved cover row an adopted static image becomes, or null when the
 * manifest entry or the chapter index cannot place it. scene_index stays null:
 * the manifest's scene numbers are not the pre-extracted scenes' indexes.
 */
export function legacyCoverRow(
  entry: LegacyManifestEntry,
  chapter: { number?: unknown; skandh?: unknown; title?: unknown } | null | undefined,
  image: { url: string; path: string },
  now: Date,
) {
  const g = wholeAtLeast(entry.chapterNumber, 1);
  const inCanto = wholeAtLeast(chapter?.number, 1);
  const canto = wholeAtLeast(chapter?.skandh, 1) ?? wholeAtLeast(entry.cantoNumber, 1);
  if (g === null || inCanto === null || canto === null) return null;
  return {
    chapter_global_number: g,
    chapter_canto: canto,
    chapter_in_canto: inCanto,
    chapter_title: text(entry.chapterTitle) ?? text(chapter?.title),
    image_url: image.url,
    image_path: image.path,
    prompt: text(entry.prompt),
    description_hi: text(entry.descriptionHi),
    scene_index: null,
    status: "approved",
    reviewed_at: now.toISOString(),
    error_message: null,
  };
}

/** The gallery's key for a static image: what bhagavatam_image_deletes hides. */
export function legacyHideKey(entry: LegacyManifestEntry): { chapter_number: number; scene_index: number } | null {
  const g = wholeAtLeast(entry.chapterNumber, 1);
  if (g === null) return null;
  return { chapter_number: g, scene_index: wholeAtLeast(entry.sceneIndex, 0) ?? 0 };
}
