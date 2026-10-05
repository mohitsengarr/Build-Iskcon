import { describe, expect, it } from "vitest";
import {
  COLUMN_GAP_PX, ONE_COLUMN_MAX_WIDTH, PAGE_TOP_TOLERANCE_PX, POSITION_ANCHOR_CHARS, SWIPE_MAX_MS, SWIPE_MIN_PX,
  TAP_MAX_MS, TAP_MAX_MOVE_PX, TWO_COLUMN_FLOOR_WIDTH, TWO_COLUMN_MAX_WIDTH, TWO_COLUMN_MIN_WIDTH,
  anchorIndex, chapterForPage, chapterLeftLabel, clampScreen, columnCount, columnOfOffset, columnsPerScreen,
  isTap, kindleKeyAction, nextColumnPreference, pageArea, pageAtScreen, pageGeometry, pagesLeftInChapter,
  parseColumnPreference, parseKindleMode, parseStoredPosition, percentRead, progressLabel,
  screenAfterForeignScroll, screenCount, screenOfColumn, screenOffsetPx, serialisePosition, swipeDirection,
  tapZone, turn,
  type PageStart,
  kindleModeKey,
  kindlePositionKey,
  KINDLE_MODE_KEY,
  KINDLE_POSITION_KEY,
  KINDLE_COLUMNS_KEY,
  IDLE_BEFORE_CHROME_HIDES_MS,
  shouldHideChrome,
  minutesLeftLabel,
  READING_WORDS_PER_MINUTE,} from "./kindlePaging";

// Kindle mode reads the book a screen at a time. The browser lays the text out
// in columns; these are the sums around that layout.

describe("shouldHideChrome", () => {
  it("fades the bars once the reader has been still", () => {
    expect(shouldHideChrome({ idleMs: IDLE_BEFORE_CHROME_HIDES_MS })).toBe(true);
    expect(shouldHideChrome({ idleMs: IDLE_BEFORE_CHROME_HIDES_MS + 5000 })).toBe(true);
  });

  it("keeps them while the reader is still doing something", () => {
    expect(shouldHideChrome({ idleMs: 0 })).toBe(false);
    expect(shouldHideChrome({ idleMs: IDLE_BEFORE_CHROME_HIDES_MS - 1 })).toBe(false);
  });

  it("never fades them out from under an open menu", () => {
    expect(shouldHideChrome({ idleMs: 60_000, menuOpen: true })).toBe(false);
  });

  it("never fades them while the reader is selecting words", () => {
    expect(shouldHideChrome({ idleMs: 60_000, selecting: true })).toBe(false);
  });

  it("keeps them when the reader asked for them", () => {
    expect(shouldHideChrome({ idleMs: 60_000, pinned: true })).toBe(false);
  });

  it("survives rubbish state", () => {
    expect(shouldHideChrome(undefined as unknown as { idleMs: number })).toBe(false);
  });
});

describe("minutesLeftLabel", () => {
  it("turns the words left into a reading time", () => {
    expect(minutesLeftLabel(READING_WORDS_PER_MINUTE * 4)).toBe("~4 min left in chapter");
    expect(minutesLeftLabel(READING_WORDS_PER_MINUTE)).toBe("~1 min left in chapter");
  });

  it("says plainly when there is less than a minute", () => {
    expect(minutesLeftLabel(20)).toBe("under a minute left in chapter");
  });

  it("says nothing when there is nothing to say", () => {
    for (const n of [0, -5, null, undefined, Number.NaN]) expect(minutesLeftLabel(n as number)).toBe("");
  });

  it("takes a different reading speed", () => {
    expect(minutesLeftLabel(600, 300)).toBe("~2 min left in chapter");
    expect(minutesLeftLabel(600, 0)).toBe("");
  });
});

