// Highlights and notes on the book's text.
//
// A reader selects a passage and gives it a colour, a note, or both, the way a
// Kindle does. This file is everything about that which needs no browser: what
// is stored, how a stored passage is found again on the page, and where the
// little bar goes. ReaderHighlights.tsx reads the selection, paints and draws.
//
// Kept on the reader's own device. The readers have no real sign-in (a reader
// id is typed, not verified), so anything kept on the server under a reader id
// could be read by whoever knows that id, and a note is personal writing. The
// price is that highlights do not follow the reader to another device.
//
// A highlight is stored as a quote, not as a position: the text itself plus a
// little of what comes before and after it (the W3C "text quote selector").
// Positions break whenever a page's text is corrected; a quote survives every
// change outside itself, and when the highlighted words themselves are changed
// the highlight simply stops painting instead of landing on the wrong words.

// ── Colours ──────────────────────────────────────────────────────────────────

export const HIGHLIGHT_COLORS = ["yellow", "blue", "pink", "orange"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/** The dot in the bar and in the list. */
export const HIGHLIGHT_SWATCH: Record<HighlightColor, string> = {
  yellow: "#f1e06a",
  blue: "#a8c3f4",
  pink: "#f2a7a7",
  orange: "#f2bd6e",
};

/** What is painted behind the words: see-through, so it reads on the light, sepia and dark themes alike. */
export const HIGHLIGHT_PAINT: Record<HighlightColor, string> = {
  yellow: "rgba(241, 224, 106, 0.55)",
  blue: "rgba(120, 165, 240, 0.45)",
  pink: "rgba(240, 130, 130, 0.45)",
  orange: "rgba(242, 170, 80, 0.5)",
};

/** The name each colour is registered under with the browser's highlight registry. */
export function highlightRegistryName(color: HighlightColor): string {
  return `reader-hl-${color}`;
}
/** Passages that carry a note are also underlined, whatever their colour. */
export const NOTE_REGISTRY_NAME = "reader-hl-note";

/** A note written on a bare selection gets this colour. */
export const DEFAULT_NOTE_COLOR: HighlightColor = "yellow";

export function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === "string" && (HIGHLIGHT_COLORS as readonly string[]).includes(value);
}

// ── What is stored ───────────────────────────────────────────────────────────

/** A passage, as it is found again: its words and a little of each side. */
export interface Quote {
  text: string;
  prefix: string;
  suffix: string;
}

export interface ReaderHighlight extends Quote {
  id: string;
  /** The printed page the passage is on. */
  page: number;
  color: HighlightColor;
  /** Empty when the passage is only highlighted. */
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** The longest passage that can be highlighted, and the longest note. */
export const MAX_HIGHLIGHT_CHARS = 2000;
export const MAX_NOTE_CHARS = 2000;
/** The most highlights kept for one book; the oldest go first. */
export const MAX_HIGHLIGHTS = 2000;
/** How much text on each side of a passage is stored to tell it from the same words elsewhere on the page. */
export const QUOTE_CONTEXT_CHARS = 32;

export function highlightsStorageKey(bookKey: string): string {
  return `reader_highlights_v1:${bookKey}`;
}

function cleanStored(entry: unknown): ReaderHighlight | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const text = typeof e.text === "string" ? e.text : "";
  const page = e.page;
  if (typeof e.id !== "string" || !e.id || !text.trim()) return null;
  if (typeof page !== "number" || !Number.isInteger(page) || page <= 0) return null;
  const createdAt = typeof e.createdAt === "string" ? e.createdAt : "";
  return {
    id: e.id,
    page,
    text: text.slice(0, MAX_HIGHLIGHT_CHARS),
    prefix: typeof e.prefix === "string" ? e.prefix.slice(-QUOTE_CONTEXT_CHARS) : "",
    suffix: typeof e.suffix === "string" ? e.suffix.slice(0, QUOTE_CONTEXT_CHARS) : "",
    color: isHighlightColor(e.color) ? e.color : DEFAULT_NOTE_COLOR,
    note: typeof e.note === "string" ? e.note.slice(0, MAX_NOTE_CHARS) : "",
    createdAt,
    updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : createdAt,
  };
}

