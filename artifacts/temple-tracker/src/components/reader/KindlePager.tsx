import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import {
  ALargeSmall, Bookmark, Check, ChevronLeft, ChevronRight, Columns2, List, Loader2,
  Maximize, Minimize, RectangleVertical, X,
} from "lucide-react";
import {
  KINDLE_COLUMNS_KEY, TWO_COLUMN_FLOOR_WIDTH,
  anchorIndex, chapterLeftLabel, clampScreen, columnCount, columnOfOffset, isTap, kindleKeyAction,
  nextColumnPreference, pageArea, pageAtScreen, parseColumnPreference, percentRead, progressLabel,
  screenAfterForeignScroll, screenCount, screenOfColumn, screenOffsetPx, swipeDirection, tapZone, turn,
  type ColumnPreference, type PageArea, type PageStart,
} from "@/lib/kindlePaging";

// Kindle mode: the book read a screen at a time instead of as one long scroll.
//
// The pages it is given are the same rendered pages the scrolling reader shows.
// They are poured into CSS columns of a fixed height, one or two to a screen,
// and a page turn moves the row of columns sideways by one screen. Nothing
// about how a verse, its word meanings or its purport is formatted changes:
// only where the lines break.
//
// The arithmetic is in lib/kindlePaging.ts, where it is tested. This file
// measures the DOM and draws the bars.

export interface KindlePagerHandle {
  /** Turn to the screen an element is on. False when it is not part of the book text. */
  showElement(el: Element | null): boolean;
  /** The line at the top of the screen and the printed page it is on, for a bookmark. */
  anchor(): { text: string | null; pageNumber: number | null };
}

/** Where the reader is: the printed page the screen is on, and the line at the top of it. */
export interface KindlePlace {
  pageNumber: number;
  /** The first line on the screen and the printed page that line is on. */
  anchorText: string | null;
  anchorPage: number | null;
}

export interface KindleTheme { bg: string; text: string; border: string; muted: string }

export interface KindlePagerProps {
  /** Changes when a different set of printed pages is mounted. */
  viewKey: string;
  /** Changes when the same pages are set differently (text size, line spacing, language). */
  layoutKey: string;
  theme: KindleTheme;
  title: string;
  chapterTitle?: string | null;
  /** Hide the text behind a spinner while the reader's place is being found. */
  veil?: boolean;

  hasPrevView: boolean;
  hasNextView: boolean;
  onPrevView: () => void;
  onNextView: () => void;
  /** The reader turned to a different screen. */
  onPlaceChange: (place: KindlePlace) => void;

  /** The printed page being read, its position among all pages, and the totals. */
  pageNumber: number | null;
  pageIndex: number;
  totalPages: number;
  lastPageNumber: number;
  pageNumberAtIndex: (index: number) => number | null;
  chapterPagesLeft: number | null;
  onJumpToIndex: (index: number) => void;

  onExit: () => void;
  onOpenContents: () => void;
  onBookmark: () => void;
  bookmarkSaved: boolean;
  langLabel: string;
  onToggleLang: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  settingsPanel?: React.ReactNode;
}

const FLOW_CSS = `
.kindle-flow { column-fill: auto; }
.kindle-flow p { orphans: 2; widows: 2; }
.kindle-flow h1, .kindle-flow h2, .kindle-flow h3 { break-after: avoid; }
.kindle-flow [data-section-type="shlok"] { break-inside: avoid; }
.kindle-flow div:has(> img) { break-inside: avoid; }
.kindle-flow img { break-inside: avoid; max-height: calc(var(--kindle-page-h, 70vh) - 9.5rem); object-fit: contain; }
`;

const BAR_BUTTON = "inline-flex items-center justify-center gap-1 h-8 min-w-8 px-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-stone-500/15 active:scale-95 disabled:opacity-30 disabled:pointer-events-none shrink-0";
const EDGE_ARROW = "hidden sm:flex absolute top-1/2 -translate-y-1/2 z-10 h-16 w-10 items-center justify-center rounded-xl transition-colors hover:bg-stone-500/15 disabled:opacity-20 disabled:pointer-events-none";