describe("per-book storage keys", () => {
  it("gives each book its own mode and place", () => {
    expect(kindleModeKey("gita")).toBe("gita_kindle_mode");
    expect(kindlePositionKey("gita")).toBe("gita_kindle_position");
    expect(kindleModeKey("chaitanya")).toBe("chaitanya_kindle_mode");
    expect(kindlePositionKey("chaitanya")).toBe("chaitanya_kindle_position");
  });

  it("keeps the Bhagavatam's original spelling, so its readers keep the mode they had on", () => {
    expect(kindleModeKey("bhagavatam")).toBe("bhagwatham_kindle_mode");
    expect(kindlePositionKey("bhagavatam")).toBe("bhagwatham_kindle_position");
    expect(KINDLE_MODE_KEY).toBe("bhagwatham_kindle_mode");
    expect(KINDLE_POSITION_KEY).toBe("bhagwatham_kindle_position");
  });

  it("never returns a bare key for a missing book", () => {
    expect(kindleModeKey("")).toBe("reader_kindle_mode");
    expect(kindlePositionKey(undefined as unknown as string)).toBe("reader_kindle_position");
  });

  it("keeps one column choice for every book: it is a display preference", () => {
    expect(KINDLE_COLUMNS_KEY).toBe("bhagwatham_kindle_columns");
  });
});

describe("what the reader chose, as stored in the browser", () => {
  it("Kindle mode is on only for the stored \"1\"", () => {
    expect(parseKindleMode("1")).toBe(true);
    for (const raw of ["0", "", "true", "on", null, undefined, 1, true]) {
      expect(parseKindleMode(raw), String(raw)).toBe(false);
    }
  });

  it("reads a stored column choice, and falls back to automatic", () => {
    expect(parseColumnPreference("one")).toBe("one");
    expect(parseColumnPreference("two")).toBe("two");
    expect(parseColumnPreference("auto")).toBe("auto");
    for (const raw of [null, undefined, "", "three", "ONE", 2]) {
      expect(parseColumnPreference(raw), String(raw)).toBe("auto");
    }
  });

  it("the layout button goes round: automatic, one, two, automatic", () => {
    expect(nextColumnPreference("auto")).toBe("one");
    expect(nextColumnPreference("one")).toBe("two");
    expect(nextColumnPreference("two")).toBe("auto");
  });

  it("stores the page and the line at the top of the screen, and reads them back", () => {
    const raw = serialisePosition(5210, "सत्त्वं रजस्तम इति प्रकृतेर्नात्मनो गुणाः ।");
    expect(parseStoredPosition(raw)).toEqual({ page: 5210, anchor: "सत्त्वं रजस्तम इति प्रकृतेर्नात्मनो गुणाः ।" });
  });

  it("stores only the head of a long line", () => {
    const long = "क".repeat(300);
    const stored = parseStoredPosition(serialisePosition(12, long));
    expect(stored?.anchor).toHaveLength(POSITION_ANCHOR_CHARS);
  });

  it("a page without a line is stored with no line", () => {
    expect(parseStoredPosition(serialisePosition(7))).toEqual({ page: 7, anchor: null });
    expect(parseStoredPosition(serialisePosition(7, "   "))).toEqual({ page: 7, anchor: null });
    expect(parseStoredPosition(serialisePosition(7, null))).toEqual({ page: 7, anchor: null });
  });

  it("refuses anything that is not a stored place (negative case)", () => {
    for (const raw of [null, undefined, "", "not json", "{}", "[]", "null", '{"page":0}', '{"page":-3}', '{"page":2.5}', '{"page":"12"}', 12]) {
      expect(parseStoredPosition(raw), String(raw)).toBeNull();
    }
  });

  it("a stored line that is not text is dropped, the page kept", () => {
    expect(parseStoredPosition('{"page":40,"anchor":17}')).toEqual({ page: 40, anchor: null });
  });
});

