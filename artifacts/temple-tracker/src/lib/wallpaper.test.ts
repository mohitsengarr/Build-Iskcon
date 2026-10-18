import { describe, expect, it } from "vitest";
import {
  SLOT_MS, cleanQuote, coverCrop, coverPosition, fitText, msUntilNextSlot, pickForSlot, slotAt, slotProgress,
  wallpaperHead, wallpaperQuotes, wrapLines,
} from "./wallpaper";

const T0 = Date.UTC(2026, 9, 18, 10, 0, 0); // a slot boundary: 10:00 UTC

describe("the 15-minute clock", () => {
  it("gives every moment inside one quarter-hour the same slot", () => {
    expect(slotAt(T0)).toBe(slotAt(T0 + SLOT_MS - 1));
  });

  it("moves to the next slot exactly on the quarter-hour", () => {
    expect(slotAt(T0 + SLOT_MS)).toBe(slotAt(T0) + 1);
  });

  it("counts down to the next quarter-hour", () => {
    expect(msUntilNextSlot(T0 + 60_000)).toBe(14 * 60_000);
  });

  it("waits a whole slot, never zero, at the very start of one", () => {
    expect(msUntilNextSlot(T0)).toBe(SLOT_MS);
  });

  it("reports how far through the slot it is", () => {
    expect(slotProgress(T0)).toBe(0);
    expect(slotProgress(T0 + SLOT_MS / 2)).toBeCloseTo(0.5, 10);
  });

  it("is the same on every device, being counted from the epoch, not the page load", () => {
    expect(slotAt(T0)).toBe(T0 / SLOT_MS);
  });
});

describe("pickForSlot", () => {
  const items = ["a", "b", "c"];

  it("walks the list in order", () => {
    expect([30, 31, 32].map((s) => pickForSlot(items, s))).toEqual(["a", "b", "c"]);
  });

  it("wraps round at the end", () => {
    expect(pickForSlot(items, 33)).toBe("a");
  });

  it("copes with a slot before the epoch", () => {
    expect(pickForSlot(items, -1)).toBe("c");
  });

  it("returns nothing from an empty list", () => {
    expect(pickForSlot([], 5)).toBeUndefined();
  });
});

describe("cleanQuote", () => {
  it("keeps the verse and takes the speaker from the attribution line", () => {
    const q = cleanQuote({ chapter: 2, verse: 47, text: "You have a right to your work alone.\n\n— Krishna" });
    expect(q).toEqual({ chapter: 2, verse: 47, text: "You have a right to your work alone.", speaker: "Krishna" });
  });

  it("drops the app line some days' posts carried after the attribution", () => {
    const q = cleanQuote({
      chapter: 3, verse: 8,
      text: "Do your prescribed duty.\n\n— Krishna\n\nBhaktigram — darshan, japa & Bhagavatam. Free on Android:\nhttps://play.google.com/store/apps/details?id=com.buildiskcon.bhaktigram",
    });
    expect(q.text).toBe("Do your prescribed duty.");
    expect(q.text).not.toContain("play.google.com");
  });

  it("keeps a dash inside the verse itself", () => {
    const q = cleanQuote({ chapter: 2, verse: 56, text: "Free from fear, anger and attachment—such a person is wise.\n\n— Krishna" });
    expect(q.text).toBe("Free from fear, anger and attachment—such a person is wise.");
  });

  it("assumes Krishna when there is no attribution", () => {
    expect(cleanQuote({ chapter: 4, verse: 7, text: "Whenever dharma declines…" }).speaker).toBe("Krishna");
  });

  it("joins a verse broken over lines into one", () => {
    expect(cleanQuote({ chapter: 1, verse: 1, text: "line one\nline two\n\n— Krishna" }).text).toBe("line one line two");
  });
});

