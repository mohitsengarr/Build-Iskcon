import { describe, expect, it } from "vitest";
import {
  BAR_GAP_PX, BAR_HEIGHT_PX, BAR_WIDTH_PX, DEFAULT_NOTE_COLOR, HIGHLIGHT_COLORS, HIGHLIGHT_PAINT, HIGHLIGHT_SWATCH,
  MAX_HIGHLIGHTS, MAX_HIGHLIGHT_CHARS, MAX_NOTE_CHARS, NOTE_REGISTRY_NAME, QUOTE_CONTEXT_CHARS,
  addHighlight, barPlacement, barReserve, buildTextIndex, highlightRegistryName, highlightSnippet,
  highlightsStorageKey, indexPosition, isHighlightColor, locateQuote, parseStoredHighlights, quoteAt, rawRange,
  recolourHighlight, removeHighlight, serialiseHighlights, setHighlightNote, sortHighlights,
  type Quote, type ReaderHighlight,
} from "./readerHighlights";
import { cardPlacement } from "./wordLookup";

// Highlights and notes: what is stored, how a stored passage is found again on
// the page, and where the bar goes.

const NOW = "2026-10-04T12:00:00.000Z";
const LATER = "2026-10-05T09:30:00.000Z";

const quote = (text: string, prefix = "", suffix = ""): Quote => ({ text, prefix, suffix });
const make = (over: Partial<ReaderHighlight> = {}): ReaderHighlight => ({
  id: "a1", page: 12, text: "धर्मक्षेत्रे कुरुक्षेत्रे", prefix: "उवाच ", suffix: " समवेता", color: "yellow", note: "", createdAt: NOW, updatedAt: NOW, ...over,
});

describe("colours", () => {
  it("there are four, as on a Kindle, each with a dot and a paint", () => {
    expect(HIGHLIGHT_COLORS).toEqual(["yellow", "blue", "pink", "orange"]);
    for (const c of HIGHLIGHT_COLORS) {
      expect(HIGHLIGHT_SWATCH[c]).toMatch(/^#[0-9a-f]{6}$/);
      expect(HIGHLIGHT_PAINT[c]).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
    }
  });

  it("the paint is see-through, so the words stay readable on a dark page", () => {
    for (const c of HIGHLIGHT_COLORS) {
      const alpha = Number(/, (0\.\d+)\)$/.exec(HIGHLIGHT_PAINT[c])?.[1]);
      expect(alpha, c).toBeGreaterThan(0.3);
      expect(alpha, c).toBeLessThan(0.7);
    }
  });

  it("each colour has its own name in the browser's registry, and notes have theirs", () => {
    const names = HIGHLIGHT_COLORS.map(highlightRegistryName);
    expect(names).toEqual(["reader-hl-yellow", "reader-hl-blue", "reader-hl-pink", "reader-hl-orange"]);
    expect(names).not.toContain(NOTE_REGISTRY_NAME);
  });

  it("knows a colour from anything else (negative case)", () => {
    expect(isHighlightColor("pink")).toBe(true);
    for (const v of ["green", "", "Yellow", null, undefined, 3]) expect(isHighlightColor(v), String(v)).toBe(false);
    expect(isHighlightColor(DEFAULT_NOTE_COLOR)).toBe(true);
  });
});

describe("what is stored", () => {
  it("is kept per book", () => {
    expect(highlightsStorageKey("bhagavatam")).toBe("reader_highlights_v1:bhagavatam");
    expect(highlightsStorageKey("gita")).not.toBe(highlightsStorageKey("bhagavatam"));
  });

  it("round-trips", () => {
    const items = [make(), make({ id: "b2", page: 40, color: "blue", note: "देखें 2.7" })];
    expect(parseStoredHighlights(serialiseHighlights(items))).toEqual(items);
  });

  it("is empty for nothing stored or something unreadable (negative case)", () => {
    for (const raw of [null, undefined, "", "not json", "{}", "null", "42", 7, {}]) {
      expect(parseStoredHighlights(raw), String(raw)).toEqual([]);
    }
  });

  it("drops a broken entry and keeps the good ones", () => {
    const raw = JSON.stringify([
      make(),
      null,
      "text",
      { id: "x", page: 3 },                       // no text
      { ...make({ id: "y" }), page: 0 },          // no page
      { ...make({ id: "z" }), page: 2.5 },
      { ...make(), id: "" },
      make({ id: "ok2", page: 9 }),
    ]);
    expect(parseStoredHighlights(raw).map(h => h.id)).toEqual(["a1", "ok2"]);
  });

  it("drops a second entry with the same id", () => {
    expect(parseStoredHighlights(JSON.stringify([make(), make({ page: 99 })]))).toHaveLength(1);
  });

  it("repairs what it can: an unknown colour, a missing note, over-long text (boundary)", () => {
    const raw = JSON.stringify([{ id: "q", page: 5, text: "क".repeat(MAX_HIGHLIGHT_CHARS + 50), color: "green", prefix: "p".repeat(90), suffix: "s".repeat(90) }]);
    const [h] = parseStoredHighlights(raw);
    expect(h.color).toBe(DEFAULT_NOTE_COLOR);
    expect(h.note).toBe("");
    expect(h.text).toHaveLength(MAX_HIGHLIGHT_CHARS);
    expect(h.prefix).toHaveLength(QUOTE_CONTEXT_CHARS);
    expect(h.suffix).toHaveLength(QUOTE_CONTEXT_CHARS);
    expect(h.updatedAt).toBe(h.createdAt);
  });
});

