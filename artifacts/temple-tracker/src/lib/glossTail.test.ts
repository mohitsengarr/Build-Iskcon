import { describe, expect, it } from "vitest";
import { continuesGloss, glossLineDangles, isGlossTail, MAX_GLOSS_TAIL_CHARS } from "./glossTail";

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
