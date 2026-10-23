// The cover daily-approved-art-post sends next: one approved, never-posted Gita
// or Chaitanya cover, alternating books by how many have gone out. Only covers
// with Krishna in them go out (owner, 2026-10-23): each candidate passes the gate
// (_shared/krishnaCheck.ts krishnaGate), oldest first, and a cover the gate holds
// back is skipped and keeps its check on the row. A run looks at no more than
// MAX_COVERS_EXAMINED covers per book, which bounds the checks it can start.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export const COVER_BOOKS = [
  { key: "gita", table: "gita_chapter_art_review", label: "Bhagavad-gita" },
  { key: "chaitanya", table: "chaitanya_chapter_art_review", label: "Caitanya-caritamrta" },
] as const;
export type CoverBook = typeof COVER_BOOKS[number];

export const MAX_COVERS_EXAMINED = 10;

export type CoverGate = (book: CoverBook, row: Record<string, unknown>) => Promise<{ allowed: boolean; reason: string }>;

export async function pickNextCover(o: { supabase: SupabaseLike; gate: CoverGate; bookKey?: string }): Promise<{
  pick: { book: CoverBook; row: Record<string, unknown> } | null;
  held: Array<{ book: string; id: unknown; reason: string }>;
}> {
  let order: CoverBook[] = [...COVER_BOOKS];
  if (o.bookKey) {
    const b = COVER_BOOKS.find((x) => x.key === o.bookKey);
    if (!b) throw new Error(`unknown book '${o.bookKey}'`);
    order = [b];
  } else {
    // Alternate by how many have already gone out, so the books stay balanced.
    const counts = await Promise.all(COVER_BOOKS.map(async (b) => {
      const { count } = await o.supabase.from(b.table).select("id", { count: "exact", head: true }).not("posted_at", "is", null);
      return count || 0;
    }));
    order = counts[0] <= counts[1] ? [...COVER_BOOKS] : [COVER_BOOKS[1], COVER_BOOKS[0]];
  }
  const held: Array<{ book: string; id: unknown; reason: string }> = [];
  for (const book of order) {
    const { data, error } = await o.supabase.from(book.table).select("*")
      .eq("status", "approved").is("posted_at", null)
      .order("created_at", { ascending: true }).limit(MAX_COVERS_EXAMINED);
    if (error) throw new Error(`Reading ${book.table}: ${error.message}`);
    for (const row of Array.isArray(data) ? data : []) {
      let verdict: { allowed: boolean; reason: string };
      try {
        verdict = await o.gate(book, row);
      } catch (e) {
        verdict = { allowed: false, reason: `the Krishna check failed: ${String(e)}` };
      }
      if (verdict.allowed) return { pick: { book, row }, held };
      held.push({ book: book.key, id: row.id, reason: verdict.reason });
    }
  }
  return { pick: null, held };
}
