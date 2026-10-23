// _shared/coverPick.ts: daily-approved-art-post sends one approved, never-posted
// Gita or Chaitanya cover a run, alternating books, and only covers with Krishna
// in them (owner, 2026-10-23). A cover without Him is skipped, not posted.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { type CoverGate, MAX_COVERS_EXAMINED, pickNextCover } from "../supabase/functions/_shared/coverPick.ts";

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  const reads: Array<{ table: string; limit: number }> = [];
  return {
    reads,
    from: (table: string) => {
      const eqs: Array<[string, unknown]> = [];
      const isNull: string[] = [];
      const notNull: string[] = [];
      let head = false;
      let limit = Infinity;
      const q: Record<string, unknown> = {
        select: (_c: string, opts?: { head?: boolean }) => ((head = !!opts?.head), q),
        eq: (c: string, v: unknown) => (eqs.push([c, v]), q),
        is: (c: string) => (isNull.push(c), q),
        not: (c: string) => (notNull.push(c), q),
        order: () => q,
        limit: (n: number) => ((limit = n), q),
        then: (res: (v: unknown) => unknown) => {
          const rows = (tables[table] ?? []).filter((r) =>
            eqs.every(([c, v]) => r[c] === v) && isNull.every((c) => r[c] == null) && notNull.every((c) => r[c] != null)
          );
          if (head) return Promise.resolve({ count: rows.length, data: null, error: null }).then(res);
          reads.push({ table, limit });
          const sorted = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).slice(0, limit);
          return Promise.resolve({ data: sorted, error: null }).then(res);
        },
      };
      return q;
    },
  };
}

const cover = (id: number, created: string, extra: Row = {}) => ({ id, status: "approved", posted_at: null, created_at: created, ...extra });
const allow: CoverGate = async () => ({ allowed: true, reason: "Krishna is in the picture" });
const without = (ids: number[]): CoverGate => async (_b, row) =>
  ids.includes(row.id as number) ? { allowed: false, reason: "no Krishna in the picture" } : { allowed: true, reason: "ok" };

describe("pickNextCover", () => {
  test("picks the oldest unposted cover of the book with fewer posts", async () => {
    // Arrange: the Gita has 1 posted cover, the Chaitanya none
    const db = fakeDb({
      gita_chapter_art_review: [cover(1, "2026-10-01", { posted_at: "2026-10-02" }), cover(2, "2026-10-03")],
      chaitanya_chapter_art_review: [cover(10, "2026-10-05"), cover(11, "2026-10-04")],
    });
    // Act
    const { pick } = await pickNextCover({ supabase: db, gate: allow });
    // Assert
    assert.deepEqual([pick?.book.key, pick?.row.id], ["chaitanya", 11]);
  });

  test("a cover without Krishna is skipped and the next one is picked", async () => {
    const db = fakeDb({ gita_chapter_art_review: [cover(2, "2026-10-03"), cover(3, "2026-10-04")], chaitanya_chapter_art_review: [] });
    const { pick, held } = await pickNextCover({ supabase: db, gate: without([2]), bookKey: "gita" });
    assert.equal(pick?.row.id, 3);
    assert.deepEqual(held, [{ book: "gita", id: 2, reason: "no Krishna in the picture" }]);
  });

  test("when one book has no cover with Krishna, the other book's goes out", async () => {
    const db = fakeDb({ gita_chapter_art_review: [cover(2, "2026-10-03")], chaitanya_chapter_art_review: [cover(10, "2026-10-05")] });
    const { pick } = await pickNextCover({ supabase: db, gate: without([10]) });
    assert.deepEqual([pick?.book.key, pick?.row.id], ["gita", 2]);
  });

  test("no cover with Krishna anywhere: nothing is picked", async () => {
    const db = fakeDb({ gita_chapter_art_review: [cover(2, "2026-10-03")], chaitanya_chapter_art_review: [cover(10, "2026-10-05")] });
    const { pick, held } = await pickNextCover({ supabase: db, gate: without([2, 10]) });
    assert.equal(pick, null);
    assert.equal(held.length, 2);
  });

  test("a gate that throws holds the cover back: it fails closed", async () => {
    const db = fakeDb({ gita_chapter_art_review: [cover(2, "2026-10-03")], chaitanya_chapter_art_review: [] });
    const { pick, held } = await pickNextCover({ supabase: db, gate: async () => { throw new Error("Claude down"); }, bookKey: "gita" });
    assert.equal(pick, null);
    assert.match(held[0].reason, /Claude down/);
  });

  test("a run looks at no more than MAX_COVERS_EXAMINED covers per book", async () => {
    const many = Array.from({ length: 25 }, (_, i) => cover(100 + i, `2026-10-${String(i + 1).padStart(2, "0")}`));
    const db = fakeDb({ gita_chapter_art_review: many, chaitanya_chapter_art_review: [] });
    let gated = 0;
    await pickNextCover({ supabase: db, gate: async () => (gated++, { allowed: false, reason: "x" }), bookKey: "gita" });
    assert.equal(gated, MAX_COVERS_EXAMINED);
  });

  test("an unknown book is refused", async () => {
    await assert.rejects(pickNextCover({ supabase: fakeDb({}), gate: allow, bookKey: "ramayana" }), /unknown book/);
  });
});
