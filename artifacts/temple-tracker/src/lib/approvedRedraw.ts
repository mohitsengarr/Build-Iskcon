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

/** The edge function and request body that redraw an approved image. */
export function redrawRequest(art: { book: ApprovedBook; id: number }): { fn: string; body: Record<string, unknown> } {
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

export function redrawConfirmText(book: ApprovedBook): string {
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
