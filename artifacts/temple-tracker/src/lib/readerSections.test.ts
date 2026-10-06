import { describe, expect, it } from "vitest";
import { isVerseKind, verseIsOpen } from "./readerSections";

describe("isVerseKind", () => {
  it("counts a chapter verse as verse", () => {
    expect(isVerseKind("shlok")).toBe(true);
  });

  it("counts a verse quoted inside a purport as verse", () => {
    expect(isVerseKind("ref-shlok")).toBe(true);
  });

  it("counts the Chaitanya-charitamrita's Bengali verses as verse", () => {
    expect(isVerseKind("bengali-shlok")).toBe(true);
  });

  it("leaves prose sections out, so their blank lines still break paragraphs", () => {
    for (const kind of ["chapter", "shabdarth", "anuvad", "tatparya", "text"]) {
      expect(isVerseKind(kind)).toBe(false);
    }
  });
});

describe("verseIsOpen", () => {
  it("holds a verse open after its first half", () => {
    expect(verseIsOpen("shlok", ["क्लैव्यं मा स्म गमः पार्थ नैतत्त्वय्युपपद्यते ।"])).toBe(true);
  });

  it("closes the verse once the double danda has arrived", () => {
    expect(verseIsOpen("shlok", [
      "क्लैव्यं मा स्म गमः पार्थ नैतत्त्वय्युपपद्यते ।",
      "क्षुद्रं हृदयदौर्बल्यं त्यक्त्वोत्तिष्ठ परन्तप ॥ ३ ॥",
    ])).toBe(false);
  });

  it("holds a four-line verse open through its middle lines", () => {
    expect(verseIsOpen("shlok", ["पहली पंक्ति ।", "दूसरी पंक्ति ।", "तीसरी पंक्ति ।"])).toBe(true);
  });

  it("stays shut for prose, whatever the lines look like", () => {
    expect(verseIsOpen("tatparya", ["कोई वाक्य ।"])).toBe(false);
    expect(verseIsOpen("text", ["कोई वाक्य ।"])).toBe(false);
  });

  it("stays shut for a section that has no lines yet", () => {
    expect(verseIsOpen("shlok", [])).toBe(false);
  });
});
