// Kindle mode: the arithmetic behind page-turn reading.
//
// The reader's text is laid out by the browser in CSS columns of a fixed height,
// one or two to a screen, and a "page turn" slides that row of columns sideways
// by one screen. Everything here is the arithmetic around that: how wide a
// column is, which screen a column is on, which printed page a screen shows,
// and what the progress line says. None of it touches the DOM, so it is tested
// without a browser; KindlePager.tsx does the measuring.

// ── What the reader chose, kept in the browser ───────────────────────────────

export const KINDLE_MODE_KEY = "bhagwatham_kindle_mode";
export const KINDLE_COLUMNS_KEY = "bhagwatham_kindle_columns";
export const KINDLE_POSITION_KEY = "bhagwatham_kindle_position";

/** One column, two, or two whenever the screen is wide enough. */
export type ColumnPreference = "auto" | "one" | "two";

/** Whether Kindle mode was left on. Anything but the stored "1" is off. */
export function parseKindleMode(raw: unknown): boolean {
  return raw === "1";
}

/** The stored column choice; anything unreadable is "auto". */
export function parseColumnPreference(raw: unknown): ColumnPreference {
  return raw === "one" || raw === "two" ? raw : "auto";
}

/** The next choice when the layout button is pressed: auto → one → two → auto. */
export function nextColumnPreference(pref: ColumnPreference): ColumnPreference {
  return pref === "auto" ? "one" : pref === "one" ? "two" : "auto";
}

/** How much of the line at the top of the screen is stored. */
export const POSITION_ANCHOR_CHARS = 80;

/** Where the reader stopped: the printed page, and the line that was at the top of the screen. */
export interface StoredPosition {
  page: number;
  anchor: string | null;
}

/** What is stored for the place the reader stopped at. */
export function serialisePosition(pageNumber: number, anchor?: string | null): string {
  const text = typeof anchor === "string" ? anchor.trim().slice(0, POSITION_ANCHOR_CHARS) : "";
  return JSON.stringify({ page: pageNumber, anchor: text || null });
}

/** The place the reader stopped at, or null when nothing usable is stored. */
export function parseStoredPosition(raw: unknown): StoredPosition | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const stored = JSON.parse(raw) as { page?: unknown; anchor?: unknown } | null;
    const page = stored?.page;
    if (typeof page !== "number" || !Number.isInteger(page) || page <= 0) return null;
    const anchor = typeof stored?.anchor === "string" && stored.anchor.trim() ? stored.anchor.trim() : null;
    return { page, anchor };
  } catch {
    return null;
  }
}

// ── Columns and screens ──────────────────────────────────────────────────────

/** A page area at least this wide shows two columns when the choice is "auto". */
export const TWO_COLUMN_MIN_WIDTH = 900;
/** Space between two columns, and between one screen and the next. */
export const COLUMN_GAP_PX = 56;
/** Below this a second column would be too narrow to read, whatever was chosen. */
export const TWO_COLUMN_FLOOR_WIDTH = 560;

export interface PageGeometry {
  /** Columns shown at once. */
  perScreen: 1 | 2;
  /** Width given to the text: whole pixels, so every column is a whole pixel wide. */
  width: number;
  columnWidth: number;
  gap: number;
  /** One column plus its gap: the distance from one column's left edge to the next. */
  columnStride: number;
  /** The distance one page turn slides the text. */
  screenStride: number;
}

/** How many columns a screen shows for this choice at this width. */
export function columnsPerScreen(pref: ColumnPreference, areaWidth: number): 1 | 2 {
  if (!(areaWidth >= TWO_COLUMN_FLOOR_WIDTH)) return 1;
  if (pref === "one") return 1;
  if (pref === "two") return 2;
  return areaWidth >= TWO_COLUMN_MIN_WIDTH ? 2 : 1;
}

/**
 * The column layout for a page area `areaWidth` pixels wide. The width is
 * rounded down so each column comes out a whole number of pixels: a fraction
 * would add up over hundreds of columns and leave a sliver of the next screen
 * showing.
 */
