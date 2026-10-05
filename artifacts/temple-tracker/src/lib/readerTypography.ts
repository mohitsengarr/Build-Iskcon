// How the book's prose is set: the reading face, and whether lines are justified.
//
// The readers were laid out like a web page — one ragged-right column in a sans
// face. These two settings make the page read like a printed book, and both are
// the reader's to turn off: justification can open rivers in Devanagari on a
// narrow screen, and a serif face is a matter of taste.

export type ReadingFace = "serif" | "sans";

export interface TypographySettings {
  /** The face the prose is set in. Verses keep their own Sanskrit face. */
  face: ReadingFace;
  /** Whether prose is justified to both margins, as a book sets it. */
  justify: boolean;
}

export const DEFAULT_TYPOGRAPHY: TypographySettings = { face: "serif", justify: true };

/** A stored face, or the default when nothing readable was kept. */
export function parseFace(raw: unknown): ReadingFace {
  return raw === "sans" || raw === "serif" ? raw : DEFAULT_TYPOGRAPHY.face;
}

/** A stored justify flag; anything unreadable keeps the default. */
export function parseJustify(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return DEFAULT_TYPOGRAPHY.justify;
}

/** The CSS for a paragraph of prose, given the reader's choices. */
export function proseStyle(settings?: Partial<TypographySettings>): {
  fontFamily: string;
  textAlign: "justify" | "left";
  hyphens: "auto";
  textJustify: "inter-word";
} {
  const face = parseFace(settings?.face);
  const justify = parseJustify(settings?.justify);
  return {
    fontFamily: face === "serif" ? "var(--font-devanagari-serif)" : "var(--font-devanagari)",
    textAlign: justify ? "justify" : "left",
    // Hindi hyphenation needs lang="hi" on the text for the browser to use its
    // dictionary; without it this is simply inert, and inter-word keeps the
    // spacing even rather than stretching the glyphs.
    hyphens: "auto",
    textJustify: "inter-word",
  };
}
