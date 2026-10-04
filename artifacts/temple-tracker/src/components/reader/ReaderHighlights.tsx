import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, NotebookPen, Trash2 } from "lucide-react";
import {
  BAR_WIDTH_PX, DEFAULT_NOTE_COLOR, HIGHLIGHT_COLORS, HIGHLIGHT_PAINT, HIGHLIGHT_SWATCH, MAX_HIGHLIGHT_CHARS,
  MAX_NOTE_CHARS, NOTE_REGISTRY_NAME,
  addHighlight, barPlacement, buildTextIndex, highlightRegistryName, highlightSnippet, highlightsStorageKey,
  indexPosition, locateQuote, parseStoredHighlights, quoteAt, rawRange, recolourHighlight, removeHighlight,
  serialiseHighlights, setHighlightNote, sortHighlights,
  type HighlightColor, type Quote, type ReaderHighlight, type TextIndex,
} from "@/lib/readerHighlights";

// Highlights and notes on the book's text, the way a Kindle has them.
//
// Selecting text brings up a small bar next to it: four colours, copy, and a
// note. A coloured passage stays painted and comes back on the next visit;
// pressing it brings the bar back to recolour it, edit its note or remove it.
//
// The painting uses the browser's highlight registry (CSS Custom Highlight
// API): ranges are painted without touching the page's elements, so React
// and the readers' correction toolbar never see a changed DOM. A browser
// without it gets the bar with Copy only.
//
// What is stored and how a passage is found again is in lib/readerHighlights,
// where it is tested. Kept on the reader's device; see the note there.

// ── The reader's highlights for one book ─────────────────────────────────────

export interface HighlightStore {
  items: ReaderHighlight[];
  /** Highlights a passage; returns the id of the highlight that now covers it. */
  add(page: number, quote: Quote, color: HighlightColor, note?: string): string;
  recolour(id: string, color: HighlightColor): void;
  setNote(id: string, note: string): void;
  remove(id: string): void;
}

