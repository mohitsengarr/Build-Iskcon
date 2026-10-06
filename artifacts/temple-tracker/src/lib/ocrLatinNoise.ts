// Short Latin runs the scan leaves where it could not read a Devanagari word.
//
// The OCR drops fragments like "FAST", "WR" or "FEA" into the text, most often
// where the शब्दार्थ heading defeated it. Removing them is right. Removing the
// line break with them is not: the old rules matched \s, which spans newlines,
// so a fragment sitting at the start of a line glued that line onto the one
// before it. On Gita 2.3 that pulled the closing half of the verse —
// "क्षुद्रं हृदयदौर्बल्यं ... ॥ ३ ॥" — into the word-meanings, so the shloka
// read as if it had been cut in half. Across the three books the old rules
// destroyed 1,484 line breaks on 861 pages.
//
// Every rule here is line-local. A fragment at the start or end of a line is
// matched against the line boundary (^ / $ under /m) instead of against the
// newline itself, which is what the \s used to stand in for.

/** What a stray fragment may sit between. Deliberately excludes the newline. */
const NEAR = "\\u0900-\\u097F \\t;,\\u0964:\\u2014\\-\\.";
/** Horizontal whitespace only. */
const H = "[ \\t]";

const ALONE_ON_ITS_LINE = /^[A-Za-z]{1,4}$/gmu;
const AT_LINE_START = new RegExp(`^${H}*\\b[a-zA-Z]{1,5}\\b${H}*[:|]?${H}*(?=[${NEAR}])`, "gmu");
// A fragment straight after "something." closes an address — bbtadmin@pamho.net
// on the imprint page — rather than being noise, so leave that one alone.
const AT_LINE_END = new RegExp(`(?<![A-Za-z0-9]\\.)(?<=[${NEAR}])${H}*\\b[a-zA-Z]{1,5}\\b${H}*$`, "gmu");
const BETWEEN_WORDS = new RegExp(`(?<=[${NEAR}])${H}*\\b[a-zA-Z]{1,5}\\b${H}*[:|]?${H}*(?=[${NEAR}])`, "gu");
const BETWEEN_DEVANAGARI = /(?<=[ऀ-ॿ])[ \t]+[a-zA-Z]{1,4}[ \t]+(?=[ऀ-ॿ])/gu;

/** Drop the scan's Latin debris without touching where the lines break. */
export function stripLatinNoise(text: string): string {
  return text
    .replace(ALONE_ON_ITS_LINE, "")
    .replace(AT_LINE_START, "")
    .replace(AT_LINE_END, "")
    .replace(BETWEEN_WORDS, " ")
    .replace(BETWEEN_DEVANAGARI, " ");
}
