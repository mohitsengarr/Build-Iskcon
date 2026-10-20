// The text a post carries on each channel.
//
// A caption is paragraphs separated by blank lines: the story, the Hare Krishna
// maha-mantra (🙏), and the book reference (📖 Srimad Bhagavatam — Canto 10,
// Chapter 33; first in older captions, last in newer ones); hashtags are kept
// apart. On Threads a post carries the story alone (owner, 2026-10-20): no
// mantra, no reference, no hashtags. Instagram keeps the whole caption and its
// hashtags.

export const THREADS_MAX_CHARS = 500;

const MANTRA = /hare\s+krishna\s+hare\s+krishna|hare\s+rama\s+hare\s+rama/i;
const MARKED = /^(?:📖|🙏)/u;
const ONLY_HASHTAGS = /^(?:#[\p{L}\p{N}_]+[\s,]*)+$/u;

/** The story paragraphs of a caption: everything but the mantra, the book reference and hashtags. */
export function storyText(caption: unknown): string {
  return String(caption ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !MARKED.test(p) && !MANTRA.test(p) && !ONLY_HASHTAGS.test(p))
    .join("\n\n")
    .trim();
}

/**
 * A Threads post's text: the caption's story, or `fallback` (a chapter title)
 * when the caption has none, within THREADS_MAX_CHARS — cut at the last sentence
 * that fits, or at a word with an ellipsis when no sentence end does.
 */
export function threadsText(caption: unknown, fallback?: unknown): string {
  const text = storyText(caption) || String(fallback ?? "").trim();
  if (text.length <= THREADS_MAX_CHARS) return text;
  const head = text.slice(0, THREADS_MAX_CHARS);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf("। "));
  if (sentenceEnd >= THREADS_MAX_CHARS * 0.5) return head.slice(0, sentenceEnd + 1).trim();
  const lastSentence = /[.!?।]$/.test(head) ? head : null;
  if (lastSentence) return lastSentence.trim();
  const space = head.lastIndexOf(" ", THREADS_MAX_CHARS - 2);
  return `${head.slice(0, space > 0 ? space : THREADS_MAX_CHARS - 1).trimEnd()}…`;
}
