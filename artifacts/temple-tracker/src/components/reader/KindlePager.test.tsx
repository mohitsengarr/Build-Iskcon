import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { KindlePager, ReaderPagesFrame, type KindlePagerProps } from "./KindlePager";

// Kindle mode's surface. The test environment is node (no DOM, so nothing is
// measured and no effect runs); these render to static markup and check what
// is drawn. The page arithmetic is tested in lib/kindlePaging.test.ts.

const noop = () => {};
const THEME = { bg: "bg-white", text: "text-stone-800", border: "border-stone-100", muted: "text-stone-500" };

function props(overrides: Partial<KindlePagerProps> = {}): KindlePagerProps {
  return {
    viewKey: "3",
    layoutKey: "15|1.8|true|hi",
    theme: THEME,
    title: "श्रीमद्भागवतम्",
    chapterTitle: "अध्याय एक — मुनियों की जिज्ञासा",
    hasPrevView: true,
    hasNextView: true,
    onPrevView: noop,
    onNextView: noop,
    onPlaceChange: noop,
    pageNumber: 21,
    pageIndex: 19,
    totalPages: 1239,
    lastPageNumber: 1239,
    pageNumberAtIndex: (i: number) => i + 2,
    chapterPagesLeft: 12,
    onJumpToIndex: noop,
    onExit: noop,
    onOpenContents: noop,
    onBookmark: noop,
    bookmarkSaved: false,
    langLabel: "हि",
    onToggleLang: noop,
    settingsOpen: false,
    onToggleSettings: noop,
    ...overrides,
  };
}

const PAGES = createElement("div", { "data-page-num": 21 }, createElement("p", null, "धर्मक्षेत्रे कुरुक्षेत्रे"));

function pager(overrides: Partial<KindlePagerProps> = {}): string {
  return renderToStaticMarkup(createElement(KindlePager, { ...props(overrides), children: PAGES }));
}

