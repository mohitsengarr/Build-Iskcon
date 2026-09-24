import { describe, expect, it } from "vitest";
import {
  ANCHOR_CHARS,
  BOOKMARK_CONFLICT_COLUMNS,
  BOOKMARK_UPSERT_PREFER,
  HEADER_BUFFER_PX,
  anchorFor,
  anchorMatches,
  bookmarkUpsertPath,
  findAnchoredParagraph,
  findTopmostVisible,
} from "./bookmarks";

const para = (text: string | null, top: number, height = 20) => ({
  textContent: text,
  getBoundingClientRect: () => ({ top, bottom: top + height, height }),
});

describe("bookmarkUpsertPath", () => {
  it("names the conflicting columns, without which PostgREST answers 409 instead of merging", () => {
    expect(bookmarkUpsertPath("gita_bookmarks")).toBe("gita_bookmarks?on_conflict=reader_id,page_number");
  });

  it("works for every book's table", () => {
    for (const table of ["bhagavatam_bookmarks", "chaitanya_bookmarks", "gita_bookmarks"]) {
      expect(bookmarkUpsertPath(table)).toBe(`${table}?on_conflict=${BOOKMARK_CONFLICT_COLUMNS}`);
    }
  });

  it("appends to a path that already carries a query", () => {
    expect(bookmarkUpsertPath("gita_bookmarks?select=id")).toBe("gita_bookmarks?select=id&on_conflict=reader_id,page_number");
  });

  it("trims surrounding space", () => {
    expect(bookmarkUpsertPath("  gita_bookmarks  ")).toBe("gita_bookmarks?on_conflict=reader_id,page_number");
  });

  it("refuses an empty table rather than posting to the collection root", () => {
    expect(() => bookmarkUpsertPath("")).toThrow(/no table/);
    expect(() => bookmarkUpsertPath("   ")).toThrow(/no table/);
    expect(() => bookmarkUpsertPath(undefined as unknown as string)).toThrow(/no table/);
  });

  it("asks for the stored row back, and for a merge rather than a second row", () => {
    expect(BOOKMARK_UPSERT_PREFER).toContain("resolution=merge-duplicates");
    expect(BOOKMARK_UPSERT_PREFER).toContain("return=representation");
  });
});

describe("findTopmostVisible", () => {
  it("picks the first line below the header, not the one hidden behind it", () => {
    // Arrange: one line scrolled under the sticky bar, one just below it
    const hidden = para("under the header", HEADER_BUFFER_PX - 60);
    const reading = para("the line being read", HEADER_BUFFER_PX + 5);
    const lower = para("further down", HEADER_BUFFER_PX + 400);
    // Act / Assert
    expect(findTopmostVisible([hidden, reading, lower])).toBe(reading);
  });

  it("keeps a long line the reader is part-way through", () => {
    // Its top is above the header but most of it is still on screen
    const straddling = para("a long paragraph", HEADER_BUFFER_PX - 30, 200);
    const below = para("the next one", HEADER_BUFFER_PX + 180);
    expect(findTopmostVisible([straddling, below])).toBe(straddling);
  });

  it("skips empty and whitespace-only paragraphs", () => {
    const blank = para("   ", HEADER_BUFFER_PX + 1);
    const none = para(null, HEADER_BUFFER_PX + 2);
    const real = para("real text", HEADER_BUFFER_PX + 40);
    expect(findTopmostVisible([blank, none, real])).toBe(real);
  });

  it("returns null when every line is scrolled past", () => {
    expect(findTopmostVisible([para("gone", -500), para("also gone", -300)])).toBeNull();
    expect(findTopmostVisible([])).toBeNull();
  });
});

describe("anchorFor", () => {
  it("stores the head of the line", () => {
    expect(anchorFor("  Krishna speaks to Arjuna  ")).toBe("Krishna speaks to Arjuna");
  });

  it("caps what it stores", () => {
    const long = "x".repeat(500);
    expect(anchorFor(long)?.length).toBe(ANCHOR_CHARS);
  });

  it("stores nothing for an empty line", () => {
    expect(anchorFor("")).toBeNull();
    expect(anchorFor("    ")).toBeNull();
    expect(anchorFor(null)).toBeNull();
    expect(anchorFor(undefined)).toBeNull();
  });
});

describe("anchorMatches", () => {
  const anchor = "Now I am Your disciple, and a soul surrendered unto You. Please instruct me.";

  it("matches the line it was taken from", () => {
    expect(anchorMatches(anchor, anchor)).toBe(true);
  });

  it("matches after the line was re-wrapped or extended", () => {
    expect(anchorMatches(`${anchor} What is my duty?`, anchor)).toBe(true);
  });

  it("matches when the line gained a leading marker", () => {
    expect(anchorMatches(`2.7 ${anchor}`, anchor)).toBe(true);
  });

  it("does not match a different line", () => {
    expect(anchorMatches("The imperishable banyan tree has its roots upward", anchor)).toBe(false);
  });

  it("refuses an anchor too short to identify anything", () => {
    expect(anchorMatches("Now I am Your disciple", "Now")).toBe(false);
    expect(anchorMatches("anything", "")).toBe(false);
    expect(anchorMatches("anything", null)).toBe(false);
  });

  it("an empty paragraph matches nothing", () => {
    expect(anchorMatches("", anchor)).toBe(false);
    expect(anchorMatches(null, anchor)).toBe(false);
  });
});

describe("findAnchoredParagraph", () => {
  it("returns the paragraph the bookmark was saved on", () => {
    const anchor = "Krishna reveals his universal form to Arjuna on the plain";
    const target = { textContent: `${anchor} at dawn` };
    const found = findAnchoredParagraph([{ textContent: "something else entirely here" }, target], anchor);
    expect(found).toBe(target);
  });

  it("returns null when the line is no longer on the page", () => {
    expect(findAnchoredParagraph([{ textContent: "other" }], "a line that is gone from this page")).toBeNull();
    expect(findAnchoredParagraph([], "anything at all here")).toBeNull();
  });
});
