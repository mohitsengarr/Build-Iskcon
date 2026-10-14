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

/**
 * How far into the line the separator may sit and still read as "term — meaning".
 * Measured over all 17,456 pages of the three books: in a gloss's own entries the
 * separator lands at character 6 (median) and 17 at the 99th percentile, while a
 * sentence of prose that merely contains a dash carries it at 38 or beyond. 20
 * sits in that gap.
 */
export const MAX_GLOSS_SEPARATOR_OFFSET = 20;

/**
 * How many words a gloss term may run to. 2,604 of the 2,632 measured entries
 * name their term in one or two words; the translation the gloss runs into opens
 * "अर्जुन ने कहा - हे अच्युत!", which is three, so the count is what keeps the
 * translation out of the glossary.
 */
export const MAX_GLOSS_TERM_WORDS = 2;

/**
 * Whether a line is one more entry of the word-meanings — "term — meaning".
 *
 * The gloss's LAST entry carries no semicolon and closes with a danda:
 * "अपि - भी ।". That is also the exact shape of a half-shloka — short, almost
 * all Devanagari, ending in a danda, often opening on a Sanskrit particle — and
 * the verse rules run before the gloss branch, so they took it, gave it its own
 * block with a divider above, and set it in verse type (CC Adi-lila 1.62).
 */
export function isGlossEntry(line: unknown): boolean {
  const t = typeof line === "string" ? line.trim() : "";
  if (!t || /^(तात्पर्य|अनुवाद|शब्दार्थ)/u.test(t)) return false;
  const separator = /[-\u2013\u2014]/u.exec(t);
  if (!separator || separator.index === 0) return false;
  if (separator.index > MAX_GLOSS_SEPARATOR_OFFSET) return false;
  // Nothing after the separator means the entry dangles into the next line;
  // continuesGloss handles that case.
  if (!/\S/.test(t.slice(separator.index + separator[0].length))) return false;
  const term = t.slice(0, separator.index).trim();
  return term.split(/\s+/).filter(Boolean).length <= MAX_GLOSS_TERM_WORDS;
}