function newId(): string {
  try { return crypto.randomUUID(); } catch { return `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
}

export function useReaderHighlights(bookKey: string): HighlightStore {
  const key = highlightsStorageKey(bookKey);
  const [items, setItems] = useState<ReaderHighlight[]>(() => {
    try { return parseStoredHighlights(localStorage.getItem(key)); } catch { return []; }
  });
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const commit = useCallback((next: ReaderHighlight[]) => {
    itemsRef.current = next;
    setItems(next);
    try { localStorage.setItem(key, serialiseHighlights(next)); } catch { /* storage full or private mode: kept for this visit only */ }
  }, [key]);

  // Another tab of the same book changed them.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === key) setItems(parseStoredHighlights(e.newValue)); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const add = useCallback((page: number, quote: Quote, color: HighlightColor, note?: string) => {
    const next = addHighlight(itemsRef.current, { id: newId(), page, quote, color, note, now: new Date().toISOString() });
    commit(next);
    return next.find(h => h.page === page && h.text === quote.text && h.prefix === quote.prefix)?.id ?? "";
  }, [commit]);
  const recolour = useCallback((id: string, color: HighlightColor) => commit(recolourHighlight(itemsRef.current, id, color, new Date().toISOString())), [commit]);
  const setNote = useCallback((id: string, note: string) => commit(setHighlightNote(itemsRef.current, id, note, new Date().toISOString())), [commit]);
  const remove = useCallback((id: string) => commit(removeHighlight(itemsRef.current, id)), [commit]);

  return { items, add, recolour, setNote, remove };
}

// ── The page's text, as the quotes see it ────────────────────────────────────

/** Text inside these is not the book's: buttons and the like. */
const NOT_BOOK_TEXT = "button, [role='button'], script, style";

function pageTextNodes(pageEl: Element): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!(n as Text).parentElement?.closest(NOT_BOOK_TEXT)) nodes.push(n as Text);
  }
  return nodes;
}

function pageIndex(pageEl: Element): { nodes: Text[]; index: TextIndex } {
  const nodes = pageTextNodes(pageEl);
  return { nodes, index: buildTextIndex(nodes.map(n => n.data)) };
}

/** The quote for what a range covers on one printed page. Null when it covers no text. */
function quoteFromRange(range: Range, pageEl: Element): Quote | null {
  const { nodes, index } = pageIndex(pageEl);
  let start: [number, number] | null = null;
  let end: [number, number] | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!range.intersectsNode(node)) continue;
    if (!start) start = [i, node === range.startContainer ? range.startOffset : 0];
    end = [i, node === range.endContainer ? range.endOffset : node.length];
  }
  if (!start || !end) return null;
  return quoteAt(index, indexPosition(index, start[0], start[1]), indexPosition(index, end[0], end[1]));
}

export const highlightsSupported = (): boolean =>
  typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

/**
 * Paint every highlight whose printed page is on screen. Returns the range of
 * each one painted, by id, for telling which highlight a press landed on.
 */
function paintHighlights(items: readonly ReaderHighlight[]): Map<string, Range> {
  const painted = new Map<string, Range>();
  if (!highlightsSupported()) return painted;
  const pages = new Map<number, Element>();
  document.querySelectorAll("[data-page-num]").forEach(el => {
    const n = parseInt(el.getAttribute("data-page-num") || "", 10);
    if (n > 0 && !pages.has(n)) pages.set(n, el);
  });
  const indexes = new Map<Element, { nodes: Text[]; index: TextIndex }>();
  const byColor = new Map<HighlightColor, Range[]>();
  const withNote: Range[] = [];
  for (const h of items) {
    const pageEl = pages.get(h.page);
    if (!pageEl) continue;
    let page = indexes.get(pageEl);
    if (!page) { page = pageIndex(pageEl); indexes.set(pageEl, page); }
    const found = locateQuote(page.index, h);
    const raw = found && rawRange(page.index, found.start, found.end);
    if (!raw) continue; // the words are no longer on the page: paint nothing rather than the wrong words
    try {
      const range = document.createRange();
      range.setStart(page.nodes[raw.startChunk], raw.startOffset);
      range.setEnd(page.nodes[raw.endChunk], raw.endOffset);
      painted.set(h.id, range);
      byColor.set(h.color, [...(byColor.get(h.color) ?? []), range]);
      if (h.note) withNote.push(range);
    } catch { /* a text node changed under us: the next repaint picks it up */ }
  }
  for (const color of HIGHLIGHT_COLORS) {
    const ranges = byColor.get(color);
    if (ranges?.length) CSS.highlights.set(highlightRegistryName(color), new Highlight(...ranges));
    else CSS.highlights.delete(highlightRegistryName(color));
  }
  if (withNote.length) {
    const notes = new Highlight(...withNote);
    notes.priority = 1; // the underline draws over the colour
    CSS.highlights.set(NOTE_REGISTRY_NAME, notes);
  } else {
    CSS.highlights.delete(NOTE_REGISTRY_NAME);
  }
  return painted;
}

const PAINT_CSS = [
  ...HIGHLIGHT_COLORS.map(c => `::highlight(${highlightRegistryName(c)}) { background-color: ${HIGHLIGHT_PAINT[c]}; }`),
  `::highlight(${NOTE_REGISTRY_NAME}) { text-decoration: underline dotted; text-decoration-thickness: 2px; text-underline-offset: 3px; }`,
].join("\n");

// ── The bar and the note editor ──────────────────────────────────────────────

export interface HighlightBarProps {
  /** False in a browser that cannot paint highlights: the bar then offers Copy only. */
  canHighlight: boolean;
  /** The colour of the highlight the bar was opened on; null for a fresh selection. */
  activeColor: HighlightColor | null;
  hasNote: boolean;
  /** The selection is too long to highlight. */
  tooLong?: boolean;
  copied?: boolean;
  onColor: (color: HighlightColor) => void;
  onCopy: () => void;
  onNote: () => void;
  /** Present only for an existing highlight. */
  onRemove?: () => void;
}

const BAR_ICON_BUTTON = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:opacity-35 disabled:pointer-events-none";

/** The bar's contents. Pure: every state comes in as props. */
export function HighlightBar({ canHighlight, activeColor, hasNote, tooLong, copied, onColor, onCopy, onNote, onRemove }: HighlightBarProps) {
  const blocked = !!tooLong;
  return (
    <>
      {canHighlight && HIGHLIGHT_COLORS.map(color => (
        <button
          key={color}
          type="button"
          onClick={() => onColor(color)}
          disabled={blocked}
          aria-label={`Highlight ${color}`}
          aria-pressed={activeColor === color}
          title={blocked ? "Select a shorter passage to highlight it" : `Highlight ${color}`}
          className={`h-7 w-7 shrink-0 rounded-full transition-transform hover:scale-110 disabled:opacity-35 disabled:pointer-events-none ${activeColor === color ? "ring-2 ring-stone-700 ring-offset-2" : "ring-1 ring-black/10"}`}
          style={{ backgroundColor: HIGHLIGHT_SWATCH[color] }}
        />
      ))}
      {canHighlight && <span className="mx-0.5 h-5 w-px shrink-0 bg-stone-200" aria-hidden="true" />}
      <button type="button" onClick={onCopy} className={BAR_ICON_BUTTON} title="Copy" aria-label="Copy the selected text">
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
      {canHighlight && (
        <button type="button" onClick={onNote} disabled={blocked} className={`${BAR_ICON_BUTTON} ${hasNote ? "text-orange-700" : ""}`} title={hasNote ? "Edit the note" : "Add a note"} aria-label={hasNote ? "Edit the note" : "Add a note"}>
          <NotebookPen className="h-4 w-4" />
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className={`${BAR_ICON_BUTTON} hover:text-rose-600`} title="Remove the highlight" aria-label="Remove the highlight">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

export interface NoteEditorProps {
  /** The passage the note is on. */
  passage: string;
  color: HighlightColor;
  value: string;
  /** Whether a note is already saved on this passage. */
  existing: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDeleteNote: () => void;
}

/** The note editor's contents. Pure: every state comes in as props. */
export function NoteEditor({ passage, color, value, existing, onChange, onSave, onCancel, onDeleteNote }: NoteEditorProps) {
  return (
    <>
      <p className="text-sm font-semibold text-stone-900">{existing ? "Edit note" : "Add a note"}</p>
      <p className="mt-2 border-l-4 pl-2.5 text-xs leading-relaxed text-stone-600" style={{ borderColor: HIGHLIGHT_SWATCH[color], fontFamily: "var(--font-devanagari)" }}>
        {highlightSnippet(passage, 160)}
      </p>
      <textarea
        autoFocus
        value={value}
        maxLength={MAX_NOTE_CHARS}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(); }}
        placeholder="Write your note…"
        aria-label="Note"
        className="mt-3 block min-h-[110px] w-full resize-y rounded-xl border border-stone-300 px-3 py-2 text-sm leading-relaxed text-stone-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
        style={{ fontFamily: "var(--font-devanagari)" }}
      />
      <p className="mt-1.5 text-[11px] text-stone-500">Kept on this device only.</p>
      <div className="mt-3 flex items-center gap-2">
        {existing && (
          <button type="button" onClick={onDeleteNote} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50">
            Delete note
          </button>
        )}
        <button type="button" onClick={onCancel} className="ml-auto rounded-lg px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100">
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={!existing && !value.trim()} className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-40">
          Save note
        </button>
      </div>
    </>
  );
}

// ── Reading the selection, painting, and showing the bar ─────────────────────

type Target =
  | { kind: "selection"; page: number; quote: Quote; key: string }
  | { kind: "existing"; id: string; key: string };

interface Rect { left: number; top: number; bottom: number; width: number }
const rectOf = (r: DOMRect): Rect => ({ left: r.left, top: r.top, bottom: r.bottom, width: r.width });

const elementOf = (node: Node | null): Element | null =>
  !node ? null : node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;

export function HighlightLayer({ store }: { store: HighlightStore }) {
  const { items, add, recolour, setNote, remove } = store;
  const [target, setTarget] = useState<Target | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<{ target: Target; text: string } | null>(null);
  const [barWidth, setBarWidth] = useState(BAR_WIDTH_PX);
  const barRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  // The range the bar is anchored to, and each painted highlight's range.
  const anchorRef = useRef<Range | null>(null);
  const paintedRef = useRef<Map<string, Range>>(new Map());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const targetRef = useRef<Target | null>(null);
  targetRef.current = target;
  const editingRef = useRef(false);
  editingRef.current = editing !== null;
  // The selection the reader closed the bar on: it stays closed until they select again.
  const dismissedRef = useRef<string | null>(null);
  const canHighlight = highlightsSupported();

  const close = useCallback((dismiss = false) => {
    if (dismiss && targetRef.current) dismissedRef.current = targetRef.current.key;
    anchorRef.current = null;
    setTarget(null);
    setRect(null);
    setCopied(false);
  }, []);

  // ── Painting: when the highlights change, and when the page's text does ────
  const repaint = useCallback(() => { paintedRef.current = paintHighlights(itemsRef.current); }, []);
  useLayoutEffect(() => { repaint(); }, [items, repaint]);
  useEffect(() => {
    if (!highlightsSupported()) return;
    const root = document.getElementById("main-content") ?? document.body;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(repaint, 120);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      for (const color of HIGHLIGHT_COLORS) CSS.highlights.delete(highlightRegistryName(color));
      CSS.highlights.delete(NOTE_REGISTRY_NAME);
    };
  }, [repaint]);

  // ── The selection, and presses on a highlight ──────────────────────────────
  useEffect(() => {
    let pointerDown = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const inOurs = (node: Node | null) => !!node && (!!barRef.current?.contains(node) || !!editorRef.current?.contains(node));

    const evaluate = () => {
      if (editingRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { dismissedRef.current = null; return; }
      const range = sel.getRangeAt(0);
      const startEl = elementOf(range.startContainer);
      if (inOurs(startEl)) return;
      const pageEl = startEl?.closest("[data-page-num]") ?? null;
      // A highlight lives on one printed page: a selection across two is not offered one.
      if (!pageEl || elementOf(range.endContainer)?.closest("[data-page-num]") !== pageEl) { close(); return; }
      const quote = quoteFromRange(range, pageEl);
      const r = range.getBoundingClientRect();
      if (!quote || (r.width === 0 && r.height === 0)) { close(); return; }
      const page = parseInt(pageEl.getAttribute("data-page-num") || "", 10);
      const key = `s|${page}|${quote.prefix}|${quote.text}`;
      if (key === dismissedRef.current || key === targetRef.current?.key) return;
      dismissedRef.current = null;
      anchorRef.current = range.cloneRange();
      setCopied(false);
      setRect(rectOf(r));
      setTarget({ kind: "selection", page, quote, key });
    };

    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (!pointerDown) evaluate(); }, delay);
    };
    const onSelectionChange = () => schedule(250);
    const onPointerDown = (e: PointerEvent) => {
      pointerDown = true;
      // A press anywhere else puts the bar away.
      if (targetRef.current && !editingRef.current && !inOurs(e.target as Node)) close();
    };
    const onPointerUp = () => { pointerDown = false; schedule(60); };

    // A press on a painted passage, with nothing selected, opens the bar on that highlight.
    const onClick = (e: MouseEvent) => {
      if (editingRef.current || inOurs(e.target as Node)) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (!(e.target as Element | null)?.closest?.("[data-page-num]")) return;
      for (const [id, range] of paintedRef.current) {
        const hit = Array.from(range.getClientRects()).some(r =>
          e.clientX >= r.left - 1 && e.clientX <= r.right + 1 && e.clientY >= r.top - 1 && e.clientY <= r.bottom + 1);
        if (!hit) continue;
        anchorRef.current = range;
        setCopied(false);
        setRect(rectOf(range.getBoundingClientRect()));
        setTarget({ kind: "existing", id, key: `h|${id}` });
        return;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingRef.current) setEditing(null);
      else if (targetRef.current) close(true);
    };

    // The passage moved (the page scrolled, or Kindle mode turned): follow it,
    // or put the bar away once it is no longer on screen.
    const onMove = () => {
      const range = anchorRef.current;
      if (!range || !targetRef.current || editingRef.current) return;
      const r = range.getBoundingClientRect();
      const first = range.getClientRects()[0];
      const owner = elementOf(range.startContainer);
      const onScreen = !!first && r.bottom > 0 && r.top < window.innerHeight
        && document.elementsFromPoint(first.left + Math.min(4, first.width / 2), first.top + first.height / 2).some(el => el === owner || !!owner?.contains(el) || el.contains(owner));
      if (!onScreen) { close(); return; }
      setRect(rectOf(r));
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onMove, { capture: true, passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onMove, { capture: true });
      window.removeEventListener("resize", onMove);
    };
  }, [close]);

  // The bar is wider with the remove button: measure it so it stays centred and on screen.
  useLayoutEffect(() => {
    const w = barRef.current?.offsetWidth;
    if (w && w !== barWidth) setBarWidth(w);
  });

  const existing = target?.kind === "existing" ? items.find(h => h.id === target.id) ?? null : null;
  const editingTarget = editing?.target ?? null;
  const editingExisting = editingTarget?.kind === "existing" ? items.find(h => h.id === editingTarget.id) ?? null : null;
  // The highlight was removed elsewhere (another tab) while its bar was open.
  useEffect(() => { if (target?.kind === "existing" && !existing) close(); }, [target, existing, close]);

  const passageOf = (t: Target): string =>
    t.kind === "selection" ? t.quote.text : items.find(h => h.id === t.id)?.text ?? "";

  const applyColor = (color: HighlightColor) => {
    if (!target) return;
    if (target.kind === "existing") { recolour(target.id, color); return; }
    add(target.page, target.quote, color);
    // The colour is the result: clear the selection so it shows.
    window.getSelection()?.removeAllRanges();
    close();
  };
  const copy = () => {
    if (!target) return;
    void navigator.clipboard?.writeText(passageOf(target)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }).catch(() => { /* clipboard refused: nothing to show */ });
  };
  const openNote = () => {
    if (!target) return;
    setEditing({ target, text: target.kind === "existing" ? existing?.note ?? "" : "" });
  };
  const saveNote = () => {
    if (!editing) return;
    const t = editing.target;
    if (t.kind === "existing") setNote(t.id, editing.text);
    else if (editing.text.trim()) add(t.page, t.quote, DEFAULT_NOTE_COLOR, editing.text);
    setEditing(null);
    window.getSelection()?.removeAllRanges();
    close();
  };
  const deleteNote = () => {
    if (editing?.target.kind === "existing") setNote(editing.target.id, "");
    setEditing(null);
    close();
  };

  const coarse = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const place = target && rect
    ? barPlacement(rect, { width: window.innerWidth, height: window.innerHeight }, coarse, Math.min(barWidth, window.innerWidth - 16))
    : null;

  return (
    <>
      <style>{PAINT_CSS}</style>
      {target && place && !editing && (
        <div
          ref={barRef}
          role="toolbar"
          aria-label="Highlight and note"
          className="fixed z-50 flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2 py-1 shadow-xl"
          style={{ left: place.left, top: place.top }}
          // Keep the text selected while the bar is used (a press would clear it).
          onMouseDown={e => e.preventDefault()}
        >
          <HighlightBar
            canHighlight={canHighlight}
            activeColor={existing?.color ?? null}
            hasNote={!!existing?.note}
            tooLong={target.kind === "selection" && target.quote.text.length > MAX_HIGHLIGHT_CHARS}
            copied={copied}
            onColor={applyColor}
            onCopy={copy}
            onNote={openNote}
            onRemove={existing ? () => { remove(existing.id); close(); } : undefined}
          />
        </div>
      )}
      {editing && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center"
          onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <div ref={editorRef} role="dialog" aria-label="Note" className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <NoteEditor
              passage={passageOf(editing.target)}
              color={editingExisting?.color ?? DEFAULT_NOTE_COLOR}
              value={editing.text}
              existing={!!editingExisting?.note}
              onChange={text => setEditing(cur => (cur ? { ...cur, text } : cur))}
              onSave={saveNote}
              onCancel={() => setEditing(null)}
              onDeleteNote={deleteNote}
            />
          </div>
        </div>
      )}
    </>
  );
}

// ── The list ─────────────────────────────────────────────────────────────────

export interface HighlightsPanelProps {
  items: readonly ReaderHighlight[];
  onJump: (h: ReaderHighlight) => void;
  onRemove: (id: string) => void;
}

/** Every highlight and note, in reading order, each a jump to its place. */
export function HighlightsPanel({ items, onJump, onRemove }: HighlightsPanelProps) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <NotebookPen className="mx-auto mb-3 h-6 w-6 text-stone-300" />
        <p className="text-xs font-semibold text-stone-600">No highlights or notes yet</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500">
          Select any text in the book to colour it or write a note on it. They are kept on this device only.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-stone-100">
      {sortHighlights(items).map(h => (
        <li key={h.id} className="group flex items-start gap-2 px-3 py-2.5 hover:bg-orange-50/60">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: HIGHLIGHT_SWATCH[h.color] }} aria-hidden="true" />
          <button type="button" onClick={() => onJump(h)} className="min-w-0 flex-1 text-left" title="Go to this passage">
            <span className="block text-xs leading-snug text-stone-800" style={{ fontFamily: "var(--font-devanagari)" }}>{highlightSnippet(h.text)}</span>
            {h.note && (
              <span className="mt-1 block rounded-md bg-stone-100 px-2 py-1 text-[11px] leading-snug text-stone-700" style={{ fontFamily: "var(--font-devanagari)" }}>
                {highlightSnippet(h.note, 140)}
              </span>
            )}
            <span className="mt-1 block text-[10px] text-stone-400">Page {h.page}</span>
          </button>
          <button type="button" onClick={() => onRemove(h.id)} className="shrink-0 rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600" title="Remove" aria-label={`Remove the highlight on page ${h.page}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
