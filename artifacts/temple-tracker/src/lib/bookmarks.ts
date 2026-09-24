// Where a reader saves a bookmark.
//
// Every reader posts with `Prefer: resolution=merge-duplicates`, but PostgREST
// only merges when the request names the conflicting columns. Without
// on_conflict, saving a page that was already bookmarked came back 409 and the
// reader was told the bookmark could not be saved. The unique index behind this
// is (reader_id, page_number) on each book's bookmarks table.

export const BOOKMARK_CONFLICT_COLUMNS = "reader_id,page_number";

/** The PostgREST path a bookmark POST goes to, e.g. "gita_bookmarks?on_conflict=reader_id,page_number". */
export function bookmarkUpsertPath(table: string): string {
  const name = String(table ?? "").trim();
  if (!name) throw new Error("bookmarkUpsertPath: no table");
  const separator = name.includes("?") ? "&" : "?";
  return `${name}${separator}on_conflict=${BOOKMARK_CONFLICT_COLUMNS}`;
}

/** The Prefer header for that POST: return the row, and merge onto the existing one. */
export const BOOKMARK_UPSERT_PREFER = "return=representation,resolution=merge-duplicates";

// ── The line a bookmark returns to ───────────────────────────────────────────
//
// A bookmark stores the first 80 characters of the topmost line the reader could
// see, so reopening it lands on that line rather than the top of the page.

/** Height of the sticky top bar; a line under it is not the one being read. */
export const HEADER_BUFFER_PX = 90;
/** How much of the visible line is stored. */
export const ANCHOR_CHARS = 80;

interface Rect { top: number; bottom: number; height: number }
interface AnchorParagraph {
  textContent: string | null;
  getBoundingClientRect(): Rect;
}

/**
 * The topmost paragraph visible below the header, which is the line the reader
 * is on. Empty paragraphs are skipped, and a paragraph scrolled off the top
 * counts only while part of it is still on screen.
 */
export function findTopmostVisible<T extends AnchorParagraph>(paragraphs: Iterable<T>): T | null {
  let best: T | null = null;
  let bestTop = Infinity;
  for (const p of paragraphs) {
    if (!p.textContent?.trim()) continue;
    const rect = p.getBoundingClientRect();
    const distFromHeader = rect.top - HEADER_BUFFER_PX;
    if (rect.bottom > HEADER_BUFFER_PX && distFromHeader < bestTop && distFromHeader > -rect.height) {
      bestTop = distFromHeader;
      best = p;
    }
  }
  return best;
}

/** What a bookmark stores for the line it was saved on, or null when there is nothing to store. */
export function anchorFor(text: unknown): string | null {
  const t = typeof text === "string" ? text.trim() : "";
  return t ? t.substring(0, ANCHOR_CHARS) || null : null;
}

/**
 * Whether a paragraph is the line an anchor was taken from. The text may have
 * been re-flowed or re-formatted since, so the head of the anchor is enough:
 * the same opening, or the opening found anywhere in the line.
 */
export function anchorMatches(paragraphText: unknown, anchor: unknown): boolean {
  const a = typeof anchor === "string" ? anchor.trim() : "";
  if (a.length <= 4) return false;
  const text = typeof paragraphText === "string" ? paragraphText.trim() : "";
  if (!text) return false;
  const needle = a.substring(0, 60);
  return text.startsWith(needle.substring(0, 30)) || text.includes(needle.substring(0, 40));
}

/** The paragraph a bookmark's anchor points at, or null when the line is gone. */
export function findAnchoredParagraph<T extends { textContent: string | null }>(paragraphs: Iterable<T>, anchor: unknown): T | null {
  for (const p of paragraphs) {
    if (anchorMatches(p.textContent, anchor)) return p;
  }
  return null;
}
