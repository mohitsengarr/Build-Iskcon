import { describe, expect, it } from "vitest";
import { stripLatinNoise } from "./ocrLatinNoise";

describe("stripLatinNoise", () => {
  it("keeps the line break when a fragment opens the next line", () => {
    // Gita 2.3 as the scan left it: the word-meanings begin with "FAST", which
    // used to swallow the blank line and the verse's closing half with it.
    const page = [
      "क्षुद्रं हृदयदौर्बल्यं त्यक्त्वोत्तिष्ठ परन्तप ॥ ३ ॥",
      "",
      "FAST नपुंसकता; मास्म मत; गमः प्राप्त हो;",
    ].join("\n");
    const cleaned = stripLatinNoise(page);
    expect(cleaned.split("\n")[0]).toBe("क्षुद्रं हृदयदौर्बल्यं त्यक्त्वोत्तिष्ठ परन्तप ॥ ३ ॥");
    expect(cleaned).not.toContain("FAST");
    expect(cleaned).toContain("॥ ३ ॥\n\nनपुंसकता");
  });

  it("removes a fragment that opens a line", () => {
    expect(stripLatinNoise("WR शब्दार्थ")).toBe("शब्दार्थ");
  });

  it("removes a fragment sitting alone on its line", () => {
    expect(stripLatinNoise("पहली\nWR\nदूसरी")).toBe("पहली\n\nदूसरी");
  });

  it("removes a fragment that closes a line, without pulling the next line up", () => {
    expect(stripLatinNoise("भगवान् उवाच WR\nअर्जुन उवाच")).toBe("भगवान् उवाच\nअर्जुन उवाच");
  });

  it("removes a fragment between two Devanagari words", () => {
    expect(stripLatinNoise("भगवान् abc विष्णु")).toBe("भगवान् विष्णु");
  });

  it("never joins two lines of Devanagari prose", () => {
    const text = "पहली पंक्ति करते\nदूसरी पंक्ति";
    expect(stripLatinNoise(text)).toBe(text);
  });

  it("leaves the tail of an address at the end of a line alone", () => {
    expect(stripLatinNoise("ई-मेल: bbtadmin@pamho.net")).toContain("pamho.net");
  });

  it("leaves a Latin word too long to be scan debris", () => {
    expect(stripLatinNoise("भगवान् Krishna विष्णु")).toContain("Krishna");
  });

  it("strips a five-letter fragment but keeps a six-letter word", () => {
    expect(stripLatinNoise("FIRST नपुंसकता")).toBe("नपुंसकता");
    expect(stripLatinNoise("SECOND नपुंसकता")).toBe("SECOND नपुंसकता");
  });

  it("treats a run of short Latin words as debris as well", () => {
    // These scans carry no Latin prose worth keeping: measured over all 17,456
    // pages, the only Latin-only lines are cover noise and the typesetter's own
    // markers ("footnote ends here"). Sparing them left four times as much
    // Latin debris sitting in the Hindi text, so short words go either way.
    const cleaned = stripLatinNoise("Bhagavad Gita As It Is");
    expect(cleaned).toContain("Bhagavad");
    expect(cleaned).not.toContain("As");
  });
});
