// Gallery sections beyond the Bhagavatam's twelve cantos. The grid groups items
// by a section number: 1-12 are cantos, 21-23 the parts of the Chaitanya
// Charitamrita, 30 the Bhagavad-gita. Each needs a heading and a short badge,
// or the grid would title them "Canto 21" and "Canto 30".

export const GITA_SECTION = 30;

export const BOOK_SECTIONS: Record<number, { name: string; badge: string }> = {
  21: { name: "Chaitanya Charitamrita — Adi-lila", badge: "CC" },
  22: { name: "Chaitanya Charitamrita — Madhya-lila", badge: "CC" },
  23: { name: "Chaitanya Charitamrita — Antya-lila", badge: "CC" },
  [GITA_SECTION]: { name: "Bhagavad-gita", badge: "BG" },
};

/** The short mark in a section heading: the canto number, or the book's initials. */
export function sectionBadge(section: number): string {
  if (BOOK_SECTIONS[section]) return BOOK_SECTIONS[section].badge;
  return section ? String(section) : "–";
}

/**
 * A line for an approved Gita cover's card: its scene's title, else the first
 * line of its caption, else the chapter title. Hashtags are not a description.
 */
export function gitaCardDescription(row: { scene_title?: string | null; caption?: string | null; chapter_title?: string | null }): string {
  const firstLine = (row.caption ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#")) ?? "";
  return (row.scene_title?.trim() || firstLine || row.chapter_title?.trim() || "").slice(0, 200);
}
