// Text helpers shared by the readers' correction toolbars.
//
// These were identical copies inside bhagwatham.tsx and chaitanya.tsx, and were
// missing from gita.tsx entirely. Pure string work, so they are tested here
// rather than through a page.

// ── Per-line "un-bold" overrides ──────────────────────────────────────────────
// Shlok (Sanskrit verse) lines render bold BY DESIGN (BBT print convention — see
// the `font-bold` on the shlok <p>). That bold is structural CSS, NOT `**` markdown,
// so the "Remove bold" toolbar (which only strips `**`) can never lighten a verse —
// it silently no-ops. This lets a maintainer mark specific verse lines to render at
// normal weight; the renderer honours it and "Make bold" toggles it back. Keyed by
// the normalized line text (device-local, non-destructive, reversible) so it survives
// re-pagination. `**` and whitespace are collapsed so the source line and the
// rendered-DOM selection normalize to the same key.
export function normalizeBoldKey(line: string): string {
  // Danda-insensitive: the OCR emits both "।" and an ASCII "|" for the same mark,
  // and normalising pipes for display would otherwise invalidate keys stored
  // before that change.
  return line.replace(/\*\*/g, "").replace(/[|॥]/g, "।").replace(/\s+/g, " ").trim();
}

// Key for शब्दार्थ (word-meaning) lines. Their meanings are bolded by the RENDERER
// (<strong>), not by `**`, so they need the same un-bold override as verses — but
// the renderer prints every separator as "—" whatever the source used ("—", "--"
// or "- "), so a rendered-text key would never equal a source-line key. Collapsing
// each dash run to a single "—" makes both sides normalize identically.
export function normalizeDashKey(line: string): string {
  return normalizeBoldKey(line).replace(/[-‐-―−]+/g, "—").replace(/\s*—\s*/g, "—");
}

// Tidy the AI's replacement before it goes into the page source.
// The OCR keeps a newline at every PRINTED line end, and the renderer turns each
// source line into its own rendered line. The model re-wraps prose at different
// points, so its output rendered as ragged half-width lines. In prose we collapse
// single newlines to spaces (the paragraph then reflows naturally to full width)
// while keeping blank lines, which are real paragraph breaks. Verses are left
// alone — there a single newline separates the half-lines and is meaningful.
// Also fixes the doubled single-danda splice artifact ("होगा। ।").
export function tidyAiText(text: string, isVerse: boolean): string {
  let out = text;
  if (!isVerse) {
    out = out.replace(/([^\n])\n(?!\n)/g, "$1 ");
  }
  out = out
    .replace(/।[ \t]*।/g, "।")   // "। ।" → "।"  (॥ is one char, untouched)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n");
  return out.trim();
}


export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Robust selection locator (BUG 2) ────────────────────────────────────────
// `page.text.indexOf(selectedText)` returns -1 whenever the rendered/selected
// text doesn't byte-match the raw page source — e.g. because:
//   (i)   the source has "**bold**" markers that the rendered <strong> selection
//         doesn't include;
//   (ii)  whitespace/newline normalization differs (rendered text collapses
//         lines/spaces; source keeps "\n" and OCR spacing);
//   (iii) the DOM selection swept up rendering-only glyphs.
// This helper tries progressively looser strategies and returns the FIRST hit
// as {index, matchLength} — the caller should slice/replace using that
// (index, matchLength) pair, never a naive `.replace(selectedText, ...)`
// (which can silently hit the wrong occurrence, or fail outright).
export function locateSelectionInSource(sourceText: string, selectedText: string): { index: number; matchLength: number } | null {
  if (!sourceText || !selectedText) return null;

  // 1. Exact match.
  {
    const idx = sourceText.indexOf(selectedText);
    if (idx >= 0) return { index: idx, matchLength: selectedText.length };
  }

  // 2. Exact match on the trimmed selection (handles leading/trailing
  //    whitespace picked up by the DOM Selection API).
  const trimmedSel = selectedText.trim();
  if (trimmedSel && trimmedSel !== selectedText) {
    const idx = sourceText.indexOf(trimmedSel);
    if (idx >= 0) return { index: idx, matchLength: trimmedSel.length };
  }

  // 3. Whitespace-flexible match: every run of whitespace in the selection
  //    matches any run of whitespace in the source. This handles rendered
  //    selections that space-join what is, in the source, several lines
  //    separated by "\n" (or OCR runs of multiple spaces).
  const buildWhitespaceFlexibleRegex = (s: string): string =>
    s.split(/(\s+)/).map((chunk) => (/^\s+$/.test(chunk) ? "\\s+" : escapeRegExp(chunk))).join("");
  try {
    const re = new RegExp(buildWhitespaceFlexibleRegex(trimmedSel || selectedText));
    const m = re.exec(sourceText);
    if (m) return { index: m.index, matchLength: m[0].length };
  } catch { /* malformed regex — fall through */ }

  // 4. Bold-insensitive match: strip "**" from both the source and the
  //    selection, whitespace-flexible-match the stripped selection against
  //    the stripped source, then map the hit back to the ORIGINAL source
  //    offsets so the caller can still slice/replace the real (bold-marker-
  //    including) text.
  if (sourceText.includes("**") || selectedText.includes("**")) {
    const strippedSel = (trimmedSel || selectedText).replace(/\*\*/g, "");
    if (strippedSel) {
      // Map: index in the "**"-stripped source → index in the original source.
      const strippedToOriginal: number[] = [];
      let stripped = "";
      for (let i = 0; i < sourceText.length; i++) {
        if (sourceText[i] === "*" && sourceText[i + 1] === "*") { i++; continue; }
        stripped += sourceText[i];
        strippedToOriginal.push(i);
      }
      try {
        const re = new RegExp(buildWhitespaceFlexibleRegex(strippedSel));
        const m = re.exec(stripped);
        if (m && m[0].length > 0) {
          const strippedStart = m.index;
          const strippedEnd = m.index + m[0].length - 1;
          const originalStart = strippedToOriginal[strippedStart];
          const originalEndCharIdx = strippedToOriginal[strippedEnd];
          if (originalStart !== undefined && originalEndCharIdx !== undefined) {
            // Extend the end past any trailing "**" that belongs to the same
            // bold span so the located span includes the closing markers.
            let originalEnd = originalEndCharIdx + 1;
            if (sourceText[originalEnd] === "*" && sourceText[originalEnd + 1] === "*") originalEnd += 2;
            return { index: originalStart, matchLength: originalEnd - originalStart };
          }
        }
      } catch { /* malformed regex — fall through */ }
    }
  }

  // 5. Nothing matched — caller keeps its existing alert/fallback behavior.
  return null;
}