describe("wallpaperQuotes", () => {
  it("orders the verses as the Gita does", () => {
    const qs = wallpaperQuotes([
      { id: 3, chapter: 3, verse: 8, text: "c\n\n— Krishna" },
      { id: 1, chapter: 2, verse: 47, text: "a\n\n— Krishna" },
      { id: 2, chapter: 2, verse: 14, text: "b\n\n— Krishna" },
    ]);
    expect(qs.map((q) => `${q.chapter}.${q.verse}`)).toEqual(["2.14", "2.47", "3.8"]);
  });

  it("keeps one wording per verse, the most recently logged", () => {
    const qs = wallpaperQuotes([
      { id: 1, chapter: 2, verse: 47, text: "old wording\n\n— Krishna" },
      { id: 9, chapter: 2, verse: 47, text: "new wording\n\n— Krishna" },
    ]);
    expect(qs).toHaveLength(1);
    expect(qs[0].text).toBe("new wording");
  });

  it("skips empty rows", () => {
    expect(wallpaperQuotes([{ id: 1, chapter: 2, verse: 1, text: "  " }])).toEqual([]);
  });
});

describe("wrapLines", () => {
  const measure = (s: string) => s.length; // one unit per character

  it("breaks between words to fit the width", () => {
    expect(wrapLines("the quick brown fox", 10, measure)).toEqual(["the quick", "brown fox"]);
  });

  it("puts a word longer than the width on a line of its own rather than losing it", () => {
    expect(wrapLines("a extraordinarily b", 5, measure)).toEqual(["a", "extraordinarily", "b"]);
  });

  it("returns no lines for no text", () => {
    expect(wrapLines("   ", 10, measure)).toEqual([]);
  });
});

describe("coverCrop", () => {
  it("takes a full-height strip from a landscape painting for a portrait phone", () => {
    const c = coverCrop(1344, 1088, 9 / 16, 0.5);
    expect(c.sh).toBe(1088);
    expect(c.sw).toBeCloseTo(1088 * (9 / 16), 6);
    expect(c.sx + c.sw / 2).toBeCloseTo(672, 6);
  });

  it("centres the strip on the focus", () => {
    const c = coverCrop(1344, 1088, 9 / 16, 0.3);
    expect(c.sx + c.sw / 2).toBeCloseTo(0.3 * 1344, 6);
  });

  it("stops at the edge rather than cropping past it", () => {
    expect(coverCrop(1344, 1088, 9 / 16, 0).sx).toBe(0);
    const right = coverCrop(1344, 1088, 9 / 16, 1);
    expect(right.sx + right.sw).toBeCloseTo(1344, 6);
  });

  it("takes a full-width band when the target is wider than the painting", () => {
    const c = coverCrop(1088, 1344, 16 / 9);
    expect(c.sw).toBe(1088);
    expect(c.sy).toBeCloseTo((1344 - 1088 / (16 / 9)) / 2, 6);
  });
});

describe("wallpaperHead", () => {
  const html = `<!DOCTYPE html><html><head>
    <title>Track ISKCON Temple Construction | Build Iskcon</title>
    <meta name="description" content="Track temples" />
    <meta name="keywords" content="ISKCON" />
    <meta property="og:site_name" content="Build Iskcon" />
    <meta property="og:title" content="Build Iskcon" />
    <meta property="og:description" content="Track temples" />
    <meta property="og:image" content="https://buildiskcon.com/opengraph.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:title" content="Build Iskcon" />
    <meta name="twitter:description" content="Track temples" />
    <meta name="twitter:image" content="https://buildiskcon.com/opengraph.jpg" />
  </head><body><div id="root"></div><script type="module" src="/assets/index-abc.js"></script></body></html>`;
  const out = wallpaperHead(html, {
    title: "Krishna Wallpaper — Bhagwatham",
    description: "A painting of Krishna & a verse of the Gita",
    image: "https://example.com/k.jpg",
    imageSize: [1344, 1088],
    url: "https://wall.bhagwatham.com/",
    siteName: "Bhagwatham",
    keywords: "Krishna wallpaper",
  });

  it("retitles the page", () => {
    expect(out).toContain("<title>Krishna Wallpaper — Bhagwatham</title>");
    expect(out).not.toContain("Build Iskcon</title>");
  });

  it("rewrites the link preview to the wallpaper's own image and words", () => {
    expect(out).toContain('<meta property="og:image" content="https://example.com/k.jpg" />');
    expect(out).toContain('<meta property="og:image:width" content="1344" />');
    expect(out).toContain('<meta property="og:site_name" content="Bhagwatham" />');
    expect(out).toContain('<meta name="twitter:image" content="https://example.com/k.jpg" />');
    expect(out).not.toContain("opengraph.jpg");
  });

  it("escapes what it writes into attributes", () => {
    expect(out).toContain('content="A painting of Krishna &amp; a verse of the Gita"');
  });

  it("adds the address and canonical link the app's page lacks", () => {
    expect(out).toContain('<meta property="og:url" content="https://wall.bhagwatham.com/" />');
    expect(out).toContain('<link rel="canonical" href="https://wall.bhagwatham.com/" />');
  });

  it("leaves the app's own script tag alone, so the page still runs", () => {
    expect(out).toContain('<script type="module" src="/assets/index-abc.js"></script>');
  });
});

