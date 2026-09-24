import React from "react";

// The readers store emphasis as "**bold**" inside the page text, because an
// editor's correction has to survive as plain text in {book}_page_edits.
//
// A block is tokenised as a whole, not line by line: a bold run may open on one
// printed line and close on the next, and the two halves must stay one <strong>.

export function renderInlineBoldBlock(lines: string[]): React.ReactNode[] {
  const joined = lines.join("\n");
  if (!joined.includes("**")) return lines;

  // Bail out to plain text if "**" markers are unbalanced across the block —
  // never bold only half of an unmatched pair.
  const markerCount = (joined.match(/\*\*/g) || []).length;
  if (markerCount % 2 !== 0) return lines;

  // Tokenize the whole block: alternating plain / bold segments. Bold segments
  // may themselves contain "\n" (spanning multiple lines).
  const tokens = joined.split(/(\*\*[^*]+\*\*)/g);
  type Piece = { bold: boolean; text: string };
  const pieces: Piece[] = tokens
    .filter((tok) => tok.length > 0)
    .map((tok) => {
      if (tok.startsWith("**") && tok.endsWith("**") && tok.length >= 4) {
        return { bold: true, text: tok.slice(2, -2) };
      }
      return { bold: false, text: tok };
    });

  // Re-split the flat piece list back into per-original-line node arrays,
  // splitting any piece that contains "\n" at the line boundaries.
  const perLine: React.ReactNode[][] = lines.map(() => []);
  let lineIdx = 0;
  let keySeq = 0;
  for (const piece of pieces) {
    const segments = piece.text.split("\n");
    segments.forEach((seg, segIdx) => {
      if (seg.length > 0) {
        const node = piece.bold
          ? <strong key={keySeq++}>{seg}</strong>
          : <React.Fragment key={keySeq++}>{seg}</React.Fragment>;
        perLine[lineIdx]?.push(node);
      }
      // A "\n" inside the piece means we've moved to the next source line.
      if (segIdx < segments.length - 1) lineIdx++;
    });
  }
  return perLine;
}

/**
 * One line on its own. A "**" that opens and closes on THIS line renders bold;
 * an unbalanced one renders as plain text.
 */
export function renderInlineBold(line: string): React.ReactNode {
  return renderInlineBoldBlock([line])[0];
}