describe("columnsPerScreen", () => {
  it("automatic: two columns on a wide page, one on a narrow one", () => {
    expect(columnsPerScreen("auto", 1152)).toBe(2);
    expect(columnsPerScreen("auto", 700)).toBe(1);
  });

  it("automatic switches exactly at the two-column width (boundary)", () => {
    expect(columnsPerScreen("auto", TWO_COLUMN_MIN_WIDTH)).toBe(2);
    expect(columnsPerScreen("auto", TWO_COLUMN_MIN_WIDTH - 1)).toBe(1);
  });

  it("follows an explicit choice", () => {
    expect(columnsPerScreen("one", 1600)).toBe(1);
    expect(columnsPerScreen("two", 700)).toBe(2);
  });

  it("never sets two columns on a page too narrow to read them, whatever was chosen (boundary)", () => {
    expect(columnsPerScreen("two", TWO_COLUMN_FLOOR_WIDTH)).toBe(2);
    expect(columnsPerScreen("two", TWO_COLUMN_FLOOR_WIDTH - 1)).toBe(1);
    expect(columnsPerScreen("two", 339)).toBe(1);
  });

  it("a width that is not a number is one column (negative case)", () => {
    expect(columnsPerScreen("two", NaN)).toBe(1);
    expect(columnsPerScreen("auto", 0)).toBe(1);
  });
});

describe("pageGeometry", () => {
  it("two columns share the width less the gap, in whole pixels", () => {
    const g = pageGeometry(1152, "two");
    expect(g).toEqual({ perScreen: 2, width: 1152, columnWidth: 548, gap: COLUMN_GAP_PX, columnStride: 604, screenStride: 1208 });
  });

  it("gives up a pixel rather than leave half-pixel columns", () => {
    const g = pageGeometry(1153, "two");
    expect(g.width).toBe(1152);
    expect(Number.isInteger(g.columnWidth)).toBe(true);
  });

  it("one column is the whole width, and a turn moves it by the width plus the gap", () => {
    const g = pageGeometry(339, "auto");
    expect(g).toEqual({ perScreen: 1, width: 339, columnWidth: 339, gap: COLUMN_GAP_PX, columnStride: 395, screenStride: 395 });
  });

  it("rounds a fractional width down", () => {
    expect(pageGeometry(700.9, "one").width).toBe(700);
  });

  it("a turn always moves by the text width plus one gap, so the next screen never shows", () => {
    for (const width of [339, 760, 901, 1152, 1240]) {
      for (const pref of ["one", "two", "auto"] as const) {
        const g = pageGeometry(width, pref);
        expect(g.screenStride, `${width} ${pref}`).toBe(g.width + g.gap);
      }
    }
  });

  it("no width is an empty page, not a crash (negative case)", () => {
    for (const width of [0, -20, NaN, Infinity]) {
      const g = pageGeometry(width, "auto");
      expect(g.width, String(width)).toBe(0);
      expect(g.perScreen).toBe(1);
    }
  });
});

describe("pageArea", () => {
  it("a desktop window gets wide margins and a two-column spread", () => {
    const a = pageArea(1280, 711, "auto");
    expect(a.geometry.perScreen).toBe(2);
    expect(a.geometry.width).toBe(1152);
    expect(a.left).toBe(64);
    expect(a.top).toBe(28);
    expect(a.height).toBe(655);
  });

  it("a phone gets narrow margins and one column", () => {
    const a = pageArea(375, 723, "auto");
    expect(a.geometry.perScreen).toBe(1);
    expect(a.geometry.width).toBe(339);
    expect(a.left).toBe(18);
    expect(a.height).toBe(699);
  });

  it("caps a single column so lines stay readable, and centres it", () => {
    const a = pageArea(1280, 711, "one");
    expect(a.geometry.width).toBe(ONE_COLUMN_MAX_WIDTH);
    expect(a.left).toBe((1280 - ONE_COLUMN_MAX_WIDTH) / 2);
  });

  it("caps a two-column spread on a very wide window, and centres it", () => {
    const a = pageArea(2560, 1200, "auto");
    expect(a.geometry.width).toBe(TWO_COLUMN_MAX_WIDTH);
    expect(a.left).toBe((2560 - TWO_COLUMN_MAX_WIDTH) / 2);
  });

  it("a space with no size is an empty page (negative case)", () => {
    const a = pageArea(0, 0, "auto");
    expect(a.geometry.width).toBe(0);
    expect(a.height).toBe(0);
    expect(pageArea(NaN, NaN, "two").height).toBe(0);
  });
});

