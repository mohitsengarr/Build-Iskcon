// The decisions made when an APPROVED image is redrawn — a chapter cover
// (regenerate-chapter-art) or a published Instagram post (regenerate-pending-
// image) — kept pure so node tests import them directly: the scene it redraws
// from, the note left when nothing could be drawn, and where an older static
// image's replacement comes from. The replacement itself waits for review
// (_shared/replacements.ts).

/**
 * The scene to redraw an approved cover from. A stored prompt may be the scene
 * alone (bulk generation) or the whole prompt that was sent: scene, canonical
 * details, rules and style (the Gita, a reviewer's regenerate). Details, rules
 * and style are added again from the approved configuration, so only the scene
 * is kept — and never a correction lead an earlier redraw put in front of it.
 */
const STYLE_MARKERS = /\s*(?:Canonical details:|museum-quality|STRICTLY ANCIENT|ABSOLUTE GENDER RULES|ABSOLUTE ANACHRONISM RULES)/gi;
/** A marker this early opens the prompt (a hand-written "Museum-quality ... painting of ..."), not its tail. */
const MIN_SCENE_CHARS = 20;

export function sceneDraft(prompt: unknown): string {
  if (typeof prompt !== "string") return "";
  const text = prompt.replace(/^\s*CORRECTION — the painting must clearly show:[^]*?\.(?:\s+The previous attempt was wrong:[^]*?\.)?(?=\s|$)\s*/u, "");
  for (const m of text.matchAll(STYLE_MARKERS)) {
    if ((m.index ?? 0) >= MIN_SCENE_CHARS) return text.slice(0, m.index).trim();
  }
  return text.trim();
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
// /api/bhagwatham/image-manifest, with no review row. A replacement for one is a
// pending cover row for its chapter that names the file (replaces_legacy);
// approving it hides the static copy (bhagavatam_image_deletes).

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

const wholeAtLeast = (v: unknown, min: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min ? v : null;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The chapter fields a static image's replacement row starts from, or null when
 * the manifest entry or the chapter index cannot place it. scene_index stays
 * null: the manifest's scene numbers are not the pre-extracted scenes' indexes.
 */
export function legacyReplacementBase(
  entry: LegacyManifestEntry,
  chapter: { number?: unknown; skandh?: unknown; title?: unknown } | null | undefined,
): Record<string, unknown> | null {
  const g = wholeAtLeast(entry.chapterNumber, 1);
  const inCanto = wholeAtLeast(chapter?.number, 1);
  const canto = wholeAtLeast(chapter?.skandh, 1) ?? wholeAtLeast(entry.cantoNumber, 1);
  if (g === null || inCanto === null || canto === null) return null;
  return {
    chapter_global_number: g,
    chapter_canto: canto,
    chapter_in_canto: inCanto,
    chapter_title: text(entry.chapterTitle) ?? text(chapter?.title),
    description_hi: text(entry.descriptionHi),
    scene_index: null,
    error_message: null,
  };
}

/**
 * The chapter-index entry for a static image's chapter. When the index lacks the
 * chapter (it misses global chapters 320-329, the end of Canto 11 and the start
 * of Canto 12), its number within the canto is worked out from another chapter
 * of the same canto: chapters of a canto are numbered consecutively, so
 * global - number is the same for all of them.
 */
export function chapterForEntry(
  entry: LegacyManifestEntry,
  chapters: Array<{ globalNumber?: unknown; number?: unknown; skandh?: unknown; title?: unknown }> | null | undefined,
): { number: number; skandh: number; title: unknown } | null {
  const g = wholeAtLeast(entry.chapterNumber, 1);
  if (g === null || !Array.isArray(chapters)) return null;
  const direct = chapters.find((c) => c?.globalNumber === g);
  const n = wholeAtLeast(direct?.number, 1);
  const k = wholeAtLeast(direct?.skandh, 1);
  if (direct && n !== null && k !== null) return { number: n, skandh: k, title: direct.title };
  const canto = wholeAtLeast(entry.cantoNumber, 1);
  if (canto === null) return null;
  const anchor = chapters.find((c) =>
    c?.skandh === canto && wholeAtLeast(c?.globalNumber, 1) !== null && wholeAtLeast(c?.number, 1) !== null);
  if (!anchor) return null;
  const inCanto = g - ((anchor.globalNumber as number) - (anchor.number as number));
  return inCanto >= 1 ? { number: inCanto, skandh: canto, title: null } : null;
}

/** The gallery's key for a static image: what bhagavatam_image_deletes hides. */
export function legacyHideKey(entry: LegacyManifestEntry): { chapter_number: number; scene_index: number } | null {
  const g = wholeAtLeast(entry.chapterNumber, 1);
  if (g === null) return null;
  return { chapter_number: g, scene_index: wholeAtLeast(entry.sceneIndex, 0) ?? 0 };
}
