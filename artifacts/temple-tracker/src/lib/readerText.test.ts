import { describe, expect, it } from "vitest";
import {
  escapeRegExp,
  locateSelectionInSource,
  normalizeBoldKey,
  normalizeDashKey,
  tidyAiText,
} from "./readerText";

describe("normalizeBoldKey", () => {
  it("ignores the ** markers, so a source line and the rendered selection agree", () => {
    expect(normalizeBoldKey("**अर्जुन** उवाच")).toBe(normalizeBoldKey("अर्जुन उवाच"));
  });

  it("treats the OCR's ASCII pipe and the double danda as a danda", () => {
    expect(normalizeBoldKey("धर्मक्षेत्रे |")).toBe("धर्मक्षेत्रे ।");
    expect(normalizeBoldKey("धर्मक्षेत्रे ॥")).toBe("धर्मक्षेत्रे ।");
  });

  it("collapses runs of whitespace and trims", () => {
    expect(normalizeBoldKey("  a   b \n c ")).toBe("a b c");
  });
});

describe("normalizeDashKey", () => {
  it("makes every separator the renderer's em dash, so gloss keys match", () => {
    const source = "अर्जुनः - अर्जुन ने; उवाच -- कहा";
    const rendered = "अर्जुनः—अर्जुन ने; उवाच—कहा";
    expect(normalizeDashKey(source)).toBe(normalizeDashKey(rendered));
  });

  it("still ignores ** markers like the bold key does", () => {
    expect(normalizeDashKey("**अर्जुनः**—अर्जुन")).toBe(normalizeDashKey("अर्जुनः—अर्जुन"));
  });
});

describe("tidyAiText", () => {
  it("reflows prose: a single newline becomes a space", () => {
    expect(tidyAiText("पहली पंक्ति\nदूसरी पंक्ति", false)).toBe("पहली पंक्ति दूसरी पंक्ति");
  });

  it("keeps a blank line, which is a real paragraph break", () => {
    expect(tidyAiText("पहला अनुच्छेद\n\nदूसरा अनुच्छेद", false)).toBe("पहला अनुच्छेद\n\nदूसरा अनुच्छेद");
  });

  it("leaves a verse alone: its line breaks separate the half-lines", () => {
    const verse = "धर्मक्षेत्रे कुरुक्षेत्रे\nसमवेता युयुत्सवः";
    expect(tidyAiText(verse, true)).toBe(verse);
  });

  it("repairs the doubled danda the splice leaves behind", () => {
    expect(tidyAiText("होगा। ।", false)).toBe("होगा।");
    expect(tidyAiText("होगा।।", false)).toBe("होगा।");
  });

  it("does not touch a double danda, which is one character", () => {
    expect(tidyAiText("समाप्तम् ॥", true)).toBe("समाप्तम् ॥");
  });

  it("collapses runs of spaces and trims", () => {
    expect(tidyAiText("  a    b  ", false)).toBe("a b");
  });
});

describe("escapeRegExp", () => {
  it("escapes the characters that would otherwise be pattern syntax", () => {
    expect(escapeRegExp("a.b*c+d?e(f)")).toBe("a\\.b\\*c\\+d\\?e\\(f\\)");
    expect(new RegExp(escapeRegExp("(1.2)")).test("(1.2)")).toBe(true);
    expect(new RegExp(escapeRegExp("(1.2)")).test("152")).toBe(false);
  });

  it("leaves Devanagari untouched", () => {
    expect(escapeRegExp("अर्जुन")).toBe("अर्जुन");
  });
});

describe("locateSelectionInSource", () => {
  const source = "अर्जुन उवाच\n**धर्मक्षेत्रे** कुरुक्षेत्रे समवेता युयुत्सवः ।\nमामकाः पाण्डवाश्चैव";

  it("finds an exact selection and reports where it is", () => {
    const hit = locateSelectionInSource(source, "मामकाः पाण्डवाश्चैव");
    expect(hit).not.toBeNull();
    expect(source.slice(hit!.index, hit!.index + hit!.matchLength)).toBe("मामकाः पाण्डवाश्चैव");
  });

  it("finds text the reader selected from a bold run, where the source has ** markers", () => {
    // The DOM selection has no markers; a plain indexOf returns -1 here.
    expect(source.indexOf("धर्मक्षेत्रे कुरुक्षेत्रे")).toBe(-1);
    const hit = locateSelectionInSource(source, "धर्मक्षेत्रे कुरुक्षेत्रे");
    expect(hit).not.toBeNull();
    expect(source.slice(hit!.index, hit!.index + hit!.matchLength)).toContain("कुरुक्षेत्रे");
  });

  it("finds a selection that spans a line break, where the rendered text had a space", () => {
    const hit = locateSelectionInSource(source, "युयुत्सवः । मामकाः");
    expect(hit).not.toBeNull();
  });

  it("tolerates the surrounding whitespace a triple-click adds", () => {
    const hit = locateSelectionInSource(source, "  अर्जुन उवाच  ");
    expect(hit).not.toBeNull();
    expect(hit!.index).toBe(0);
  });

  it("returns null when the text is not on this page, so the caller can try another", () => {
    expect(locateSelectionInSource(source, "यह वाक्य इस पृष्ठ पर नहीं है")).toBeNull();
  });

  it("returns null for an empty selection", () => {
    expect(locateSelectionInSource(source, "")).toBeNull();
    expect(locateSelectionInSource("", "anything")).toBeNull();
  });
});