describe("addHighlight", () => {
  it("adds a passage with its colour", () => {
    const next = addHighlight([], { id: "n1", page: 7, quote: quote("सत्यं परं धीमहि", "कुहकं ", " ॥"), color: "pink", now: NOW });
    expect(next).toEqual([{ id: "n1", page: 7, text: "सत्यं परं धीमहि", prefix: "कुहकं ", suffix: " ॥", color: "pink", note: "", createdAt: NOW, updatedAt: NOW }]);
  });

  it("stores a note with it, trimmed", () => {
    const [h] = addHighlight([], { id: "n1", page: 7, quote: quote("धीमहि"), color: "yellow", note: "  ध्यान  ", now: NOW });
    expect(h.note).toBe("ध्यान");
  });

  it("does not stack a second highlight on the same passage: it changes the first", () => {
    const first = addHighlight([], { id: "n1", page: 7, quote: quote("धीमहि", "परं "), color: "yellow", note: "पहला", now: NOW });
    const again = addHighlight(first, { id: "n2", page: 7, quote: quote("धीमहि", "परं "), color: "blue", now: LATER });
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ id: "n1", color: "blue", note: "पहला", createdAt: NOW, updatedAt: LATER });
  });

  it("the same words elsewhere on the page, or on another page, are a different passage", () => {
    const first = addHighlight([], { id: "n1", page: 7, quote: quote("भगवान्", "श्री "), color: "yellow", now: NOW });
    const elsewhere = addHighlight(first, { id: "n2", page: 7, quote: quote("भगवान्", "आदि "), color: "yellow", now: NOW });
    const otherPage = addHighlight(elsewhere, { id: "n3", page: 8, quote: quote("भगवान्", "श्री "), color: "yellow", now: NOW });
    expect(otherPage.map(h => h.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("adds nothing for an empty passage or no page (negative case)", () => {
    expect(addHighlight([make()], { id: "n", page: 7, quote: quote("   "), color: "yellow", now: NOW })).toEqual([make()]);
    expect(addHighlight([], { id: "n", page: 0, quote: quote("धीमहि"), color: "yellow", now: NOW })).toEqual([]);
  });

  it("does not change the list it was given", () => {
    const items = [make()];
    addHighlight(items, { id: "n", page: 7, quote: quote("धीमहि"), color: "yellow", now: NOW });
    expect(items).toEqual([make()]);
  });

  it("keeps the newest when the book is full (boundary)", () => {
    const full = Array.from({ length: MAX_HIGHLIGHTS }, (_, i) => make({ id: `h${i}`, text: `t${i}` }));
    const next = addHighlight(full, { id: "new", page: 1, quote: quote("नया"), color: "yellow", now: NOW });
    expect(next).toHaveLength(MAX_HIGHLIGHTS);
    expect(next[0].id).toBe("h1");
    expect(next[next.length - 1].id).toBe("new");
  });

  it("cuts an over-long note", () => {
    const [h] = addHighlight([], { id: "n", page: 1, quote: quote("धीमहि"), color: "yellow", note: "न".repeat(MAX_NOTE_CHARS + 10), now: NOW });
    expect(h.note).toHaveLength(MAX_NOTE_CHARS);
  });
});

describe("changing a highlight", () => {
  const items = [make(), make({ id: "b2", page: 40 })];

  it("recolours the one named and stamps it", () => {
    const next = recolourHighlight(items, "b2", "orange", LATER);
    expect(next[1]).toMatchObject({ color: "orange", updatedAt: LATER });
    expect(next[0]).toBe(items[0]);
  });

  it("recolouring to the same colour changes nothing (boundary)", () => {
    expect(recolourHighlight(items, "a1", "yellow", LATER)[0]).toBe(items[0]);
  });

  it("sets, replaces and clears a note; the highlight stays", () => {
    const withNote = setHighlightNote(items, "a1", "  देखें 2.7 ", LATER);
    expect(withNote[0]).toMatchObject({ note: "देखें 2.7", updatedAt: LATER });
    const cleared = setHighlightNote(withNote, "a1", "   ", NOW);
    expect(cleared).toHaveLength(2);
    expect(cleared[0].note).toBe("");
  });

  it("removes only the one named", () => {
    expect(removeHighlight(items, "a1").map(h => h.id)).toEqual(["b2"]);
  });

  it("an unknown id changes nothing (negative case)", () => {
    expect(recolourHighlight(items, "nope", "blue", LATER)).toEqual(items);
    expect(setHighlightNote(items, "nope", "x", LATER)).toEqual(items);
    expect(removeHighlight(items, "nope")).toEqual(items);
  });
});

describe("the list", () => {
  it("is in reading order: by page, then in the order made", () => {
    const items = [
      make({ id: "c", page: 40, createdAt: NOW }),
      make({ id: "a", page: 2, createdAt: LATER }),
      make({ id: "b", page: 2, createdAt: NOW }),
    ];
    expect(sortHighlights(items).map(h => h.id)).toEqual(["b", "a", "c"]);
    expect(items.map(h => h.id)).toEqual(["c", "a", "b"]); // not sorted in place
  });

  it("shows the start of a long passage", () => {
    expect(highlightSnippet("छोटा वाक्य")).toBe("छोटा वाक्य");
    expect(highlightSnippet("  दो   रिक्त\nस्थान ")).toBe("दो रिक्त स्थान");
    const long = highlightSnippet("शब्द ".repeat(60), 20);
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(21);
  });
});

describe("buildTextIndex", () => {
  it("joins a page's text nodes and remembers where each character came from", () => {
    const index = buildTextIndex(["धर्म ", "क्षेत्रे"]);
    expect(index.text).toBe("धर्म क्षेत्रे");
    expect(index.chunkOf[0]).toBe(0);
    expect(index.chunkOf[index.text.indexOf("क्षेत्रे")]).toBe(1);
    expect(index.offsetOf[index.text.indexOf("क्षेत्रे")]).toBe(0);
  });

  it("collapses every run of whitespace to one space, across nodes too", () => {
    expect(buildTextIndex(["one  two\n\n", "   three"]).text).toBe("one two three");
  });

  it("has no space at the very start", () => {
    expect(buildTextIndex(["  \n", " word"]).text).toBe("word");
  });

  it("a collapsed space points at the first whitespace character of its run", () => {
    const index = buildTextIndex(["ab   cd"]);
    expect(index.text).toBe("ab cd");
    expect(index.offsetOf).toEqual([0, 1, 2, 5, 6]);
  });

  it("is empty for an empty page (negative case)", () => {
    expect(buildTextIndex([])).toEqual({ text: "", chunkOf: [], offsetOf: [] });
    expect(buildTextIndex(["", "   "]).text).toBe("");
  });
});

describe("indexPosition", () => {
  const index = buildTextIndex(["ab   cd", "ef"]); // "ab cdef"

  it("finds the place of a spot on the page", () => {
    expect(indexPosition(index, 0, 0)).toBe(0);
    expect(indexPosition(index, 0, 5)).toBe(3);
    expect(indexPosition(index, 1, 0)).toBe(5);
  });

  it("a spot inside collapsed whitespace is the next character (boundary)", () => {
    expect(indexPosition(index, 0, 3)).toBe(3);
    expect(indexPosition(index, 0, 4)).toBe(3);
  });

  it("a spot past the end is the end (boundary)", () => {
    expect(indexPosition(index, 1, 2)).toBe(index.text.length);
    expect(indexPosition(index, 9, 0)).toBe(index.text.length);
  });
});

describe("quoteAt", () => {
  const index = buildTextIndex(["श्रीभगवान् उवाच: धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः मामकाः पाण्डवाश्चैव"]);
  const at = (needle: string) => index.text.indexOf(needle);

  it("takes the words and a little of each side", () => {
    const start = at("कुरुक्षेत्रे");
    const q = quoteAt(index, start, start + "कुरुक्षेत्रे समवेता".length);
    expect(q?.text).toBe("कुरुक्षेत्रे समवेता");
    expect(q?.prefix.endsWith("धर्मक्षेत्रे ")).toBe(true);
    expect(q?.suffix.startsWith(" युयुत्सवः")).toBe(true);
    expect(q!.prefix.length).toBeLessThanOrEqual(QUOTE_CONTEXT_CHARS);
    expect(q!.suffix.length).toBeLessThanOrEqual(QUOTE_CONTEXT_CHARS);
  });

  it("leaves the spaces at the ends out of the words", () => {
    const start = at(" उवाच:");
    const q = quoteAt(index, start, start + " उवाच: ".length);
    expect(q?.text).toBe("उवाच:");
  });

  it("at the very start of a page there is nothing before it (boundary)", () => {
    const q = quoteAt(index, 0, "श्रीभगवान्".length);
    expect(q).toMatchObject({ text: "श्रीभगवान्", prefix: "" });
  });

  it("is nothing for a stretch of only space, or none at all (negative case)", () => {
    const space = at(" उवाच");
    expect(quoteAt(index, space, space + 1)).toBeNull();
    expect(quoteAt(index, 5, 5)).toBeNull();
    expect(quoteAt(index, 9, 3)).toBeNull();
  });
});

describe("locateQuote", () => {
  const page = "भगवान् ने कहा कि भगवान् की कृपा से ही भगवान् को जाना जाता है";
  const index = buildTextIndex([page]);

  it("finds the words on the page", () => {
    const found = locateQuote(index, quote("की कृपा से"));
    expect(found && index.text.slice(found.start, found.end)).toBe("की कृपा से");
  });

  it("among the same words several times, picks the one whose surroundings match", () => {
    const second = page.indexOf("भगवान्", 5);
    const third = page.indexOf("भगवान्", second + 5);
    expect(locateQuote(index, quote("भगवान्", "कहा कि ", " की कृपा"))?.start).toBe(second);
    expect(locateQuote(index, quote("भगवान्", "से ही ", " को जाना"))?.start).toBe(third);
    expect(locateQuote(index, quote("भगवान्", "", " ने कहा"))?.start).toBe(0);
  });

  it("with nothing to tell them apart, takes the first", () => {
    expect(locateQuote(index, quote("भगवान्"))?.start).toBe(0);
  });

  it("still finds a passage after text elsewhere on the page was corrected", () => {
    const corrected = buildTextIndex([page.replace("जाना जाता है", "जाना जा सकता है")]);
    expect(locateQuote(corrected, quote("भगवान्", "कहा कि ", " की कृपा"))?.start).toBe(page.indexOf("भगवान्", 5));
  });

  it("finds it however the words were wrapped", () => {
    const rewrapped = buildTextIndex(["भगवान् ने कहा कि\n", "   भगवान् की  कृपा से ही भगवान् को जाना जाता है"]);
    expect(locateQuote(rewrapped, quote("कहा कि भगवान् की कृपा"))).not.toBeNull();
  });

  it("is nothing when the words themselves are gone: it must not paint other words (negative case)", () => {
    expect(locateQuote(index, quote("की दया से"))).toBeNull();
    expect(locateQuote(index, quote(""))).toBeNull();
    expect(locateQuote(buildTextIndex([]), quote("भगवान्"))).toBeNull();
  });
});

describe("rawRange", () => {
  const index = buildTextIndex(["धर्म  ", "क्षेत्रे कुरु", "क्षेत्रे"]); // "धर्म क्षेत्रे कुरुक्षेत्रे"

  it("turns a stretch of the index back into places on the page", () => {
    const found = locateQuote(index, quote("क्षेत्रे कुरुक्षेत्रे"))!;
    expect(rawRange(index, found.start, found.end)).toEqual({ startChunk: 1, startOffset: 0, endChunk: 2, endOffset: "क्षेत्रे".length });
  });

  it("a passage inside one node starts and ends in it", () => {
    const found = locateQuote(index, quote("कुरु"))!;
    const raw = rawRange(index, found.start, found.end)!;
    expect(raw.startChunk).toBe(1);
    expect(raw.endChunk).toBe(1);
    expect(raw.endOffset - raw.startOffset).toBe("कुरु".length);
  });

  it("is nothing for an empty or impossible stretch (negative case)", () => {
    expect(rawRange(index, 3, 3)).toBeNull();
    expect(rawRange(index, 5, 2)).toBeNull();
    expect(rawRange(index, -1, 4)).toBeNull();
    expect(rawRange(index, 0, index.text.length + 1)).toBeNull();
  });

  it("capture then locate lands on the same words (round trip)", () => {
    const start = indexPosition(index, 1, 0);
    const end = indexPosition(index, 2, 3);
    const q = quoteAt(index, start, end)!;
    const found = locateQuote(index, q)!;
    expect(index.text.slice(found.start, found.end)).toBe(q.text);
    expect(rawRange(index, found.start, found.end)).toMatchObject({ startChunk: 1, startOffset: 0, endChunk: 2, endOffset: 3 });
  });
});

describe("barPlacement", () => {
  const viewport = { width: 1280, height: 800 };
  const word = { left: 600, top: 300, bottom: 320, width: 80 };

  it("sits above the selection, centred on it", () => {
    expect(barPlacement(word, viewport)).toEqual({ left: 640 - BAR_WIDTH_PX / 2, top: 300 - BAR_GAP_PX - BAR_HEIGHT_PX, side: "above" });
  });

  it("goes below when there is no room above", () => {
    const p = barPlacement({ ...word, top: 20, bottom: 40 }, viewport);
    expect(p).toMatchObject({ side: "below", top: 40 + BAR_GAP_PX });
  });

  it("goes below on a touch screen, where the phone's own bubble takes the space above", () => {
    expect(barPlacement(word, viewport, true)).toMatchObject({ side: "below", top: 320 + BAR_GAP_PX });
  });

  it("on a touch screen with no room below, goes above after all (boundary)", () => {
    expect(barPlacement({ ...word, top: 760, bottom: 790 }, viewport, true).side).toBe("above");
  });

  it("stays inside the window at both edges", () => {
    expect(barPlacement({ ...word, left: 2, width: 20 }, viewport).left).toBe(8);
    expect(barPlacement({ ...word, left: 1260, width: 20 }, viewport).left).toBe(1280 - BAR_WIDTH_PX - 8);
  });

  it("uses the bar's measured width when given one", () => {
    expect(barPlacement(word, viewport, false, 300).left).toBe(640 - 150);
  });

  it("a selection taller than the window still gets a bar on screen (negative case)", () => {
    const p = barPlacement({ left: 100, top: -50, bottom: 900, width: 400 }, viewport);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top).toBeLessThan(viewport.height);
  });
});

describe("barReserve — the dictionary card keeps clear of the bar", () => {
  const viewport = { width: 1280, height: 800 };
  const card = { width: 320, height: 200 };
  const room = BAR_HEIGHT_PX + BAR_GAP_PX;

  it("reserves the side the bar is on", () => {
    expect(barReserve({ left: 600, top: 300, bottom: 320, width: 80 }, viewport)).toEqual({ above: room, below: 0 });
    expect(barReserve({ left: 600, top: 300, bottom: 320, width: 80 }, viewport, true)).toEqual({ above: 0, below: room });
    expect(barReserve({ left: 600, top: 20, bottom: 40, width: 80 }, viewport)).toEqual({ above: 0, below: room });
  });

  it("bar above, card below: neither moves for the other", () => {
    const word = { left: 600, top: 300, bottom: 320, width: 80 };
    const place = cardPlacement(word, viewport, card, barReserve(word, viewport));
    expect(place).toMatchObject({ placement: "below", top: 330 });
  });

  it("near the bottom the card goes above the bar, not on it", () => {
    const word = { left: 600, top: 700, bottom: 720, width: 80 };
    const bar = barPlacement(word, viewport);
    const place = cardPlacement(word, viewport, card, barReserve(word, viewport));
    expect(place.placement).toBe("above");
    expect(place.top + card.height).toBeLessThanOrEqual(bar.top);
  });

  it("on a touch screen the card goes below the bar, not on it", () => {
    const word = { left: 100, top: 200, bottom: 222, width: 60 };
    const phone = { width: 375, height: 812 };
    const bar = barPlacement(word, phone, true);
    const place = cardPlacement(word, phone, { width: 320, height: 200 }, barReserve(word, phone, true));
    expect(place.placement).toBe("below");
    expect(place.top).toBeGreaterThanOrEqual(bar.top + BAR_HEIGHT_PX);
  });
});
