// Book data for the Android reader (read-only). Srimad Bhagavatam content comes
// from the public buildiskcon.com API: a chapter-index + 20-page "batch" slabs.
// A chapter's pages run from its pageNumber to the next chapter's pageNumber,
// which can span 2–3 batches, so the reader fetches the covering batches and
// filters to the chapter's page range.

const API = "https://buildiskcon.com/api/bhagwatham";
const PAGES_PER_BATCH = 20;

export interface Chapter {
  globalNumber: number;
  number: number;   // chapter number within its canto
  skandh: number;   // canto, 1–12
  title: string;    // Devanagari, e.g. "अध्याय एक — मुनियों की जिज्ञासा"
  pageNumber: number;
  batchNumber: number;
  nextPageNumber: number; // start of the NEXT chapter (exclusive end of this one)
}

export interface Book {
  key: string;
  title: string;
  subtitle: string;
}

// One book for now — Chaitanya Charitamrta can be added once its content has a
// public fetch endpoint (its text currently lives server-side, not on this API).
export const BOOKS: Book[] = [
  { key: "bhagwatham", title: "श्रीमद्‍भागवतम्", subtitle: "Srimad Bhagavatam · 12 Cantos" },
];

let _chaptersCache: Chapter[] | null = null;

export async function fetchChapters(): Promise<Chapter[]> {
  if (_chaptersCache) return _chaptersCache;
  const res = await fetch(`${API}/chapter-index`);
  if (!res.ok) throw new Error(`chapter-index HTTP ${res.status}`);
  const raw = ((await res.json()).chapters || []) as Array<Omit<Chapter, "nextPageNumber">>;
  const sorted = [...raw].sort((a, b) => a.pageNumber - b.pageNumber);
  const chapters: Chapter[] = sorted.map((c, i) => ({
    ...c,
    nextPageNumber: sorted[i + 1] ? sorted[i + 1].pageNumber : c.pageNumber + 60,
  }));
  _chaptersCache = chapters;
  return chapters;
}

interface Page { pageNumber: number; text: string }

/** Fetch a chapter's text (may span several 20-page batches), oldest→newest. */
export async function fetchChapterText(chapter: Chapter): Promise<string> {
  const startBatch = chapter.batchNumber;
  const endBatch = Math.max(startBatch, Math.ceil((chapter.nextPageNumber - 1) / PAGES_PER_BATCH));
  const batchNums: number[] = [];
  for (let b = startBatch; b <= endBatch; b++) batchNums.push(b);

  const pages: Page[] = [];
  await Promise.all(
    batchNums.map(async (b) => {
      try {
        const res = await fetch(`${API}/batch/${b}`);
        if (!res.ok) return;
        for (const p of ((await res.json()).pages || []) as Page[]) pages.push(p);
      } catch { /* skip a bad/unreachable batch */ }
    }),
  );

  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  const inChapter = pages.filter(
    (p) => p.pageNumber >= chapter.pageNumber && p.pageNumber < chapter.nextPageNumber,
  );
  return inChapter.map((p) => (p.text || "").trim()).filter(Boolean).join("\n\n");
}

/** Group chapters into cantos for a SectionList. */
export function groupByCanto(chapters: Chapter[]): Array<{ canto: number; data: Chapter[] }> {
  const map = new Map<number, Chapter[]>();
  for (const c of chapters) {
    if (!map.has(c.skandh)) map.set(c.skandh, []);
    map.get(c.skandh)!.push(c);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([canto, data]) => ({ canto, data: data.sort((x, y) => x.number - y.number) }));
}