describe("columns and screens", () => {
  const two = pageGeometry(1152, "two");
  const one = pageGeometry(339, "one");

  it("counts the columns the text fills from the laid-out width", () => {
    // 24 columns of 548 with 23 gaps of 56
    expect(columnCount(24 * 548 + 23 * 56, two)).toBe(24);
    expect(columnCount(7 * 339 + 6 * 56, one)).toBe(7);
  });

  it("text that fits the page is still one column (boundary)", () => {
    expect(columnCount(548, two)).toBe(1);
    expect(columnCount(0, two)).toBe(1);
  });

  it("an odd number of columns still makes a last, half-filled screen", () => {
    expect(screenCount(24, 2)).toBe(12);
    expect(screenCount(25, 2)).toBe(13);
    expect(screenCount(7, 1)).toBe(7);
  });

  it("there is always at least one screen (negative case)", () => {
    expect(screenCount(0, 2)).toBe(1);
    expect(screenCount(-4, 2)).toBe(1);
    expect(screenCount(5, 0)).toBe(1);
  });

  it("keeps a screen number on the book", () => {
    expect(clampScreen(5, 12)).toBe(5);
    expect(clampScreen(-1, 12)).toBe(0);
    expect(clampScreen(12, 12)).toBe(11);
    expect(clampScreen(99, 12)).toBe(11);
    expect(clampScreen(NaN, 12)).toBe(0);
    expect(clampScreen(3, 0)).toBe(0);
  });

  it("finds the column an element is in from its left edge", () => {
    expect(columnOfOffset(0, two)).toBe(0);
    expect(columnOfOffset(604, two)).toBe(1);
    expect(columnOfOffset(1208, two)).toBe(2);
  });

  it("an indented element is still in its own column (boundary)", () => {
    expect(columnOfOffset(604 + 16, two)).toBe(1);
    expect(columnOfOffset(604 + 547, two)).toBe(1);
    // a hair left of the column edge, from sub-pixel rounding
    expect(columnOfOffset(603.6, two)).toBe(1);
  });

  it("a position that cannot be is the first column (negative case)", () => {
    expect(columnOfOffset(-300, two)).toBe(0);
    expect(columnOfOffset(NaN, two)).toBe(0);
  });

  it("puts two columns on each screen of a spread, one on each screen of a single column", () => {
    expect([0, 1, 2, 3, 4].map(c => screenOfColumn(c, 2))).toEqual([0, 0, 1, 1, 2]);
    expect([0, 1, 2].map(c => screenOfColumn(c, 1))).toEqual([0, 1, 2]);
    expect(screenOfColumn(-1, 2)).toBe(0);
  });

  it("slides the text one text-width-plus-gap per screen", () => {
    expect(screenOffsetPx(0, two)).toBe(0);
    expect(screenOffsetPx(1, two)).toBe(1208);
    expect(screenOffsetPx(6, one)).toBe(2370);
    expect(screenOffsetPx(-2, two)).toBe(0);
  });
});

describe("screenAfterForeignScroll", () => {
  const g = pageGeometry(1152, "two");

  it("stays on a screen it is already exactly on", () => {
    expect(screenAfterForeignScroll(2416, 1208, g, 12)).toBe(2);
    expect(screenAfterForeignScroll(2416.4, 1208, g, 12)).toBe(2);
  });

  it("going forward, settles on the later screen: what was searched for is at the right edge", () => {
    expect(screenAfterForeignScroll(1500, 1208, g, 12)).toBe(2);
  });

  it("going back, settles on the earlier screen: what was searched for is at the left edge", () => {
    expect(screenAfterForeignScroll(1500, 2416, g, 12)).toBe(1);
  });

  it("never leaves the book (boundary)", () => {
    expect(screenAfterForeignScroll(99999, 0, g, 12)).toBe(11);
    expect(screenAfterForeignScroll(-50, 1208, g, 12)).toBe(0);
  });

  it("an unreadable position is the first screen (negative case)", () => {
    expect(screenAfterForeignScroll(NaN, 0, g, 12)).toBe(0);
  });
});

