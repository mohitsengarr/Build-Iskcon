import { describe, expect, it } from "vitest";
import {
  continuesGloss, glossLineDangles, isGlossEntry, isGlossTail,
  MAX_GLOSS_SEPARATOR_OFFSET, MAX_GLOSS_TAIL_CHARS, MAX_GLOSS_TERM_WORDS,
} from "./glossTail";

// The line that actually broke, from Gita page 75
const DANGLING = "एकत्र; धार्तराष्ट्रस्य धृतराष्ट्र के पुत्र की; दुर्बुद्धेः- दुर्बुद्धि; युद्धे- युद्ध में; प्रिय- मंगल, भला; चिकीर्षव:-";
const TAIL = "चाहने वाले |";
const TRANSLATION = "अर्जुन ने कहा - हे अच्युत! कृपा करके मेरा रथ दोनों सेनाओं के बीच में ले चलिए ।";

describe("glossLineDangles", () => {
  it("sees an entry left open by a trailing separator", () => {
    expect(glossLineDangles(DANGLING)).toBe(true);
    expect(glossLineDangles("...; महारथः - ")).toBe(true);
    expect(glossLineDangles("...; वृक—")).toBe(true);
    expect(glossLineDangles("...; उत:")).toBe(true);
  });

  it("does not treat a finished entry as open", () => {
    // A line ending in ";" has closed its entry — what follows is a new one
    expect(glossLineDangles("योत्स्यमानान् युद्ध करने वालों को; अवेक्षे देखूँ;")).toBe(false);
    expect(glossLineDangles("चाहने वाले |")).toBe(false);
    expect(glossLineDangles("")).toBe(false);
    expect(glossLineDangles(null)).toBe(false);
  });
});

describe("isGlossTail", () => {
  it("accepts the short fragment that finishes the entry", () => {
    expect(isGlossTail(TAIL)).toBe(true);
    expect(isGlossTail("महान योद्धा |")).toBe(true);
  });

  it("refuses a line long enough to be prose", () => {
    expect(TRANSLATION.length).toBeGreaterThan(MAX_GLOSS_TAIL_CHARS);
    expect(isGlossTail(TRANSLATION)).toBe(false);
  });

  it("refuses a line that carries entries of its own", () => {
    expect(isGlossTail("अवेक्षे देखूँ; अहम् मैं")).toBe(false);
  });

  it("refuses a section label", () => {
    for (const label of ["अनुवाद", "अनुवाद :", "तात्पर्य", "शब्दार्थ"]) expect(isGlossTail(label)).toBe(false);
  });

  it("refuses nothing at all", () => {
    expect(isGlossTail("")).toBe(false);
    expect(isGlossTail("   ")).toBe(false);
    expect(isGlossTail(undefined)).toBe(false);
  });
});

describe("continuesGloss", () => {
  it("keeps the broken entry with its gloss", () => {
    expect(continuesGloss(DANGLING, TAIL)).toBe(true);
  });

  it("lets the translation start when the gloss closed cleanly", () => {
    const closed = "योत्स्यमानान् युद्ध करने वालों को; अवेक्षे देखूँ;";
    expect(continuesGloss(closed, TRANSLATION)).toBe(false);
    expect(continuesGloss(closed, "हे अच्युत! मेरा रथ ले चलिए ।")).toBe(false);
  });

  it("does not swallow a long paragraph even after a dangling line", () => {
    expect(continuesGloss(DANGLING, TRANSLATION)).toBe(false);
  });

  it("does not swallow the next section's label", () => {
    expect(continuesGloss(DANGLING, "अनुवाद")).toBe(false);
  });
});

describe("isGlossEntry", () => {
  it("recognises the gloss's last entry, which has no semicolon to mark it", () => {
    // CC Adi-lila 1.62, the line the half-shloka rule used to take.
    expect(isGlossEntry("अपि - भी।")).toBe(true);
  });

  it("recognises an entry written with an em dash and no spaces", () => {
    expect(isGlossEntry("उवाच—कहा।")).toBe(true);
  });

  it("recognises a compound term whose separator sits further in", () => {
    expect(isGlossEntry("कृष्ण-अनुवर्तिनाम्‌ — भगवान् के आदेशों का पालन करने वाले।")).toBe(true);
  });

  it("leaves prose that merely contains a dash alone", () => {
    const prose = "किन्तु भगवान् बुद्ध ने प्रत्यक्ष रूप से ऐसा किया। श्रील जयदेव गोस्वामी ने कहा—निन्दसि यज्ञ";
    expect(isGlossEntry(prose)).toBe(false);
  });

  it("leaves the translation alone, though its dash comes early", () => {
    // "अर्जुन ने कहा -" puts the dash at character 14, inside the offset bound;
    // it is the three-word opening that keeps it out of the glossary.
    expect(isGlossEntry(TRANSLATION)).toBe(false);
  });

  it("holds the term-word bound where the measurement put it", () => {
    expect(MAX_GLOSS_TERM_WORDS).toBe(2);
  });

  it("leaves a line with no separator at all alone", () => {
    expect(isGlossEntry("सन्त तो मेरे हृदय हैं और एकमात्र मैं ही उनका हृदय हूँ।")).toBe(false);
  });

  it("leaves the section labels alone", () => {
    for (const label of ["तात्पर्य: कुछ", "अनुवाद - कुछ", "शब्दार्थ — कुछ"]) {
      expect(isGlossEntry(label)).toBe(false);
    }
  });

  it("does not count an entry that dangles, which continuesGloss handles", () => {
    expect(isGlossEntry("चिकीर्षव:-")).toBe(false);
  });

  it("does not count a line that opens on the separator", () => {
    expect(isGlossEntry("— भी।")).toBe(false);
  });

  it("holds the separator offset inside the measured gap", () => {
    expect(MAX_GLOSS_SEPARATOR_OFFSET).toBeGreaterThanOrEqual(17);
    expect(MAX_GLOSS_SEPARATOR_OFFSET).toBeLessThan(38);
  });

  it("ignores a non-string", () => {
    expect(isGlossEntry(null)).toBe(false);
    expect(isGlossEntry(undefined)).toBe(false);
  });
});
