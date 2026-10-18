// Regenerating an APPROVED image from the gallery grid: a chapter cover or an
// older static image (regenerate-chapter-art) or a published Instagram post
// (regenerate-pending-image), all with replace_approved. Nothing approved
// changes: the function answers at once, draws and checks the new image after
// the response, and adds it to pending review as a replacement
// (_shared/replacements.ts). Approving it there swaps it in. The gallery waits
// until the replacement appears, or a note says nothing could be drawn.

export type ApprovedBook = "bhagavatam" | "chaitanya" | "gita" | "instagram";

export const APPROVED_TABLES: Record<ApprovedBook, string> = {
  bhagavatam: "bhagavatam_chapter_art_review",
  chaitanya: "chaitanya_chapter_art_review",
  gita: "gita_chapter_art_review",
  instagram: "ig_pending_review",
};

/**
 * What a Regenerate redraws: an approved row, or one of the older static
 * chapter images (by its manifest file name), which regenerate-chapter-art first
 * adopts as an approved Bhagavatam cover row.
 */
export type RedrawTarget = { book: ApprovedBook; id: number } | { legacyImage: string };

/** The edge function and request body that redraw an approved image. */
export function redrawRequest(art: RedrawTarget): { fn: string; body: Record<string, unknown> } {
  if ("legacyImage" in art) {
    return { fn: "regenerate-chapter-art", body: { book: "bhagavatam", legacy_image: art.legacyImage, replace_approved: true } };
  }
  return art.book === "instagram"
    ? { fn: "regenerate-pending-image", body: { id: art.id, replace_approved: true } }
    : { fn: "regenerate-chapter-art", body: { book: art.book, id: art.id, replace_approved: true } };
}

/** How every note a redraw leaves begins (regenerate-chapter-art/approved.ts). */
export const KEPT_PREFIX = "Regenerate kept the approved image";
/** How often the gallery reads the row while a redraw runs. */
export const REDRAW_POLL_MS = 15_000;
/** A redraw has at most the worker's background budget (~6 min); a little more, then stop waiting. */
export const REDRAW_GIVE_UP_MS = 8 * 60_000;

export function redrawConfirmText(book: ApprovedBook, opts: { legacy?: boolean } = {}): string {
  const what = opts.legacy ? "this older image" : "this approved image";
  const posting = book === "instagram"
    ? " Once approved, the post goes out again with the re-post queue (one a day)."
    : book === "gita" || book === "chaitanya"
    ? " Once approved, the cover goes out again with the daily post."
    : "";
  return `Draw a new image for ${what}?\n\nIt is drawn from the same scene with the approved settings, checked, and added to pending review. ` +
    `Approving it there replaces the current image; until then nothing changes.${posting}`;
}

/** The REST query that finds the replacement waiting for review, once it is stored. */
export function replacementWaitPath(target: RedrawTarget): string {
  if ("legacyImage" in target) {
    return `${APPROVED_TABLES.bhagavatam}?replaces_legacy->>image=eq.${encodeURIComponent(target.legacyImage)}&status=eq.pending&select=id&limit=1`;
  }
  return `${APPROVED_TABLES[target.book]}?replaces_id=eq.${target.id}&status=eq.pending&select=id&limit=1`;
}

/** The REST query that reads the note an approved row gets when nothing could be drawn. */
export function sourceNotePath(art: { book: ApprovedBook; id: number }): string {
  return `${APPROVED_TABLES[art.book]}?id=eq.${art.id}&select=error_message`;
}

/** The note a redraw leaves when nothing could be drawn, or null. */
export function redrawNote(rows: unknown): string | null {
  const note = Array.isArray(rows) ? (rows[0] as { error_message?: unknown } | undefined)?.error_message : null;
  return typeof note === "string" && note.startsWith(KEPT_PREFIX) ? note : null;
}

/** What a pending card says when it would replace an approved image, or null. */
export function replacementLabel(row: { replaces_id?: unknown; replaces_legacy?: unknown } | null | undefined): string | null {
  if (row?.replaces_id != null) return `Replacement for approved #${row.replaces_id}: approving swaps its image in`;
  const legacy = row?.replaces_legacy as { image?: unknown } | null | undefined;
  if (legacy && typeof legacy.image === "string") return `Replacement for the older image ${legacy.image}: approving swaps it in`;
  return null;
}
