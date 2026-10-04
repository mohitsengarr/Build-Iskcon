// The print book's running head, which the scan captured on every page.
//
// Each page of Chaitanya-charitamrta opens with the line the press put there:
// "xxxiv श्रीचैतन्य-चरितामृत" or "२ श्रीचैतन्य-चरितामृत आदि लीला, अध्याय १" on a
// left-hand page, "श्लोक १ ] गुरुवर्ग ३" on a right-hand one. On screen there are
// no facing pages and the reader scrolls straight through, so that line is not
// information — it is the same sentence repeated between every two screenfuls.
//
// Measured over 1,160 pages of the live text: 1,143 first lines are this
// furniture, and on 276 of them it repeats on the second line (the page number
// sits on the first). The 17 that are not are real — chapter headings, परिचय,
// विषय-सूची, भूमिका — and none of them match these rules.

const NUM = "[0-9\\u0966-\\u096F]";
const ROMAN = "[ivxlcdm]+";

/** The titles a running head carries, per book. */
const TITLES = [
  "श्रीचैतन्य[-\\s]?चरितामृत",
  "चैतन्य[-\\s]?चरितामृत",
  "श्रीमद्भागवतम्",
  "श्रीमद्भगवद्गीता",
  "भगवद्गीता",
].join("|");

const ROMAN_ONLY = new RegExp(`^${ROMAN}$`, "iu");

const HEAD_PATTERNS: RegExp[] = [
  // "xxxiv श्रीचैतन्य-चरितामृत", "२ श्रीचैतन्य-चरितामृत आदि लीला, अध्याय १"
  new RegExp(`^(?:${NUM}{1,4}|${ROMAN})?[\\s.।]*(?:${TITLES})[\\s,।-]*.{0,40}$`, "iu"),
  // "श्रीचैतन्य-चरितामृत ८७" — the mirrored form
  new RegExp(`^(?:${TITLES})[\\s,।-]{0,40}(?:${NUM}{1,4}|${ROMAN})$`, "iu"),
  // "श्लोक १ ] गुरुवर्ग ३" — the right-hand page's head
  new RegExp(`^श्लोक\\s*${NUM}{1,4}\\s*[\\]\\}\\)]`, "u"),
  // "परिचय xxi" — a front-matter section with its roman page number
  new RegExp(`^[\\u0900-\\u097F]{2,12}\\s+${ROMAN}$`, "iu"),
  // "xliv" alone
  new RegExp(`^${ROMAN}$`, "iu"),
];

/**
 * A line that is only a page number: "43", "430", "42]" and this edition's
 * Devanagari digits ("९३"), which an ASCII-only test left on screen.
 */
export function isStandalonePageNumber(line: string): boolean {
  return new RegExp(`^${NUM}{1,5}[\\]\\)]*$`, "u").test(line.trim());
}

/**
 * The tail of a head the scan broke in two: the chapter's title, standing alone
 * under "श्लोक ७ ]". Deliberately narrow — a short run of words with no sentence
 * punctuation, no digits and no section label — because this only runs on a line
 * that directly follows a head that was already removed.
 */
export function isHeadTail(line: unknown): boolean {
  const t = typeof line === "string" ? line.trim() : "";
  if (!t || t.length > 45) return false;
  if (/[।॥;:,—\-\d०-९()]/u.test(t)) return false;
  if (/^(अनुवाद|शब्दार्थ|तात्पर्य|अध्याय|भाग|परिचय|भूमिका)/u.test(t)) return false;
  if (!/^[\u0900-\u097F\s]+$/u.test(t)) return false;
  return t.split(/\s+/).length <= 5;
}

/** Whether a line is the press's running head rather than the book's text. */
export function isRunningHead(line: unknown): boolean {
  const t = typeof line === "string" ? line.trim() : "";
  if (!t || t.length > 90) return false;
  return HEAD_PATTERNS.some((re) => re.test(t));
}

/** How many lines from the top of a page may be running head. */
export const RUNNING_HEAD_SCAN_LINES = 2;

/**
 * The page without its running head. Only the first two lines with text are
 * considered: the head sits at the top of the page, and a line that reads like
 * one further down is the book's own — usually a verse being cited.
 *
 * Blank lines are preserved (they mark paragraphs), and a page that is nothing
 * but running head is returned as it is rather than emptied.
 */
/** The next line with text after `from`, or "" when the page ends there. */
function nextTextLine(lines: string[], from: number): string {
  for (let i = from + 1; i < lines.length; i++) {
    const t = (lines[i] ?? "").trim();
    if (t) return t;
  }
  return "";
}

export function stripRunningHead(lines: string[]): string[] {
  if (!Array.isArray(lines)) return [];
  const out = [...lines];
  let tookHead = false;
  for (let removed = 0; removed < RUNNING_HEAD_SCAN_LINES; removed++) {
    const at = out.findIndex((l) => (l ?? "").trim());
    if (at === -1) break;
    const t = out[at].trim();
    if (isRunningHead(t)) { tookHead = true; out.splice(at, 1); continue; }
    if (isStandalonePageNumber(t)) { out.splice(at, 1); continue; }
    // The scan often breaks the right-hand head in three: "श्लोक ७ ]", then the
    // chapter's title, then the page number. The title alone is indistinguishable
    // from a short opening line of prose, so it is only taken when the page
    // number follows it — that is what makes it part of the head block.
    if (tookHead && isHeadTail(t) && isStandalonePageNumber(nextTextLine(out, at))) {
      out.splice(at, 1);
      continue;
    }
    break;
  }

  // The foot of the page carries the number on a chapter's opening page (12 of
  // 994 live pages). Only a bare number or roman numeral is taken from the end —
  // a sentence there is the book's, however much it looks like a head.
  for (let i = out.length - 1; i >= 0; i--) {
    const t = (out[i] ?? "").trim();
    if (!t) continue;
    if (isStandalonePageNumber(t) || ROMAN_ONLY.test(t)) out.splice(i, 1);
    break;
  }

  return out.some((l) => (l ?? "").trim()) ? out : lines;
}