export function pageGeometry(areaWidth: number, pref: ColumnPreference, gap: number = COLUMN_GAP_PX): PageGeometry {
  const area = Number.isFinite(areaWidth) && areaWidth > 0 ? Math.floor(areaWidth) : 0;
  const perScreen = columnsPerScreen(pref, area);
  let width = area;
  if (perScreen === 2 && (width - gap) % 2 !== 0) width -= 1;
  const columnWidth = perScreen === 2 ? Math.max(0, (width - gap) / 2) : width;
  const columnStride = columnWidth + gap;
  return { perScreen, width, columnWidth, gap, columnStride, screenStride: columnStride * perScreen };
}

/** The widest a single column is set: beyond this a line is too long to read. */
export const ONE_COLUMN_MAX_WIDTH = 760;
/** The widest a two-column spread is set. */
export const TWO_COLUMN_MAX_WIDTH = 1240;
/** From this width up the page gets wide margins, with room for the arrows. */
export const WIDE_SCREEN_MIN_WIDTH = 640;

export interface PageArea {
  geometry: PageGeometry;
  /** Where the text box sits inside the space between the two bars. */
  left: number;
  top: number;
  height: number;
}

/**
 * The text box for the space between the top and bottom bars: margins taken
 * off, the width capped so lines stay readable, and the box centred.
 */
export function pageArea(spaceWidth: number, spaceHeight: number, pref: ColumnPreference): PageArea {
  const w = Number.isFinite(spaceWidth) && spaceWidth > 0 ? Math.floor(spaceWidth) : 0;
  const h = Number.isFinite(spaceHeight) && spaceHeight > 0 ? Math.floor(spaceHeight) : 0;
  const wide = w >= WIDE_SCREEN_MIN_WIDTH;
  const marginX = wide ? 64 : 18;
  const marginY = wide ? 28 : 12;
  const available = Math.max(0, w - marginX * 2);
  const perScreen = columnsPerScreen(pref, available);
  const capped = Math.min(available, perScreen === 2 ? TWO_COLUMN_MAX_WIDTH : ONE_COLUMN_MAX_WIDTH);
  const geometry = pageGeometry(capped, perScreen === 2 ? "two" : "one");
  return {
    geometry,
    left: Math.floor((w - geometry.width) / 2),
    top: marginY,
    height: Math.max(0, h - marginY * 2),
  };
}

/** How many columns the text fills, from the full width the browser laid it out to. */
export function columnCount(scrollWidth: number, g: PageGeometry): number {
  if (!(g.columnStride > 0) || !(scrollWidth > 0)) return 1;
  return Math.max(1, Math.round((scrollWidth + g.gap) / g.columnStride));
}

/** How many screens that many columns make. */
export function screenCount(columns: number, perScreen: number): number {
  if (!(columns > 0) || !(perScreen > 0)) return 1;
  return Math.max(1, Math.ceil(columns / perScreen));
}

/** A screen index kept inside 0 … screens-1. */
export function clampScreen(screen: number, screens: number): number {
  const last = Math.max(0, Math.floor(screens) - 1);
  if (!Number.isFinite(screen)) return 0;
  return Math.min(last, Math.max(0, Math.floor(screen)));
}

/**
 * The column an element is in, from how far its left edge is from the left
 * edge of the first column. An indented element still counts as its column.
 */
export function columnOfOffset(offsetLeft: number, g: PageGeometry): number {
  if (!(g.columnStride > 0) || !Number.isFinite(offsetLeft)) return 0;
  return Math.max(0, Math.floor((offsetLeft + 0.5) / g.columnStride));
}

/** The screen a column is on. */
export function screenOfColumn(column: number, perScreen: number): number {
  if (!(column > 0) || !(perScreen > 0)) return 0;
  return Math.floor(column / perScreen);
}

/** How far the text is slid left to show a screen. */
export function screenOffsetPx(screen: number, g: PageGeometry): number {
  return Math.max(0, screen) * g.screenStride;
}