/** The aria-label of every <button>, in order. */
function buttonLabels(html: string): string[] {
  return [...html.matchAll(/<button[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);
}

describe("KindlePager", () => {
  it("covers the window with its own surface", () => {
    const html = pager();
    expect(html).toMatch(/^<div class="fixed inset-0 z-\[45\] flex flex-col bg-white text-stone-800"/);
    expect(html).toContain('aria-label="Kindle mode"');
  });

  it("names the book and the chapter in its bar", () => {
    const html = pager();
    expect(html).toContain("श्रीमद्भागवतम्");
    expect(html).toContain("अध्याय एक — मुनियों की जिज्ञासा");
  });

  it("shows the book alone when there is no chapter yet (boundary)", () => {
    const html = pager({ chapterTitle: null });
    expect(html).toContain("श्रीमद्भागवतम्");
    expect(html).not.toContain(" — ");
  });

  it("has a way out, contents, language, text size and a bookmark in its bar", () => {
    const labels = buttonLabels(pager());
    expect(labels).toContain("Leave Kindle mode");
    expect(labels).toContain("Contents and bookmarks");
    expect(labels).toContain("Switch language");
    expect(labels).toContain("Text size and theme");
    expect(labels).toContain("Bookmark this place");
  });

  it("has an arrow at each edge of the page", () => {
    const labels = buttonLabels(pager());
    expect(labels).toContain("Previous page");
    expect(labels).toContain("Next page");
  });

  it("at the very start of the book the back arrow is off, the forward one on", () => {
    const html = pager({ hasPrevView: false });
    expect(html).toMatch(/<button disabled=""[^>]*aria-label="Previous page"/);
    expect(html).not.toMatch(/<button disabled=""[^>]*aria-label="Next page"/);
  });

  it("with only one screen and no more pages after, the forward arrow is off too (boundary)", () => {
    const html = pager({ hasPrevView: false, hasNextView: false });
    expect(html).toMatch(/<button disabled=""[^>]*aria-label="Previous page"/);
    expect(html).toMatch(/<button disabled=""[^>]*aria-label="Next page"/);
  });

  it("puts the rendered pages inside the column flow, untouched", () => {
    const html = pager();
    expect(html).toMatch(/<div class="kindle-flow"[^>]*><div data-page-num="21"><p>धर्मक्षेत्रे कुरुक्षेत्रे<\/p><\/div><\/div>/);
  });

  it("keeps a verse and a picture whole where a column can hold them", () => {
    const html = pager();
    expect(html).toContain('.kindle-flow [data-section-type="shlok"] { break-inside: avoid; }');
    expect(html).toContain(".kindle-flow div:has(> img) { break-inside: avoid; }");
    expect(html).toContain("column-fill: auto");
  });

  it("says where the reader is, like a Kindle", () => {
    const html = pager();
    expect(html).toContain("Page 21 of 1239 • 1%");
    expect(html).toContain("12 pages left in chapter");
  });

  it("the slider runs over every page of the book and sits on the current one", () => {
    const html = pager();
    expect(html).toMatch(/<input type="range" min="0" max="1238" step="1"[^>]*value="19"/);
    expect(html).toContain('aria-label="Place in the book"');
  });

  it("a book with no pages yet does not give the slider a negative end (negative case)", () => {
    const html = pager({ totalPages: 0, pageIndex: 0, pageNumber: null, lastPageNumber: 0, chapterPagesLeft: null });
    expect(html).toMatch(/<input type="range" min="0" max="0" step="1"[^>]*value="0"/);
    expect(html).not.toContain("Page ");
    expect(html).not.toContain("left in chapter");
  });

  it("keeps the text hidden until it has been measured, so a half-set page never shows", () => {
    expect(pager()).toMatch(/class="absolute overflow-hidden" style="[^"]*visibility:hidden/);
  });

  it("shows a spinner over the page while the reader's place is being found", () => {
    expect(pager({ veil: true })).toContain("animate-spin");
    expect(pager({ veil: false })).not.toContain("animate-spin");
  });

  it("marks the bookmark button once the place is saved", () => {
    const saved = pager({ bookmarkSaved: true });
    expect(saved).toMatch(/bg-orange-100 text-orange-700"[^>]*aria-label="Bookmark this place"/);
    expect(pager()).not.toMatch(/bg-orange-100 text-orange-700"[^>]*aria-label="Bookmark this place"/);
  });

  it("draws the settings panel it is handed under the text-size button", () => {
    const html = pager({ settingsOpen: true, settingsPanel: createElement("div", { id: "panel" }, "Reading Settings") });
    expect(html).toMatch(/data-settings-toggle="kindle"[\s\S]*<div id="panel">Reading Settings<\/div>/);
  });

  it("shows the language it was given on the switch", () => {
    expect(pager({ langLabel: "EN" })).toMatch(/aria-label="Switch language">EN<\/button>/);
  });
});

describe("ReaderPagesFrame", () => {
  const rail = createElement("nav", { id: "rail" });

  it("scrolling reader: the pages beside the section rail, with no Kindle surface", () => {
    const html = renderToStaticMarkup(createElement(ReaderPagesFrame, { kindle: null, rail, children: PAGES }));
    expect(html).toBe('<div class="flex items-start"><nav id="rail"></nav><div class="flex-1 min-w-0"><div data-page-num="21"><p>धर्मक्षेत्रे कुरुक्षेत्रे</p></div></div></div>');
  });

  it("Kindle mode: the same pages inside the pager, and no section rail", () => {
    const html = renderToStaticMarkup(createElement(ReaderPagesFrame, { kindle: props(), rail, children: PAGES }));
    expect(html).toContain('aria-label="Kindle mode"');
    expect(html).toContain('<div data-page-num="21"><p>धर्मक्षेत्रे कुरुक्षेत्रे</p></div>');
    expect(html).not.toContain('id="rail"');
  });
});

// ── The reader page wires it in ──────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const READER = readFileSync(resolve(HERE, "../../pages/bhagwatham.tsx"), "utf-8");

describe("Bhagwatham reader wiring", () => {
  it("the pages are rendered once, inside the frame, for both ways of reading", () => {
    expect(READER.match(/\{displayPages\.map\(\(page, pageIdx\) => \{/g)).toHaveLength(1);
    expect(READER).toMatch(/<ReaderPagesFrame\s+ref=\{kindleRef\}\s+kindle=\{kindleProps\}/);
  });

  it("Kindle mode opens only when there are pages to show and no search is listing results", () => {
    expect(READER).toContain("const kindleActive = kindleMode && !loading && !searchQuery.trim() && displayPages.length > 0;");
  });

  it("has a Kindle button in the reader's bar and K on the keyboard", () => {
    expect(READER).toContain('aria-label="Kindle mode"');
    expect(READER).toMatch(/onClick=\{enterKindle\}/);
    expect(READER).toMatch(/case "k":[\s\S]{0,120}toggleKindleRef\.current\(\);/);
  });

  it("leaves the arrows, space and F to the pager while Kindle mode is open", () => {
    expect(READER).toContain("if (kindleActive && kindleKeyAction(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey })) return;");
  });

  it("a chapter, a bookmark, a typed page number and the slider all turn to their place in Kindle mode", () => {
    expect(READER).toContain("setKindlePending({ page: ch.pageNumber, chapter: ch.globalNumber });");
    expect(READER).toContain("setKindlePending({ page: b.page_number, anchor: b.line_anchor });");
    expect(READER).toContain("if (kindleMode) { setKindlePending({ page: pageNum }); return; }");
    expect(READER).toContain("if (p) setKindlePending({ page: p.pageNumber });");
  });

  it("remembers the place across visits, but not while a jump is still on its way", () => {
    expect(READER).toMatch(/if \(kindlePendingRef\.current\) return;\s*try \{\s*localStorage\.setItem\(KINDLE_POSITION_KEY, serialisePosition\(place\.anchorPage \?\? place\.pageNumber, place\.anchorText\)\);/);
    expect(READER).toContain("return loadKindleMode() ? parseStoredPosition(localStorage.getItem(KINDLE_POSITION_KEY)) : null;");
  });

  it("a bookmark made in Kindle mode saves the line at the top of the screen", () => {
    expect(READER).toContain("const kindlePlace = kindleRef.current?.anchor() ?? null;");
    expect(READER).toContain("let lineAnchor: string | null = kindlePlace ? anchorFor(kindlePlace.text) : null;");
  });

  it("the scroll trackers stand down in Kindle mode: the pager reports its own place", () => {
    expect(READER.match(/if \(kindleActive\) return; \/\/ Kindle mode: the pager reports its place itself/g)).toHaveLength(2);
  });

  it("Contents is a drawer over the page in Kindle mode, and starts closed there", () => {
    expect(READER).toContain("drawer={kindleActive}");
    expect(READER).toContain('window.innerWidth >= 1024 && !loadKindleMode()');
  });
});