describe("fitText", () => {
  // Every character is as wide as the font size, which keeps the sums plain.
  const measureAt = (size: number, s: string) => s.length * size;
  const verse = "one two three four five six seven eight nine ten";

  it("uses the largest size at which the verse fits", () => {
    const fit = fitText(verse, { maxWidth: 400, maxHeight: 200, sizes: [40, 20, 10], lineHeight: 1.4, measureAt });
    expect(fit.size).toBe(20);
    expect(fit.lines.length * 20 * 1.4).toBeLessThanOrEqual(200);
  });

  it("keeps the largest size for a short verse", () => {
    expect(fitText("one two", { maxWidth: 400, maxHeight: 200, sizes: [10, 40], lineHeight: 1.4, measureAt }).size).toBe(40);
  });

  it("falls back to the smallest size when nothing fits, rather than dropping words", () => {
    const fit = fitText(verse, { maxWidth: 100, maxHeight: 10, sizes: [40, 20], lineHeight: 1.4, measureAt });
    expect(fit.size).toBe(20);
    expect(fit.lines.join(" ")).toBe(verse);
  });
});

describe("coverPosition", () => {
  const painting = 1344 / 1088;
  const phone = 375 / 812;

  it("centres the focus on a phone when there is room to", () => {
    const p = coverPosition(0.42, 0.3, painting, phone);
    expect(p.originX).toBeCloseTo(0.5, 10);
  });

  it("is not simply the focus as a percentage", () => {
    // The trap it exists for: 30% would leave a face at 30% across the screen.
    expect(coverPosition(0.3, 0.3, painting, phone).x).not.toBeCloseTo(0.3, 2);
  });

  it("stops at the edge of the painting rather than showing past it", () => {
    const p = coverPosition(0.02, 0.3, painting, phone);
    expect(p.x).toBe(0);
    expect(p.originX).toBeLessThan(0.5);
  });

  it("leaves a centred focus at 50%", () => {
    expect(coverPosition(0.5, 0.5, painting, phone).x).toBeCloseTo(0.5, 10);
  });

  it("crops height, not width, on a wide screen, keeping the faces near the top", () => {
    const p = coverPosition(0.42, 0.3, painting, 16 / 9);
    expect(p.x).toBe(0.5);       // nothing to move across: the width all fits
    // A face 30% down cannot be centred without showing past the top edge,
    // so the top is kept and the face sits in the upper half of the screen.
    expect(p.y).toBe(0);
    expect(p.originY).toBeGreaterThan(0.3);
    expect(p.originY).toBeLessThan(0.5);
  });

  it("needs no moving at all when the box has the painting's own shape", () => {
    const p = coverPosition(0.2, 0.8, painting, painting);
    expect([p.x, p.y]).toEqual([0.5, 0.5]);
    expect([p.originX, p.originY]).toEqual([0.2, 0.8]);
  });
});
