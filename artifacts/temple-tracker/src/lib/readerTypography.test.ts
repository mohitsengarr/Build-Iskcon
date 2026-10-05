import { describe, expect, it } from "vitest";
import { DEFAULT_TYPOGRAPHY, parseFace, parseJustify, proseStyle } from "./readerTypography";

describe("parseFace", () => {
  it("keeps a stored choice", () => {
    expect(parseFace("sans")).toBe("sans");
    expect(parseFace("serif")).toBe("serif");
  });

  it("falls back to the book face when nothing readable was kept", () => {
    for (const raw of [undefined, null, "", "Serif", 7, {}]) expect(parseFace(raw)).toBe(DEFAULT_TYPOGRAPHY.face);
  });
});

describe("parseJustify", () => {
  it("reads a boolean or the string a settings store round-trips", () => {
    expect(parseJustify(true)).toBe(true);
    expect(parseJustify(false)).toBe(false);
    expect(parseJustify("1")).toBe(true);
    expect(parseJustify("0")).toBe(false);
  });

  it("falls back to justified when nothing readable was kept", () => {
    for (const raw of [undefined, null, "maybe", 3]) expect(parseJustify(raw)).toBe(DEFAULT_TYPOGRAPHY.justify);
  });
});

describe("proseStyle", () => {
  it("sets prose in the serif face, justified, by default", () => {
    const style = proseStyle();
    expect(style.fontFamily).toBe("var(--font-devanagari-serif)");
    expect(style.textAlign).toBe("justify");
  });

  it("returns to the sans face and a ragged right edge when the reader asks", () => {
    const style = proseStyle({ face: "sans", justify: false });
    expect(style.fontFamily).toBe("var(--font-devanagari)");
    expect(style.textAlign).toBe("left");
  });

  it("keeps word spacing even rather than stretching the glyphs", () => {
    expect(proseStyle().textJustify).toBe("inter-word");
    expect(proseStyle().hyphens).toBe("auto");
  });

  it("treats a half-filled settings object as the defaults for what is missing", () => {
    expect(proseStyle({ justify: false }).fontFamily).toBe("var(--font-devanagari-serif)");
    expect(proseStyle({ face: "sans" }).textAlign).toBe("justify");
  });
});
