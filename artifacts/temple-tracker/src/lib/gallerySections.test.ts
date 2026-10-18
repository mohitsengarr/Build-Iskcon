import { describe, expect, it } from "vitest";
import { BOOK_SECTIONS, GITA_SECTION, gitaCardDescription, sectionBadge } from "./gallerySections";

describe("BOOK_SECTIONS", () => {
  it("names the Gita and the three parts of the Chaitanya Charitamrita", () => {
    expect(BOOK_SECTIONS[GITA_SECTION].name).toBe("Bhagavad-gita");
    expect([21, 22, 23].map((s) => BOOK_SECTIONS[s].name.split("—")[0].trim())).toEqual([
      "Chaitanya Charitamrita", "Chaitanya Charitamrita", "Chaitanya Charitamrita",
    ]);
  });

  it("keeps the Gita clear of the twelve cantos and the Chaitanya parts", () => {
    expect(GITA_SECTION).toBeGreaterThan(23);
  });
});

describe("sectionBadge", () => {
  it("shows a canto's number", () => {
    expect(sectionBadge(1)).toBe("1");
    expect(sectionBadge(12)).toBe("12");
  });

  it("shows a book's initials instead of a made-up canto number", () => {
    expect(sectionBadge(GITA_SECTION)).toBe("BG");
    expect(sectionBadge(22)).toBe("CC");
  });

  it("shows a dash for the general section", () => {
    expect(sectionBadge(0)).toBe("–");
  });
});

describe("gitaCardDescription", () => {
  it("prefers the scene's title", () => {
    expect(gitaCardDescription({ scene_title: "Arjuna sees the armies", caption: "A caption", chapter_title: "Ch 1" })).toBe("Arjuna sees the armies");
  });

  it("falls back to the caption's first line that is not hashtags", () => {
    expect(gitaCardDescription({ caption: "\n#Gita #Krishna\nWhen duty calls, Krishna answers.\nMore", chapter_title: "Ch 2" })).toBe("When duty calls, Krishna answers.");
  });

  it("falls back to the chapter title, and copes with nothing at all", () => {
    expect(gitaCardDescription({ caption: "#only #tags", chapter_title: "Observing the Armies" })).toBe("Observing the Armies");
    expect(gitaCardDescription({})).toBe("");
  });

  it("keeps a card's line short", () => {
    expect(gitaCardDescription({ scene_title: "x".repeat(300) })).toHaveLength(200);
  });
});
