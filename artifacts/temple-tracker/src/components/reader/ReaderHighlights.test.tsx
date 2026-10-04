import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  HighlightBar, HighlightLayer, HighlightsPanel, NoteEditor, highlightsSupported,
  type HighlightBarProps, type HighlightStore, type NoteEditorProps,
} from "./ReaderHighlights";
import { HIGHLIGHT_COLORS, MAX_NOTE_CHARS, type ReaderHighlight } from "@/lib/readerHighlights";

// The highlight bar, the note editor and the list. Rendered to static markup
// (the test environment is node, no DOM); finding a passage on a page and
// what is stored are tested in lib/readerHighlights.test.ts.

const noop = () => {};

function bar(overrides: Partial<HighlightBarProps> = {}): string {
  return renderToStaticMarkup(createElement(HighlightBar, {
    canHighlight: true, activeColor: null, hasNote: false, onColor: noop, onCopy: noop, onNote: noop, ...overrides,
  }));
}
const labels = (html: string): string[] => [...html.matchAll(/aria-label="([^"]*)"/g)].map(m => m[1]);

describe("HighlightBar", () => {
  it("offers four colours, copy and a note, in that order, as on a Kindle", () => {
    expect(labels(bar())).toEqual([
      "Highlight yellow", "Highlight blue", "Highlight pink", "Highlight orange",
      "Copy the selected text", "Add a note",
    ]);
  });

  it("a fresh selection has no colour marked and nothing to remove", () => {
    const html = bar();
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toContain("Remove the highlight");
  });

  it("an existing highlight shows its colour, and can be removed", () => {
    const html = bar({ activeColor: "pink", onRemove: noop });
    expect(html).toMatch(/aria-label="Highlight pink" aria-pressed="true"/);
    expect([...html.matchAll(/aria-pressed="true"/g)]).toHaveLength(1);
    expect(labels(html)).toContain("Remove the highlight");
  });

  it("says Edit when the passage already has a note", () => {
    expect(labels(bar({ hasNote: true, activeColor: "yellow", onRemove: noop }))).toContain("Edit the note");
    expect(labels(bar({ hasNote: true, activeColor: "yellow", onRemove: noop }))).not.toContain("Add a note");
  });

  it("a selection too long to highlight can still be copied (boundary)", () => {
    const html = bar({ tooLong: true });
    for (const c of HIGHLIGHT_COLORS) expect(html).toMatch(new RegExp(`<button type="button" disabled=""[^>]*aria-label="Highlight ${c}"`));
    expect(html).toMatch(/<button type="button" disabled=""[^>]*aria-label="Add a note"/);
    expect(html).not.toMatch(/<button type="button" disabled=""[^>]*aria-label="Copy the selected text"/);
    expect(html).toContain("Select a shorter passage to highlight it");
  });

  it("in a browser that cannot paint highlights, offers Copy only (negative case)", () => {
    expect(labels(bar({ canHighlight: false }))).toEqual(["Copy the selected text"]);
  });

  it("shows a tick once copied", () => {
    expect(bar({ copied: true })).toContain("lucide-check");
    expect(bar()).not.toContain("lucide-check");
  });
});

function editor(overrides: Partial<NoteEditorProps> = {}): string {
  return renderToStaticMarkup(createElement(NoteEditor, {
    passage: "धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः", color: "blue", value: "", existing: false,
    onChange: noop, onSave: noop, onCancel: noop, onDeleteNote: noop, ...overrides,
  }));
}
const buttons = (html: string): string[] => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1].replace(/<[^>]+>/g, "").trim());

describe("NoteEditor", () => {
  it("shows the passage the note is on, and where the note is kept", () => {
    const html = editor();
    expect(html).toContain("Add a note");
    expect(html).toContain("धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः");
    expect(html).toContain("Kept on this device only.");
  });

  it("a new note cannot be saved empty, and has nothing to delete", () => {
    const html = editor();
    expect(buttons(html)).toEqual(["Cancel", "Save note"]);
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Save note<\/button>/);
  });

  it("can be saved once something is written", () => {
    expect(editor({ value: "देखें 2.7" })).not.toMatch(/disabled=""[^>]*>Save note/);
  });

  it("whitespace alone is not a note (boundary)", () => {
    expect(editor({ value: "   \n " })).toMatch(/disabled=""[^>]*>Save note/);
  });

  it("an existing note can be edited, emptied or deleted", () => {
    const html = editor({ existing: true, value: "" });
    expect(html).toContain("Edit note");
    expect(buttons(html)).toEqual(["Delete note", "Cancel", "Save note"]);
    expect(html).not.toMatch(/disabled=""[^>]*>Save note/);
  });

  it("limits the note's length", () => {
    expect(editor()).toContain(`maxLength="${MAX_NOTE_CHARS}"`);
  });

  it("cuts a very long passage down to its start", () => {
    const html = editor({ passage: "शब्द ".repeat(200) });
    expect(html).toContain("…");
    expect(html.length).toBeLessThan(3000);
  });
});

const H = (over: Partial<ReaderHighlight>): ReaderHighlight => ({
  id: "a", page: 12, text: "धर्मक्षेत्रे कुरुक्षेत्रे", prefix: "", suffix: "", color: "yellow", note: "",
  createdAt: "2026-10-04T10:00:00.000Z", updatedAt: "2026-10-04T10:00:00.000Z", ...over,
});

function panel(items: ReaderHighlight[]): string {
  return renderToStaticMarkup(createElement(HighlightsPanel, { items, onJump: noop, onRemove: noop }));
}

