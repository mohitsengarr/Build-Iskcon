// What a blank line means depends on what it sits inside.
//
// The three readers close the current section on every blank line, so that a
// purport printed as four paragraphs stays four paragraphs and each one can
// reflow on its own. Part-way through a verse that reading is wrong: the blank
// line between "क्लैव्यं मा स्म गमः ... ।" and
// "क्षुद्रं हृदयदौर्बल्यं ... ॥ ३ ॥" is the scan's line spacing, not a
// paragraph break. Closing there gave each half its own verse block, with a
// divider rule drawn between them, so a two-line shloka read as two verses.
//
// Only an UNFINISHED verse carries across the blank line. Once a line has
// brought the double danda that closes the verse, the blank line means what it
// means everywhere else — otherwise whatever follows the verse would be drawn
// into it.

const VERSE_KINDS = new Set(["shlok", "ref-shlok", "bengali-shlok"]);

/** True for the section kinds whose lines are verse, in any of the three books. */
export function isVerseKind(kind: string): boolean {
  return VERSE_KINDS.has(kind);
}

/**
 * True while a verse section is still waiting for its closing half — a blank
 * line there is line spacing inside one verse, not the end of a paragraph.
 */
export function verseIsOpen(kind: string, lines: string[]): boolean {
  if (!isVerseKind(kind)) return false;
  const last = lines[lines.length - 1];
  return last !== undefined && !/॥/u.test(last);
}