/**
 * The screen to settle on after something other than a page turn moved the
 * text: the browser's find-in-page, or a selection dragged past the edge. The
 * browser moves just far enough to show what it wants shown, so going forward
 * that thing is at the right edge (the later screen) and going back it is at
 * the left edge (the earlier one).
 */
export function screenAfterForeignScroll(scrollLeft: number, expectedLeft: number, g: PageGeometry, screens: number): number {
  if (!(g.screenStride > 0) || !Number.isFinite(scrollLeft)) return 0;
  const exact = scrollLeft / g.screenStride;
  const nearest = Math.round(exact);
  // Within a pixel of a screen boundary it is already on that screen.
  if (Math.abs(scrollLeft - nearest * g.screenStride) <= 1) return clampScreen(nearest, screens);
  return clampScreen(scrollLeft > expectedLeft ? Math.ceil(exact) : Math.floor(exact), screens);
}

/**
 * Which block of text marks the reader's place on a screen: the first one that
 * starts on it, or, when one long paragraph fills the whole screen, the one it
 * is in the middle of. `blockColumns` holds each block's starting column in
 * reading order, null for a block that is not laid out. -1 when there is none.
 */
export function anchorIndex(blockColumns: readonly (number | null)[], screen: number, perScreen: number): number {
  const first = Math.max(0, screen) * perScreen;
  let before = -1;
  for (let i = 0; i < blockColumns.length; i++) {
    const col = blockColumns[i];
    if (col == null) continue;
    if (col < first) { before = i; continue; }
    return col < first + perScreen ? i : before;
  }
  return before;
}

// ── Turning ──────────────────────────────────────────────────────────────────

export type Turn =
  | { kind: "screen"; screen: number }
  /** Past the last screen of the pages that are loaded: the next set is needed. */
  | { kind: "next-view" }
  /** Before the first screen: the previous set is needed. */
  | { kind: "prev-view" }
  /** The very start or the very end of the book. */
  | { kind: "edge" };

/** What a page turn does from `screen`, forward (1) or back (-1). */
export function turn(direction: 1 | -1, screen: number, screens: number, hasPrevView: boolean, hasNextView: boolean): Turn {
  const target = screen + direction;
  if (target >= 0 && target < screens) return { kind: "screen", screen: target };
  if (direction === 1) return hasNextView ? { kind: "next-view" } : { kind: "edge" };
  return hasPrevView ? { kind: "prev-view" } : { kind: "edge" };
}

// ── Which printed page a screen shows ────────────────────────────────────────

export interface PageStart {
  pageNumber: number;
  /** The column the printed page's text starts in. */
  column: number;
  /** How far down that column it starts, in pixels. */
  top: number;
}

/** A printed page that starts within this many pixels of a column's top starts "at the top". */
export const PAGE_TOP_TOLERANCE_PX = 8;

/**
 * The printed page at the top of a screen: the last page that started in an
 * earlier column, or at the very top of the screen's first column. A page that
 * begins part-way down the screen is not it yet; the lines above it belong to
 * the page before. Null when no page has been measured.
 */
export function pageAtScreen(starts: readonly PageStart[], screen: number, perScreen: number): number | null {
  if (starts.length === 0) return null;
  const firstColumn = Math.max(0, screen) * perScreen;
  let found = starts[0].pageNumber;
  for (const s of starts) {
    if (s.column < firstColumn || (s.column === firstColumn && s.top <= PAGE_TOP_TOLERANCE_PX)) found = s.pageNumber;
    else break;
  }
  return found;
}

// ── The progress line ────────────────────────────────────────────────────────

/** How far through the book a page is, as a whole percentage. `pageIndex` counts from 0. */
export function percentRead(pageIndex: number, totalPages: number): number {
  if (!(totalPages > 0) || !(pageIndex >= 0)) return 0;
  if (pageIndex >= totalPages - 1) return 100;
  return Math.min(99, Math.floor(((pageIndex + 1) / totalPages) * 100));
}

/** "Page 21 of 10419 • 0%" */
export function progressLabel(pageNumber: number | null, lastPageNumber: number, percent: number): string {
  if (!pageNumber || !(lastPageNumber > 0)) return "";
  return `Page ${pageNumber} of ${lastPageNumber} • ${percent}%`;
}

