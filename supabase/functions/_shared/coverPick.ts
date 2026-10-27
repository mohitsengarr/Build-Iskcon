// The cover daily-approved-art-post sends next: one approved, never-posted Gita
// or Chaitanya cover, alternating books by how many have gone out. Only covers
// with Krishna in them go out (owner, 2026-10-23): each candidate passes the gate
// (_shared/krishnaCheck.ts krishnaGate), oldest first, and a cover the gate holds
// back is skipped and keeps its check on the row. Covers already checked cost
// nothing to skip; only NEW checks are limited (MAX_NEW_COVER_CHECKS a run), so
// held covers at the front never stop the Krishna covers behind them.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export const COVER_BOOKS = [
  { key: "gita", table: "gita_chapter_art_review", label: "Bhagavad-gita" },
  { key: "chaitanya", table: "chaitanya_chapter_art_review", label: "Caitanya-caritamrta" },
] as const;
export type CoverBook = typeof COVER_BOOKS[number];

export const MAX_NEW_COVER_CHECKS = 10;
export const COVER_READ_LIMIT = 500;

/** mayCheck false: the run has started enough new checks. checked: this call ran one. */
export type CoverGate = (
  book: CoverBook,
  row: Record<string, unknown>,
  o: { mayCheck: boolean },
) => Promise<{ allowed: boolean; reason: string; checked?: boolean }>;

export async function pickNextCover(o: { supabase: SupabaseLike; gate: CoverGate; bookKey?: string }): Promise<{
  pick: { book: CoverBook; row: Record<string, unknown> } | null;
  held: Array<{ book: string; id: unknown; reason: string; checked: boolean }>;
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
  const held: Array<{ book: string; id: unknown; reason: string; checked: boolean }> = [];
  let newChecks = 0;
  for (const book of order) {
    const { data, error } = await o.supabase.from(book.table).select("*")
      .eq("status", "approved").is("posted_at", null)
      .order("created_at", { ascending: true }).limit(COVER_READ_LIMIT);
    if (error) throw new Error(`Reading ${book.table}: ${error.message}`);
    for (const row of Array.isArray(data) ? data : []) {
      let verdict: { allowed: boolean; reason: string; checked?: boolean };
      try {
        verdict = await o.gate(book, row, { mayCheck: newChecks < MAX_NEW_COVER_CHECKS });
      } catch (e) {
        verdict = { allowed: false, reason: `the Krishna check failed: ${String(e)}`, checked: true };
      }
      if (verdict.checked) newChecks++;
      if (verdict.allowed) return { pick: { book, row }, held };
      held.push({ book: book.key, id: row.id, reason: verdict.reason, checked: !!verdict.checked });
    }
  }
  return { pick: null, held };
}