describe("anchorIndex — the line that marks the reader's place", () => {
  // Blocks in reading order, each with the column it starts in.
  const columns = [0, 0, 1, 2, 2, 3, 5];

  it("is the first block that starts on the screen", () => {
    expect(anchorIndex(columns, 1, 2)).toBe(3);
    expect(anchorIndex(columns, 0, 2)).toBe(0);
  });

  it("when one long paragraph fills the screen, is the paragraph it is in the middle of", () => {
    // Screen 2 of a single-column layout shows column 4; nothing starts there.
    expect(anchorIndex(columns, 4, 1)).toBe(5);
  });

  it("skips blocks that are not laid out", () => {
    expect(anchorIndex([null, null, 2, 3], 1, 2)).toBe(2);
  });

  it("past the last block, is the last block (boundary)", () => {
    expect(anchorIndex(columns, 9, 2)).toBe(6);
  });

  it("with no blocks there is no line (negative case)", () => {
    expect(anchorIndex([], 0, 2)).toBe(-1);
    expect(anchorIndex([null, null], 0, 2)).toBe(-1);
  });
});

describe("turn", () => {
  it("moves one screen forward or back inside the loaded pages", () => {
    expect(turn(1, 3, 12, true, true)).toEqual({ kind: "screen", screen: 4 });
    expect(turn(-1, 3, 12, true, true)).toEqual({ kind: "screen", screen: 2 });
  });

  it("past the last screen, asks for the next set of pages (boundary)", () => {
    expect(turn(1, 11, 12, true, true)).toEqual({ kind: "next-view" });
  });

  it("before the first screen, asks for the previous set of pages (boundary)", () => {
    expect(turn(-1, 0, 12, true, true)).toEqual({ kind: "prev-view" });
  });

  it("does nothing at the very start and the very end of the book (negative case)", () => {
    expect(turn(-1, 0, 12, false, true)).toEqual({ kind: "edge" });
    expect(turn(1, 11, 12, true, false)).toEqual({ kind: "edge" });
  });

  it("a set of pages that fits one screen turns straight to the next set", () => {
    expect(turn(1, 0, 1, false, true)).toEqual({ kind: "next-view" });
  });
});

describe("pageAtScreen — the printed page at the top of a screen", () => {
  // Page 2 runs over columns 0-2; page 4 starts part-way down column 2, page 5 part-way down column 3.
  const starts: PageStart[] = [
    { pageNumber: 2, column: 0, top: 0 },
    { pageNumber: 4, column: 2, top: 126 },
    { pageNumber: 5, column: 3, top: 211 },
    { pageNumber: 6, column: 4, top: 0 },
  ];

  it("is the first page on the first screen", () => {
    expect(pageAtScreen(starts, 0, 2)).toBe(2);
  });

  it("a page that begins part-way down the screen is not it yet", () => {
    // Screen 1 shows columns 2-3: its top is still the end of page 2.
    expect(pageAtScreen(starts, 1, 2)).toBe(2);
  });

  it("a page that begins at the very top of the screen is it", () => {
    expect(pageAtScreen(starts, 2, 2)).toBe(6);
  });

  it("with one column, a page that began in an earlier column is it", () => {
    expect(pageAtScreen(starts, 3, 1)).toBe(4);
    expect(pageAtScreen(starts, 4, 1)).toBe(6);
  });

  it("counts a page as starting at the top within a few pixels (boundary)", () => {
    const near: PageStart[] = [{ pageNumber: 9, column: 0, top: 0 }, { pageNumber: 10, column: 2, top: PAGE_TOP_TOLERANCE_PX }];
    const below: PageStart[] = [{ pageNumber: 9, column: 0, top: 0 }, { pageNumber: 10, column: 2, top: PAGE_TOP_TOLERANCE_PX + 1 }];
    expect(pageAtScreen(near, 1, 2)).toBe(10);
    expect(pageAtScreen(below, 1, 2)).toBe(9);
  });

  it("before anything is measured there is no page (negative case)", () => {
    expect(pageAtScreen([], 0, 2)).toBeNull();
  });

  it("falls back to the first page when the first one starts below the top", () => {
    expect(pageAtScreen([{ pageNumber: 30, column: 0, top: 40 }], 0, 2)).toBe(30);
  });
});

