// Where the reader got to in a book, kept against their reader id so the place
// follows them from the phone to the desk.
//
// The device already remembers its own place (kindlePositionKey). This is the
// copy that travels. It is offered, never imposed: an earlier auto-resume
// fought with the scroll position, so the readers show "Continue from page N"
// and let the reader decide.

import { sbFetch } from "@/lib/sbRest";

export const PROGRESS_TABLE = "reader_progress";

/** How long the reader must stay on a page before it is worth storing. */
export const SAVE_AFTER_MS = 4000;

/** A place that is this close to the one already stored is not worth a write. */
export const SAVE_PAGE_GAP = 1;

export interface ReaderPlace {
  pageNumber: number;
  lineAnchor?: string | null;
  percent?: number | null;
}

export interface StoredProgress extends ReaderPlace {
  updatedAt: string | null;
}

/** Whether a new place is worth a write, given what is already stored. */
export function worthSaving(next: ReaderPlace | null | undefined, stored: ReaderPlace | null | undefined): boolean {
  if (!next || !Number.isFinite(next.pageNumber) || next.pageNumber <= 0) return false;
  if (!stored) return true;
  if (Math.abs(next.pageNumber - stored.pageNumber) > SAVE_PAGE_GAP) return true;
  // Same page, but the reader has moved to a different line on it.
  return (next.lineAnchor ?? null) !== (stored.lineAnchor ?? null);
}

/**
 * Whether the stored place is worth offering. A place on the page already open
 * is no offer at all, and a place from this very session is the reader's own.
 */
export function worthOffering(stored: ReaderPlace | null | undefined, currentPage: number | null | undefined): boolean {
  if (!stored || !Number.isFinite(stored.pageNumber) || stored.pageNumber <= 0) return false;
  if (!currentPage || !Number.isFinite(currentPage)) return true;
  return Math.abs(stored.pageNumber - currentPage) > SAVE_PAGE_GAP;
}

/** "Continue from page 418 — 37% in". */
export function resumeLabel(stored: ReaderPlace | null | undefined): string {
  if (!stored?.pageNumber) return "";
  const percent = typeof stored.percent === "number" && stored.percent > 0 ? ` — ${stored.percent}% in` : "";
  return `Continue from page ${stored.pageNumber}${percent}`;
}

/** The reader's place in this book, or null when there is none to be had. */
export async function fetchProgress(book: string, readerId: string): Promise<StoredProgress | null> {
  if (!book || !readerId) return null;
  try {
    const res = await sbFetch(
      `${PROGRESS_TABLE}?reader_id=eq.${encodeURIComponent(readerId)}&book=eq.${encodeURIComponent(book)}&select=page_number,line_anchor,percent,updated_at`,
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || typeof row.page_number !== "number") return null;
    return {
      pageNumber: row.page_number,
      lineAnchor: typeof row.line_anchor === "string" ? row.line_anchor : null,
      percent: typeof row.percent === "number" ? row.percent : null,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    };
  } catch {
    return null;
  }
}

/**
 * Store the place. Never throws and never reports: losing a reading position to
 * a flaky network is not worth interrupting the reader for.
 */
export async function saveProgress(book: string, readerId: string, place: ReaderPlace): Promise<boolean> {
  if (!book || !readerId || !place?.pageNumber) return false;
  try {
    const res = await sbFetch(`${PROGRESS_TABLE}?on_conflict=reader_id,book`, {
      method: "POST",
      headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify({
        reader_id: readerId,
        book,
        page_number: place.pageNumber,
        line_anchor: place.lineAnchor ?? null,
        percent: typeof place.percent === "number" ? place.percent : null,
        updated_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
