// Regenerating an APPROVED cover from the gallery grid (regenerate-chapter-art
// with replace_approved). The function answers at once and works after the
// response: it replaces the image only if the new one passes its visual check,
// and otherwise leaves a note on the row. The gallery waits for one or the other.

export type ApprovedBook = "bhagavatam" | "chaitanya" | "gita";

export const APPROVED_TABLES: Record<ApprovedBook, string> = {
  bhagavatam: "bhagavatam_chapter_art_review",
  chaitanya: "chaitanya_chapter_art_review",
  gita: "gita_chapter_art_review",
};

/** How every note a redraw leaves begins (regenerate-chapter-art/approved.ts). */
export const KEPT_PREFIX = "Regenerate kept the approved image";
/** How often the gallery reads the row while a redraw runs. */
export const REDRAW_POLL_MS = 15_000;
/** A redraw has at most the worker's background budget (~6 min); a little more, then stop waiting. */
export const REDRAW_GIVE_UP_MS = 8 * 60_000;

/** The Gita and the Chaitanya Charitamrita are posted daily; Bhagavatam covers nowhere. */
export function repostsOnSocial(book: ApprovedBook): boolean {
  return book !== "bhagavatam";
}

export function redrawConfirmText(book: ApprovedBook): string {
  const posting = repostsOnSocial(book)
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