/** The highlights in a stored value. Anything unreadable is dropped, entry by entry; nothing throws. */
export function parseStoredHighlights(raw: unknown): ReaderHighlight[] {
  if (typeof raw !== "string" || !raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: ReaderHighlight[] = [];
  for (const entry of parsed) {
    const h = cleanStored(entry);
    if (h && !seen.has(h.id)) { seen.add(h.id); out.push(h); }
  }
  return out;
}

export function serialiseHighlights(items: readonly ReaderHighlight[]): string {
  return JSON.stringify(items);
}

// ── Changing them ────────────────────────────────────────────────────────────

const sameQuote = (a: Quote, b: Quote) => a.text === b.text && a.prefix === b.prefix;

export interface NewHighlight {
  id: string;
  page: number;
  quote: Quote;
  color: HighlightColor;
  note?: string;
  /** ISO time, passed in so the result is the same every time for the same input. */
  now: string;
}

/**
 * The list with a passage highlighted. Highlighting a passage that already is
 * one changes that one (its colour, and its note when one is given) rather
 * than stacking a second on top.
 */
export function addHighlight(items: readonly ReaderHighlight[], input: NewHighlight): ReaderHighlight[] {
  const text = input.quote.text.slice(0, MAX_HIGHLIGHT_CHARS);
  if (!text.trim() || !(input.page > 0)) return [...items];
  const note = (input.note ?? "").trim().slice(0, MAX_NOTE_CHARS);
  const existing = items.find(h => h.page === input.page && sameQuote(h, input.quote));
  if (existing) {
    return items.map(h => (h === existing ? { ...h, color: input.color, note: note || h.note, updatedAt: input.now } : h));
  }
  const added: ReaderHighlight = {
    id: input.id,
    page: input.page,
    text,
    prefix: input.quote.prefix.slice(-QUOTE_CONTEXT_CHARS),
    suffix: input.quote.suffix.slice(0, QUOTE_CONTEXT_CHARS),
    color: input.color,
    note,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const next = [...items, added];
  return next.length > MAX_HIGHLIGHTS ? next.slice(next.length - MAX_HIGHLIGHTS) : next;
}

export function recolourHighlight(items: readonly ReaderHighlight[], id: string, color: HighlightColor, now: string): ReaderHighlight[] {
  return items.map(h => (h.id === id && h.color !== color ? { ...h, color, updatedAt: now } : h));
}

/** The list with a highlight's note set; an empty note removes the note and keeps the highlight. */
export function setHighlightNote(items: readonly ReaderHighlight[], id: string, note: string, now: string): ReaderHighlight[] {
  const clean = note.trim().slice(0, MAX_NOTE_CHARS);
  return items.map(h => (h.id === id && h.note !== clean ? { ...h, note: clean, updatedAt: now } : h));
}

export function removeHighlight(items: readonly ReaderHighlight[], id: string): ReaderHighlight[] {
  return items.filter(h => h.id !== id);
}

/** In reading order: by printed page, then in the order they were made. */
export function sortHighlights(items: readonly ReaderHighlight[]): ReaderHighlight[] {
  return [...items].sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
}

/** The start of a passage, for the list and the note editor. */
export function highlightSnippet(text: string, max: number = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`;
}

// ── Finding a passage on the page ────────────────────────────────────────────

/**
 * A page's text as one string with every run of whitespace collapsed to one
 * space, and for each character where it came from: which chunk (a text node)
 * and which offset in it. Collapsing makes a quote survive a re-wrap of the
 * same words; the map turns a place in the string back into a place on the page.
 */
export interface TextIndex {
  text: string;
  chunkOf: number[];
  offsetOf: number[];
}

export function buildTextIndex(chunks: readonly string[]): TextIndex {
  let text = "";
  const chunkOf: number[] = [];
  const offsetOf: number[] = [];
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (/\s/.test(ch)) {
        // No space at the very start, and never two in a row.
        if (text.length === 0 || text[text.length - 1] === " ") continue;
        text += " ";
      } else {
        text += ch;
      }
      chunkOf.push(c);
      offsetOf.push(i);
    }
  }
  return { text, chunkOf, offsetOf };
}

/** The first place in the index at or after a place on the page (chunk, offset). The text's length when there is none. */
export function indexPosition(index: TextIndex, chunk: number, offset: number): number {
  let lo = 0;
  let hi = index.text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const before = index.chunkOf[mid] < chunk || (index.chunkOf[mid] === chunk && index.offsetOf[mid] < offset);
    if (before) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** The quote for a stretch of the index, without the spaces at its ends. Null when nothing but space is left. */
export function quoteAt(index: TextIndex, start: number, end: number): Quote | null {
  let s = Math.max(0, start);
  let e = Math.min(index.text.length, end);
  while (s < e && index.text[s] === " ") s++;
  while (e > s && index.text[e - 1] === " ") e--;
  if (s >= e) return null;
  return {
    text: index.text.slice(s, e),
    prefix: index.text.slice(Math.max(0, s - QUOTE_CONTEXT_CHARS), s),
    suffix: index.text.slice(e, e + QUOTE_CONTEXT_CHARS),
  };
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Where a stored quote is in a page's text. When the same words occur more
 * than once, the occurrence whose surroundings match the stored ones best.
 * Null when the words are no longer on the page.
 */
export function locateQuote(index: TextIndex, quote: Quote): { start: number; end: number } | null {
  const needle = quote.text;
  if (!needle) return null;
  let best = -1;
  let bestScore = -1;
  for (let at = index.text.indexOf(needle); at !== -1; at = index.text.indexOf(needle, at + 1)) {
    const score = commonSuffix(index.text.slice(Math.max(0, at - QUOTE_CONTEXT_CHARS), at), quote.prefix)
      + commonPrefix(index.text.slice(at + needle.length, at + needle.length + QUOTE_CONTEXT_CHARS), quote.suffix);
    if (score > bestScore) { best = at; bestScore = score; }
  }
  return best === -1 ? null : { start: best, end: best + needle.length };
}

/** The place on the page (chunk, offset) where a stretch of the index starts and ends. */
export function rawRange(index: TextIndex, start: number, end: number): { startChunk: number; startOffset: number; endChunk: number; endOffset: number } | null {
  if (!(start >= 0) || !(end > start) || end > index.text.length) return null;
  return {
    startChunk: index.chunkOf[start],
    startOffset: index.offsetOf[start],
    endChunk: index.chunkOf[end - 1],
    endOffset: index.offsetOf[end - 1] + 1,
  };
}

// ── Where the bar goes ───────────────────────────────────────────────────────

export const BAR_WIDTH_PX = 248;
export const BAR_HEIGHT_PX = 40;
export const BAR_GAP_PX = 8;
const EDGE_MARGIN_PX = 8;

export interface BarPlacement {
  left: number;
  top: number;
  side: "above" | "below";
}

interface Box { left: number; top: number; bottom: number; width: number }
interface Viewport { width: number; height: number }

/**
 * Where the highlight bar sits for a selection: above it, centred, kept inside
 * the window. Below it when there is no room above, and on a touch screen,
 * where the phone's own Copy / Look Up bubble takes the space above.
 */
export function barPlacement(selection: Box, viewport: Viewport, preferBelow: boolean = false, width: number = BAR_WIDTH_PX): BarPlacement {
  const maxLeft = Math.max(EDGE_MARGIN_PX, viewport.width - width - EDGE_MARGIN_PX);
  const left = Math.min(maxLeft, Math.max(EDGE_MARGIN_PX, Math.round(selection.left + selection.width / 2 - width / 2)));
  const above = selection.top - BAR_GAP_PX - BAR_HEIGHT_PX;
  const below = selection.bottom + BAR_GAP_PX;
  const fitsAbove = above >= EDGE_MARGIN_PX;
  const fitsBelow = below + BAR_HEIGHT_PX <= viewport.height - EDGE_MARGIN_PX;
  const side: "above" | "below" = preferBelow ? (fitsBelow || !fitsAbove ? "below" : "above") : (fitsAbove || !fitsBelow ? "above" : "below");
  return { left, top: Math.round(side === "above" ? Math.max(EDGE_MARGIN_PX, above) : below), side };
}

/** The room the dictionary card must leave on each side of the selection so it does not sit on the bar. */
export function barReserve(selection: Box, viewport: Viewport, preferBelow: boolean = false): { above: number; below: number } {
  const room = BAR_HEIGHT_PX + BAR_GAP_PX;
  return barPlacement(selection, viewport, preferBelow).side === "above" ? { above: room, below: 0 } : { above: 0, below: room };
}