describe("HighlightsPanel", () => {
  it("says how to make one when there are none, and that they stay on this device", () => {
    const html = panel([]);
    expect(html).toContain("No highlights or notes yet");
    expect(html).toContain("They are kept on this device only.");
    expect(html).not.toContain("<ul");
  });

  it("lists each passage with its page, in reading order", () => {
    const html = panel([H({ id: "late", page: 300, text: "बाद का अंश" }), H({ id: "early", page: 4, text: "पहला अंश" })]);
    expect(html.indexOf("पहला अंश")).toBeLessThan(html.indexOf("बाद का अंश"));
    expect(html).toContain("Page 4");
    expect(html).toContain("Page 300");
  });

  it("shows a note under its passage, and none where there is none", () => {
    const html = panel([H({ id: "n", note: "गीता 2.7 से तुलना" }), H({ id: "p", page: 20, text: "केवल रंग" })]);
    expect([...html.matchAll(/bg-stone-100 px-2 py-1/g)]).toHaveLength(1);
    expect(html).toContain("गीता 2.7 से तुलना");
  });

  it("shows each one's colour", () => {
    const html = panel([H({ color: "orange" })]);
    expect(html).toContain("background-color:#f2bd6e");
  });

  it("each has a jump and a remove, named by page", () => {
    const html = panel([H({ page: 77 })]);
    expect(html).toContain('title="Go to this passage"');
    expect(html).toContain('aria-label="Remove the highlight on page 77"');
  });

  it("escapes whatever the reader wrote in a note", () => {
    const html = panel([H({ note: "<script>alert(1)</script>" })]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("HighlightLayer", () => {
  const store: HighlightStore = { items: [], add: () => "", recolour: noop, setNote: noop, remove: noop };

  it("with nothing selected draws no bar and no editor, only the paint styles", () => {
    const html = renderToStaticMarkup(createElement(HighlightLayer, { store }));
    expect(html).toMatch(/^<style>[\s\S]*<\/style>$/);
    expect(html).not.toContain('role="toolbar"');
    expect(html).not.toContain('role="dialog"');
  });

  it("styles every colour and underlines a passage that has a note", () => {
    const html = renderToStaticMarkup(createElement(HighlightLayer, { store }));
    for (const c of HIGHLIGHT_COLORS) expect(html).toContain(`::highlight(reader-hl-${c}) { background-color: rgba(`);
    expect(html).toContain("::highlight(reader-hl-note) { text-decoration: underline dotted;");
  });

  it("knows it cannot paint where there is no highlight registry (negative case)", () => {
    expect(highlightsSupported()).toBe(false); // node has none
  });
});

// ── Wiring ───────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const LAYER = readFileSync(resolve(HERE, "./ReaderHighlights.tsx"), "utf-8");
const CARD = readFileSync(resolve(HERE, "./WordLookupCard.tsx"), "utf-8");
const READER = readFileSync(resolve(HERE, "../../pages/bhagwatham.tsx"), "utf-8");

describe("highlights wiring", () => {
  it("the reader keeps one set of highlights for the book and hands it to the layer and the list", () => {
    expect(READER).toContain('const highlights = useReaderHighlights("bhagavatam");');
    expect(READER).toContain("<HighlightLayer store={highlights} />");
    expect(READER).toContain("highlights={highlights.items}");
    expect(READER).toContain("onHighlightRemove={highlights.remove}");
  });

  it("the sidebar has a Notes tab that lists them", () => {
    expect(READER).toContain('data-tab="highlights"');
    expect(READER).toMatch(/sidebarTab === "highlights" \? \(\s*<HighlightsPanel items=\{highlights\} onJump=\{onHighlightJump\} onRemove=\{onHighlightRemove\} \/>/);
  });

  it("a listed highlight is reached the way a bookmark's line is, so it works in Kindle mode too", () => {
    expect(READER).toContain("onHighlightJump={(h) => handleBookmarkJump({ page_number: h.page, line_anchor: h.text })}");
  });

  it("they are kept in the browser, never sent anywhere", () => {
    expect(LAYER).toContain("localStorage.setItem(key, serialiseHighlights(next))");
    expect(LAYER).not.toMatch(/fetch\(|sbFetch|supabase/i);
  });

  it("a highlight lives on one printed page: a selection across two is not offered one", () => {
    expect(LAYER).toMatch(/if \(!pageEl \|\| elementOf\(range\.endContainer\)\?\.closest\("\[data-page-num\]"\) !== pageEl\) \{ close\(\); return; \}/);
  });

  it("text that is not the book's (buttons) is left out of what a quote is matched against", () => {
    expect(LAYER).toContain(`const NOT_BOOK_TEXT = "button, [role='button'], script, style";`);
  });

  it("repaints when the page's text changes, and paints nothing when the words are gone", () => {
    expect(LAYER).toContain("observer.observe(root, { childList: true, subtree: true, characterData: true });");
    expect(LAYER).toMatch(/if \(!raw\) continue; \/\/ the words are no longer on the page/);
  });

  it("choosing a colour on a selection clears the selection so the colour shows", () => {
    expect(LAYER).toMatch(/add\(target\.page, target\.quote, color\);\s*\/\/[^\n]*\s*window\.getSelection\(\)\?\.removeAllRanges\(\);\s*close\(\);/);
  });

  it("a note written on a bare selection highlights it in the default colour", () => {
    expect(LAYER).toContain("else if (editing.text.trim()) add(t.page, t.quote, DEFAULT_NOTE_COLOR, editing.text);");
  });

  it("the dictionary card keeps clear of the bar next to the word", () => {
    expect(CARD).toContain("const place = cardPlacement(lookup.rect, viewport, { width, height }, barReserve(lookup.rect, viewport, coarse));");
  });
});