describe("the progress line", () => {
  it("is a whole percentage of the pages read", () => {
    expect(percentRead(5209, 10419)).toBe(50);
    expect(percentRead(20, 1239)).toBe(1);
  });

  it("is 0% at the start and 100% only on the last page (boundary)", () => {
    expect(percentRead(0, 10419)).toBe(0);
    expect(percentRead(10417, 10419)).toBe(99);
    expect(percentRead(10418, 10419)).toBe(100);
  });

  it("is 0% when there is nothing to measure against (negative case)", () => {
    expect(percentRead(3, 0)).toBe(0);
    expect(percentRead(-1, 100)).toBe(0);
    expect(percentRead(NaN, 100)).toBe(0);
  });

  it("reads like the line on a Kindle", () => {
    expect(progressLabel(21, 1239, 1)).toBe("Page 21 of 1239 • 1%");
    expect(progressLabel(5210, 10419, 49)).toBe("Page 5210 of 10419 • 49%");
  });

  it("says nothing until there is a page to name (negative case)", () => {
    expect(progressLabel(null, 10419, 0)).toBe("");
    expect(progressLabel(0, 10419, 0)).toBe("");
    expect(progressLabel(12, 0, 0)).toBe("");
  });
});

describe("chapters", () => {
  const chapters = [
    { pageNumber: 2, title: "one" },
    { pageNumber: 44, title: "two" },
    { pageNumber: 90, title: "three" },
  ];

  it("finds the chapter a page is in", () => {
    expect(chapterForPage(chapters, 2)?.title).toBe("one");
    expect(chapterForPage(chapters, 43)?.title).toBe("one");
    expect(chapterForPage(chapters, 44)?.title).toBe("two");
    expect(chapterForPage(chapters, 5000)?.title).toBe("three");
  });

  it("a page before the first chapter is in none (negative case)", () => {
    expect(chapterForPage(chapters, 1)).toBeNull();
    expect(chapterForPage(chapters, null)).toBeNull();
    expect(chapterForPage([], 10)).toBeNull();
  });

  it("does not depend on the order the chapters are listed in", () => {
    const shuffled = [chapters[2], chapters[0], chapters[1]];
    expect(chapterForPage(shuffled, 50)?.title).toBe("two");
    expect(pagesLeftInChapter(shuffled, 50, 120)).toBe(39);
  });

  it("counts the printed pages left in the chapter", () => {
    expect(pagesLeftInChapter(chapters, 2, 120)).toBe(41);
    expect(pagesLeftInChapter(chapters, 40, 120)).toBe(3);
  });

  it("is zero on the chapter's last page (boundary)", () => {
    expect(pagesLeftInChapter(chapters, 43, 120)).toBe(0);
  });

  it("the last chapter runs to the end of the book", () => {
    expect(pagesLeftInChapter(chapters, 100, 120)).toBe(20);
    expect(pagesLeftInChapter(chapters, 120, 120)).toBe(0);
  });

  it("has nothing to count before the first chapter (negative case)", () => {
    expect(pagesLeftInChapter(chapters, 1, 120)).toBeNull();
    expect(pagesLeftInChapter(chapters, null, 120)).toBeNull();
    expect(pagesLeftInChapter([], 10, 120)).toBeNull();
  });

  it("says how much of the chapter is left in plain words", () => {
    expect(chapterLeftLabel(41)).toBe("41 pages left in chapter");
    expect(chapterLeftLabel(1)).toBe("1 page left in chapter");
    expect(chapterLeftLabel(0)).toBe("Last page of the chapter");
    expect(chapterLeftLabel(null)).toBe("");
  });
});

