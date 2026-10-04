// The last word-meaning, broken across two printed lines.
//
// A gloss is set as "term—meaning; term—meaning;" and when the final entry does
// not fit the measure, its meaning alone drops to the next line:
//
//     ... प्रिय- मंगल, भला; चिकीर्षव:-
//     चाहने वाले |
//
// That tail carries no semicolon and no separator of its own, so the scanner read
// it as the first line of the translation — and the reader then printed the
// "अनुवाद :" label above a fragment of the glossary, leaving the real translation
// with no label at all. 14 of 200 Gita pages carry one.

/**
 * How long a line may be and still be the tail of a gloss rather than prose.
 * Measured over 240 Gita pages: a tail after a dangling entry runs 12-33
 * characters (median 15), while the line after a gloss that closed cleanly — the
 * translation — has a median of 91. 45 sits in the gap.
 */
export const MAX_GLOSS_TAIL_CHARS = 45;

/**
 * Whether a gloss line ends mid-entry. Only a trailing separator counts: a line
 * ending in ";" has finished its entry, and whatever follows is a new one (or
 * the translation).
 */
export function glossLineDangles(line: unknown): boolean {
  const t = typeof line === "string" ? line.trim() : "";
  return /[-–—:]$/.test(t);
}

/** Whether a line could be that dangling entry's meaning. */
export function isGlossTail(line: unknown): boolean {
  const t = typeof line === "string" ? line.trim() : "";
  if (!t || t.length > MAX_GLOSS_TAIL_CHARS) return false;
  if (t.includes(";")) return false;
  return !/^(तात्पर्य|अनुवाद|शब्दार्थ)/u.test(t);
}

/** Whether `line` finishes the entry `previousLine` left open. */
export function continuesGloss(previousLine: unknown, line: unknown): boolean {
  return glossLineDangles(previousLine) && isGlossTail(line);
}