/** The text blocks a reader's place is taken from. */
const BLOCK_SELECTOR = "p, h1, h2, h3, h4";
/** A control: a tap or the space bar on one of these is for the control, not a page turn. */
const CONTROL_SELECTOR = "a, button, input, textarea, select, img, [role='button'], [contenteditable='true']";

function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** The printed page an element of the book text is on. */
function pageNumberOf(el: Element | null): number | null {
  const n = parseInt(el?.closest("[data-page-num]")?.getAttribute("data-page-num") || "", 10);
  return n > 0 ? n : null;
}

function anchorOf(el: HTMLElement | null): { anchorText: string | null; anchorPage: number | null } {
  if (!el || !el.isConnected) return { anchorText: null, anchorPage: null };
  return { anchorText: el.textContent?.trim() || null, anchorPage: pageNumberOf(el) };
}

export const KindlePager = forwardRef<KindlePagerHandle, KindlePagerProps & { children: React.ReactNode }>(function KindlePager(props, ref) {
  const {
    children, viewKey, layoutKey, theme, title, chapterTitle, veil,
    hasPrevView, hasNextView, onPrevView, onNextView, onPlaceChange,
    pageNumber, pageIndex, totalPages, lastPageNumber, pageNumberAtIndex, chapterPagesLeft, onJumpToIndex,
    onExit, onOpenContents, onBookmark, bookmarkSaved, langLabel, onToggleLang,
    settingsOpen, onToggleSettings, settingsPanel,
  } = props;

  const spaceRef = useRef<HTMLDivElement>(null); // everything between the two bars
  const areaRef = useRef<HTMLDivElement>(null);  // the text box: clips to one screen
  const flowRef = useRef<HTMLDivElement>(null);  // the columns

  const [pref, setPref] = useState<ColumnPreference>(() => parseColumnPreference(readStored(KINDLE_COLUMNS_KEY)));
  const [area, setArea] = useState<PageArea | null>(null);
  const [spaceWidth, setSpaceWidth] = useState(0);
  const [screen, setScreen] = useState(0);
  const [screens, setScreens] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [, setJumps] = useState(0);

  // What the event handlers and the imperative handle read: always the latest.
  const areaStateRef = useRef<PageArea | null>(null);
  const screenRef = useRef(0);
  const screensRef = useRef(1);
  const startsRef = useRef<PageStart[]>([]);
  const anchorRef = useRef<HTMLElement | null>(null);
  const landRef = useRef<"start" | "end" | null>("start");
  // An element the reader asked to be taken to, waiting for the next measure:
  // on the first render the text box has no size yet, so it cannot be placed.
  const showRef = useRef<Element | null>(null);
  const layoutSigRef = useRef("");
  // The reader turned, jumped or landed somewhere: their line is to be taken afresh.
  const movedRef = useRef(true);
  const reportedPlaceRef = useRef("");
  // The printed page a jump was aimed at: it is the page being read even when
  // it starts part-way down the screen, under the end of the page before.
  const jumpPageRef = useRef<number | null>(null);
  const expectedLeftRef = useRef(0);
  const latest = useRef({ hasPrevView, hasNextView, onPrevView, onNextView, onPlaceChange });
  latest.current = { hasPrevView, hasNextView, onPrevView, onNextView, onPlaceChange };
  areaStateRef.current = area;
  screenRef.current = screen;
  screensRef.current = screens;

  // ── Take over the window while Kindle mode is open ─────────────────────────
  // The site's top bar and the mobile donate bar sit above the page content;
  // lifting the content above them lets this surface cover the whole window
  // while the reader's own dialogs and selection toolbar stay on top of it.
  useEffect(() => {
    const main = document.getElementById("main-content");
    const html = document.documentElement;
    const prevZ = main?.style.zIndex ?? "";
    const prevOverflow = html.style.overflow;
    if (main) main.style.zIndex = "60";
    html.style.overflow = "hidden";
    return () => {
      if (main) main.style.zIndex = prevZ;
      html.style.overflow = prevOverflow;
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  const canFullscreen = typeof document !== "undefined" && !!document.fullscreenEnabled;

  // ── Size of the text box ───────────────────────────────────────────────────
  useLayoutEffect(() => {
    const space = spaceRef.current;
    if (!space) return;
    const size = () => {
      const next = pageArea(space.clientWidth, space.clientHeight, pref);
      setSpaceWidth(space.clientWidth);
      setArea(prev => (
        prev && prev.left === next.left && prev.top === next.top && prev.height === next.height
          && prev.geometry.width === next.geometry.width && prev.geometry.perScreen === next.geometry.perScreen
          ? prev : next
      ));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(space);
    return () => ro.disconnect();
  }, [pref]);

  // A different set of pages starts at its first screen, unless a backward
  // page turn asked for its last. Declared before the measuring effect so it
  // runs first.
  useLayoutEffect(() => {
    if (landRef.current == null) landRef.current = "start";
    anchorRef.current = null;
  }, [viewKey]);

  // ── Measure the columns and keep the reader's place ────────────────────────
  const measure = useCallback(() => {
    const a = areaStateRef.current;
    const flow = flowRef.current;
    const box = areaRef.current;
    if (!a || !flow || !box) return;
    const g = a.geometry;
    const columns = columnCount(flow.scrollWidth, g);
    const total = screenCount(columns, g.perScreen);
    const flowRect = flow.getBoundingClientRect();
    const flowLeft = flowRect.left;
    const columnOf = (el: Element) => columnOfOffset(el.getBoundingClientRect().left - flowLeft, g);

    // Where each printed page starts. A page split over columns has one box
    // per column; the first is where it starts.
    const starts: PageStart[] = [];
    flow.querySelectorAll("[data-page-num]").forEach(el => {
      const n = parseInt(el.getAttribute("data-page-num") || "", 10);
      const first = el.getClientRects()[0];
      if (n > 0 && first) starts.push({ pageNumber: n, column: columnOfOffset(first.left - flowLeft, g), top: first.top - flowRect.top });
    });
    startsRef.current = starts;

    // Where to be: an explicit landing first; then, when the text was re-set
    // (window resized, text size changed, a picture loaded), the screen the
    // reader's line moved to; otherwise where they already are.
    const sig = `${g.width}|${g.perScreen}|${a.height}|${columns}|${layoutKey}`;
    const relaid = sig !== layoutSigRef.current;
    layoutSigRef.current = sig;
    let target = screenRef.current;
    const show = showRef.current;
    showRef.current = null;
    if (show && flow.contains(show)) {
      landRef.current = null;
      movedRef.current = true;
      target = screenOfColumn(columnOf(show), g.perScreen);
      jumpPageRef.current = pageNumberOf(show);
    } else if (landRef.current) {
      target = landRef.current === "end" ? total - 1 : 0;
      landRef.current = null;
      movedRef.current = true;
    } else if (relaid) {
      const anchor = anchorRef.current;
      if (anchor && anchor.isConnected && flow.contains(anchor)) {
        target = screenOfColumn(columnOf(anchor), g.perScreen);
      } else if (screensRef.current > 1) {
        target = Math.round((screenRef.current / screensRef.current) * total);
      }
    }
    target = clampScreen(target, total);

    if (total !== screensRef.current) { screensRef.current = total; setScreens(total); }
    if (target !== screenRef.current) { screenRef.current = target; setScreen(target); }

    const left = screenOffsetPx(target, g);
    expectedLeftRef.current = left;
    if (Math.abs(box.scrollLeft - left) > 0.5) box.scrollLeft = left;
    if (box.scrollTop !== 0) box.scrollTop = 0;

    // The reader's line: the first one on the screen they turned to. It is kept
    // through a re-set of the text (so resizing the window or changing the
    // columns back and forth returns to the same line) and taken afresh only
    // when the reader moves, or when the line itself is gone.
    const screenSig = `${sig}|${target}|${viewKey}`;
    const held = anchorRef.current;
    if (movedRef.current || !held || !held.isConnected || !flow.contains(held)) {
      movedRef.current = false;
      const blocks = Array.from(flow.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
      // Measured afresh: the box may just have been moved to this screen.
      const flowLeftNow = flow.getBoundingClientRect().left;
      const cols = blocks.map(b => {
        if (!b.textContent?.trim()) return null;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? columnOfOffset(r.left - flowLeftNow, g) : null;
      });
      const i = anchorIndex(cols, target, g.perScreen);
      anchorRef.current = i >= 0 ? blocks[i] : null;
    }

    let page = pageAtScreen(starts, target, g.perScreen);
    const jumped = jumpPageRef.current;
    if (jumped != null) {
      const start = starts.find(s => s.pageNumber === jumped);
      if (start && screenOfColumn(start.column, g.perScreen) === target) page = jumped;
    }
    const placeSig = `${screenSig}|${page}`;
    if (page != null && placeSig !== reportedPlaceRef.current) {
      reportedPlaceRef.current = placeSig;
      latest.current.onPlaceChange({ pageNumber: page, ...anchorOf(anchorRef.current) });
    }
  }, [layoutKey, viewKey]);

  // After every render: the pages, the text size or the box may have changed.
  useLayoutEffect(() => { measure(); });

  // Pictures and web fonts arrive later and move every line after them.
  useEffect(() => {
    const flow = flowRef.current;
    if (!flow) return;
    const onLoad = () => measure();
    flow.addEventListener("load", onLoad, true);
    const fonts = document.fonts;
    fonts?.addEventListener?.("loadingdone", onLoad);
    return () => {
      flow.removeEventListener("load", onLoad, true);
      fonts?.removeEventListener?.("loadingdone", onLoad);
    };
  }, [measure]);

  // Find-in-page, or a selection dragged past the edge, moves the text by
  // itself. Once it settles, snap to the screen it stopped on.
  useEffect(() => {
    const box = areaRef.current;
    if (!box) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const a = areaStateRef.current;
        if (!a) return;
        if (box.scrollTop !== 0) box.scrollTop = 0;
        if (Math.abs(box.scrollLeft - expectedLeftRef.current) <= 1) return;
        const next = screenAfterForeignScroll(box.scrollLeft, expectedLeftRef.current, a.geometry, screensRef.current);
        const left = screenOffsetPx(next, a.geometry);
        expectedLeftRef.current = left;
        box.scrollLeft = left;
        if (next !== screenRef.current) { movedRef.current = true; jumpPageRef.current = null; screenRef.current = next; setScreen(next); }
      }, 90);
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => { box.removeEventListener("scroll", onScroll); if (timer) clearTimeout(timer); };
  }, []);

  // ── Turning ────────────────────────────────────────────────────────────────
  const go = useCallback((direction: 1 | -1) => {
    const l = latest.current;
    jumpPageRef.current = null;
    const t = turn(direction, screenRef.current, screensRef.current, l.hasPrevView, l.hasNextView);
    if (t.kind === "screen") { movedRef.current = true; screenRef.current = t.screen; setScreen(t.screen); }
    else if (t.kind === "next-view") { landRef.current = "start"; l.onNextView(); }
    else if (t.kind === "prev-view") { landRef.current = "end"; l.onPrevView(); }
  }, []);

  useImperativeHandle(ref, () => ({
    showElement(el) {
      const flow = flowRef.current;
      if (!el || (flow && !flow.contains(el))) return false;
      // Placed by the next measure, which a render brings on. It reports the
      // page again even when the screen is the one already showing.
      showRef.current = el;
      reportedPlaceRef.current = "";
      setJumps(n => n + 1);
      return true;
    },
    anchor() {
      const a = anchorOf(anchorRef.current);
      return { text: a.anchorText, pageNumber: a.anchorPage };
    },
  }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const action = kindleKeyAction(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey });
      if (!action) return;
      // Space on a focused button presses the button.
      if ((e.key === " " || e.key === "Spacebar") && target?.closest?.("button, a, [role='button']")) return;
      e.preventDefault();
      if (action === "next") go(1);
      else if (action === "prev") go(-1);
      else toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, toggleFullscreen]);

  // Touch: swipe to turn, or tap the outer edge of the page.
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) { touchRef.current = null; return; }
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    const end = e.changedTouches[0];
    if (!start || !end) return;
    // A selection in progress is the reader picking a word, not turning a page.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    const elapsed = Date.now() - start.t;
    const swipe = swipeDirection(dx, dy, elapsed);
    if (swipe !== 0) { go(swipe); return; }
    if (!isTap(dx, dy, elapsed)) return;
    if ((e.target as HTMLElement | null)?.closest?.(CONTROL_SELECTOR)) return;
    const space = spaceRef.current;
    if (!space) return;
    const rect = space.getBoundingClientRect();
    const zone = tapZone(end.clientX - rect.left, rect.width);
    if (zone === "next") go(1);
    else if (zone === "prev") go(-1);
  };

  // ── The slider ─────────────────────────────────────────────────────────────
  // While the thumb is held the label previews the page under it; letting go jumps there.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const commitDrag = () => {
    if (dragIndex == null) return;
    const target = dragIndex;
    setDragIndex(null);
    if (target !== pageIndex) onJumpToIndex(target);
  };
  const shownIndex = dragIndex ?? pageIndex;
  const shownPage = dragIndex != null ? pageNumberAtIndex(dragIndex) : pageNumber;

  const cycleColumns = () => {
    const next = nextColumnPreference(pref);
    setPref(next);
    try { localStorage.setItem(KINDLE_COLUMNS_KEY, next); } catch { /* private mode: the choice just won't persist */ }
  };

  const g = area?.geometry;
  const atStart = screen <= 0 && !hasPrevView;
  const atEnd = screen >= screens - 1 && !hasNextView;
  const canChooseColumns = spaceWidth - 128 >= TWO_COLUMN_FLOOR_WIDTH;
  const columnsTitle = pref === "auto" ? "Columns: automatic" : pref === "one" ? "Columns: one" : "Columns: two";

  return (
    <div className={`fixed inset-0 z-[45] flex flex-col ${theme.bg} ${theme.text}`} role="region" aria-label="Kindle mode" data-kindle-mode>
      <style>{FLOW_CSS}</style>

      {/* Top bar */}
      <div className={`relative z-20 flex items-center gap-0.5 sm:gap-1 h-11 px-1.5 sm:px-3 border-b ${theme.border} shrink-0 text-xs leading-normal`}>
        <button onClick={onExit} className={BAR_BUTTON} title="Back to the scrolling reader (K)" aria-label="Leave Kindle mode">
          <X className="w-4 h-4" />
          <span className="hidden sm:inline pr-1">Close</span>
        </button>
        <p className="min-w-0 flex-1 truncate text-center px-2">
          <span className="font-semibold">{title}</span>
          {chapterTitle ? <span className={theme.muted}> — {chapterTitle}</span> : null}
        </p>
        <button onClick={onOpenContents} className={BAR_BUTTON} title="Contents and bookmarks" aria-label="Contents and bookmarks">
          <List className="w-4 h-4" />
        </button>
        <button onClick={onToggleLang} className={BAR_BUTTON} title="Switch language" aria-label="Switch language">
          {langLabel}
        </button>
        <div className="relative shrink-0">
          <button data-settings-toggle="kindle" onClick={onToggleSettings} className={`${BAR_BUTTON} ${settingsOpen ? "bg-orange-100 text-orange-700" : ""}`} title="Text size and theme" aria-label="Text size and theme">
            <ALargeSmall className="w-4 h-4" />
          </button>
          {settingsPanel}
        </div>
        {canChooseColumns && (
          <button onClick={cycleColumns} className={BAR_BUTTON} title={columnsTitle} aria-label={columnsTitle}>
            {g?.perScreen === 2 ? <Columns2 className="w-4 h-4" /> : <RectangleVertical className="w-4 h-4" />}
            {pref === "auto" && <span className="text-[9px] font-bold uppercase tracking-wide">Auto</span>}
          </button>
        )}
        {canFullscreen && (
          <button onClick={toggleFullscreen} className={BAR_BUTTON} title="Full screen (F)" aria-label={fullscreen ? "Leave full screen" : "Full screen"}>
            {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        )}
        <button onClick={onBookmark} className={`${BAR_BUTTON} ${bookmarkSaved ? "bg-orange-100 text-orange-700" : ""}`} title="Bookmark this place (B)" aria-label="Bookmark this place">
          {bookmarkSaved ? <Check className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
        </button>
      </div>

      {/* The page */}
      <div ref={spaceRef} className="relative flex-1 min-h-0" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button onClick={() => go(-1)} disabled={atStart} className={`${EDGE_ARROW} left-1.5`} aria-label="Previous page" title="Previous page (←)">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div
          ref={areaRef}
          className="absolute overflow-hidden"
          style={{ left: area?.left ?? 0, top: area?.top ?? 0, width: g?.width ?? 0, height: area?.height ?? 0, visibility: area && !veil ? "visible" : "hidden" }}
        >
          <div
            ref={flowRef}
            className="kindle-flow"
            style={{
              width: g?.width ?? 0,
              height: area?.height ?? 0,
              columnCount: g?.perScreen ?? 1,
              columnGap: g?.gap ?? 0,
              ["--kindle-page-h" as string]: `${area?.height ?? 0}px`,
            } as React.CSSProperties}
          >
            {children}
          </div>
          {/* With two columns and an odd number of them, the last screen is half
              empty and the box could not move far enough to show it alone. This
              marks where the last screen ends so it can. */}
          <div aria-hidden="true" style={{ position: "absolute", top: 0, left: Math.max(0, screens * (g?.screenStride ?? 0) - 1), width: 1, height: 1 }} />
        </div>
        {veil && (
          <div className={`absolute inset-0 flex items-center justify-center ${theme.muted}`}>
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
        <button onClick={() => go(1)} disabled={atEnd} className={`${EDGE_ARROW} right-1.5`} aria-label="Next page" title="Next page (→)">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Progress */}
      <div className={`relative z-20 shrink-0 border-t ${theme.border} px-3 sm:px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] leading-normal`}>
        <input
          type="range"
          min={0}
          max={Math.max(0, totalPages - 1)}
          step={1}
          value={Math.min(Math.max(0, shownIndex), Math.max(0, totalPages - 1))}
          onChange={e => setDragIndex(Number(e.target.value))}
          onMouseUp={commitDrag}
          onTouchEnd={commitDrag}
          onKeyUp={commitDrag}
          onBlur={commitDrag}
          className="block w-full h-1.5 cursor-pointer accent-orange-600"
          aria-label="Place in the book"
        />
        <div className={`mt-1.5 grid grid-cols-1 sm:grid-cols-3 items-center ${theme.muted}`}>
          <span className="hidden sm:block truncate">{chapterLeftLabel(chapterPagesLeft)}</span>
          <span className="text-center tabular-nums">
            {progressLabel(shownPage, lastPageNumber, percentRead(shownIndex, totalPages))}
          </span>
          <span className="hidden sm:block" />
        </div>
      </div>
    </div>
  );
});

/**
 * The frame the rendered pages sit in. Scrolling reader: the pages in a column
 * beside the section rail. Kindle mode: the same pages inside the pager.
 */
export const ReaderPagesFrame = forwardRef<KindlePagerHandle, { kindle: KindlePagerProps | null; rail?: React.ReactNode; children: React.ReactNode }>(
  function ReaderPagesFrame({ kindle, rail, children }, ref) {
    if (kindle) return <KindlePager ref={ref} {...kindle}>{children}</KindlePager>;
    return (
      <div className="flex items-start">
        {rail}
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    );
  },
);