interface ChapterStart { pageNumber: number }

/** The chapter a printed page falls in: the last one that starts on or before it. */
export function chapterForPage<T extends ChapterStart>(chapters: readonly T[], pageNumber: number | null): T | null {
  if (!pageNumber) return null;
  let found: T | null = null;
  for (const ch of chapters) {
    if (ch.pageNumber <= pageNumber && (!found || ch.pageNumber >= found.pageNumber)) found = ch;
  }
  return found;
}

/**
 * Printed pages still to read in the chapter after this one. Null when the
 * page is before the first chapter (front matter), where there is no chapter
 * to count against.
 */
export function pagesLeftInChapter(chapters: readonly ChapterStart[], pageNumber: number | null, lastPageNumber: number): number | null {
  const current = chapterForPage(chapters, pageNumber);
  if (!current || !pageNumber) return null;
  let nextStart = Infinity;
  for (const ch of chapters) {
    if (ch.pageNumber > pageNumber && ch.pageNumber < nextStart) nextStart = ch.pageNumber;
  }
  const chapterEnd = Number.isFinite(nextStart) ? nextStart - 1 : lastPageNumber;
  return Math.max(0, chapterEnd - pageNumber);
}

/** "3 pages left in chapter" */
export function chapterLeftLabel(pagesLeft: number | null): string {
  if (pagesLeft == null) return "";
  if (pagesLeft <= 0) return "Last page of the chapter";
  return pagesLeft === 1 ? "1 page left in chapter" : `${pagesLeft} pages left in chapter`;
}

// ── Keys, swipes and taps ────────────────────────────────────────────────────

export type KindleAction = "next" | "prev" | "fullscreen";

interface KeyModifiers { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }

/**
 * What a key does in Kindle mode, or null when the key is not the pager's.
 * A key held with Ctrl, Cmd or Alt is the browser's (Alt+Left is Back).
 */
export function kindleKeyAction(key: string, mod: KeyModifiers = {}): KindleAction | null {
  if (mod.ctrl || mod.meta || mod.alt) return null;
  switch (key) {
    case "ArrowRight":
    case "PageDown":
      return "next";
    case "ArrowLeft":
    case "PageUp":
      return "prev";
    case " ":
    case "Spacebar":
      return mod.shift ? "prev" : "next";
    case "f":
    case "F":
      return "fullscreen";
    default:
      return null;
  }
}

/** A swipe is at least this far sideways… */
export const SWIPE_MIN_PX = 48;
/** …and finished within this long; a slower drag is a text selection or a scroll. */
export const SWIPE_MAX_MS = 700;

/**
 * The page turn a touch gesture asks for: 1 forward (swipe left), -1 back
 * (swipe right), 0 when it was not a swipe. A mostly-vertical movement is not one.
 */
export function swipeDirection(dx: number, dy: number, elapsedMs: number): 1 | -1 | 0 {
  if (!(elapsedMs >= 0) || elapsedMs > SWIPE_MAX_MS) return 0;
  if (Math.abs(dx) < SWIPE_MIN_PX) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

/** A tap is a touch that barely moved and was short. */
export const TAP_MAX_MOVE_PX = 10;
export const TAP_MAX_MS = 350;
/** The outer share of the page, on each side, where a tap turns the page. */
export const TAP_EDGE_SHARE = 0.22;

export function isTap(dx: number, dy: number, elapsedMs: number): boolean {
  return Math.abs(dx) <= TAP_MAX_MOVE_PX && Math.abs(dy) <= TAP_MAX_MOVE_PX && elapsedMs >= 0 && elapsedMs <= TAP_MAX_MS;
}

/** Which part of the page a tap landed in. The middle is left for selecting text. */
export function tapZone(x: number, width: number): "prev" | "next" | "middle" {
  if (!(width > 0) || !Number.isFinite(x)) return "middle";
  const share = x / width;
  if (share < TAP_EDGE_SHARE) return "prev";
  if (share > 1 - TAP_EDGE_SHARE) return "next";
  return "middle";
}
