// Regenerating an APPROVED image from the gallery grid: a chapter cover
// (regenerate-chapter-art) or a published Instagram post (regenerate-pending-
// image), both with replace_approved. The function answers at once and works
// after the response: it replaces the image only if the new one passes its
// visual check, and otherwise leaves a note on the row. The gallery waits for
// one or the other.

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

/**
 * Instagram posts are posted again at once; Gita and Chaitanya covers with the
 * next daily post; Bhagavatam covers are posted nowhere.
 */
export function repostsOnSocial(book: ApprovedBook): boolean {
  return book !== "bhagavatam";
}

export function redrawConfirmText(book: ApprovedBook, opts: { legacy?: boolean } = {}): string {
  if (opts.legacy) {
    return "Regenerate this image?\n\nIt becomes this chapter's approved cover, kept in the database. A new image is then drawn " +
      "from the same scene with the approved settings and checked; it replaces this one only if the check passes — a few minutes.";
  }
  const posting = book === "instagram"
    ? " It is then posted to Instagram and Threads again straight away."
    : repostsOnSocial(book)
    ? " It is then posted to Instagram and Threads again with the next daily post."
    : "";
  return "Regenerate this approved image?\n\nA new image is drawn from the same scene with the approved settings and checked. " +
    `It replaces this one only if the check passes — a few minutes.${posting}`;
}

/** The url without a cache-busting query, for comparing images. */
export function bareUrl(url: string | null | undefined): string {
  return typeof url === "string" ? url.split("?")[0] : "";
}

export type RedrawOutcome =
  | { kind: "replaced"; url: string }
  | { kind: "kept"; message: string }
  /** No longer approved: a reviewer changed it meanwhile. */
  | { kind: "gone" }
  | { kind: "waiting" };

/** What the row says now about a redraw of the image at `startUrl`. */
export function redrawOutcome(
  startUrl: string,
  row: { image_url?: string | null; error_message?: string | null; status?: string | null } | null | undefined,
): RedrawOutcome {
  if (!row || row.status !== "approved") return { kind: "gone" };
  if (row.image_url && bareUrl(row.image_url) !== bareUrl(startUrl)) return { kind: "replaced", url: row.image_url };
  if (typeof row.error_message === "string" && row.error_message.startsWith(KEPT_PREFIX)) {
    return { kind: "kept", message: row.error_message };
  }
  return { kind: "waiting" };
}