describe("kindleKeyAction", () => {
  it("turns forward with the right arrow, Page Down and Space", () => {
    for (const key of ["ArrowRight", "PageDown", " ", "Spacebar"]) {
      expect(kindleKeyAction(key), key).toBe("next");
    }
  });

  it("turns back with the left arrow, Page Up and Shift+Space", () => {
    expect(kindleKeyAction("ArrowLeft")).toBe("prev");
    expect(kindleKeyAction("PageUp")).toBe("prev");
    expect(kindleKeyAction(" ", { shift: true })).toBe("prev");
  });

  it("F is full screen", () => {
    expect(kindleKeyAction("f")).toBe("fullscreen");
    expect(kindleKeyAction("F")).toBe("fullscreen");
  });

  it("leaves the browser's own shortcuts alone (negative case)", () => {
    expect(kindleKeyAction("ArrowLeft", { alt: true })).toBeNull(); // Back
    expect(kindleKeyAction("ArrowRight", { meta: true })).toBeNull();
    expect(kindleKeyAction("f", { ctrl: true })).toBeNull(); // Find
    expect(kindleKeyAction("f", { meta: true })).toBeNull();
  });

  it("is not interested in any other key (negative case)", () => {
    for (const key of ["b", "k", "Escape", "/", "Enter", "ArrowUp", "ArrowDown", "Home", "End", ""]) {
      expect(kindleKeyAction(key), key).toBeNull();
    }
  });
});

describe("swipes and taps", () => {
  it("a swipe to the left turns forward, to the right turns back", () => {
    expect(swipeDirection(-180, 10, 200)).toBe(1);
    expect(swipeDirection(180, -5, 200)).toBe(-1);
  });

  it("needs a minimum distance (boundary)", () => {
    expect(swipeDirection(-SWIPE_MIN_PX, 0, 200)).toBe(1);
    expect(swipeDirection(-(SWIPE_MIN_PX - 1), 0, 200)).toBe(0);
  });

  it("a slow drag is not a swipe: that is a text selection (boundary)", () => {
    expect(swipeDirection(-200, 0, SWIPE_MAX_MS)).toBe(1);
    expect(swipeDirection(-200, 0, SWIPE_MAX_MS + 1)).toBe(0);
  });

  it("a mostly vertical movement is not a swipe (negative case)", () => {
    expect(swipeDirection(-60, 220, 200)).toBe(0);
    expect(swipeDirection(5, 220, 200)).toBe(0);
    expect(swipeDirection(-100, 80, 200)).toBe(0);
  });

  it("a tap is short and barely moves", () => {
    expect(isTap(1, 1, 80)).toBe(true);
    expect(isTap(TAP_MAX_MOVE_PX, -TAP_MAX_MOVE_PX, TAP_MAX_MS)).toBe(true);
  });

  it("a long press or a drag is not a tap (negative case)", () => {
    expect(isTap(0, 0, TAP_MAX_MS + 1)).toBe(false);
    expect(isTap(TAP_MAX_MOVE_PX + 1, 0, 80)).toBe(false);
    expect(isTap(0, 40, 80)).toBe(false);
    expect(isTap(0, 0, -5)).toBe(false);
  });

  it("the outer edges of the page turn it; the middle is left for selecting text", () => {
    expect(tapZone(20, 375)).toBe("prev");
    expect(tapZone(350, 375)).toBe("next");
    expect(tapZone(180, 375)).toBe("middle");
  });

  it("the edge zones are the outer 22% on each side (boundary)", () => {
    expect(tapZone(21, 100)).toBe("prev");
    expect(tapZone(22, 100)).toBe("middle");
    expect(tapZone(78, 100)).toBe("middle");
    expect(tapZone(79, 100)).toBe("next");
  });

  it("a tap on a page with no width turns nothing (negative case)", () => {
    expect(tapZone(10, 0)).toBe("middle");
    expect(tapZone(NaN, 375)).toBe("middle");
  });
});
