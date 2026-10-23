// _shared/repostQueue.ts: replaced Instagram posts are posted again a little at
// a time, oldest first, and leave the queue once Instagram took them. Only posts
// the Krishna gate lets through go out (owner, 2026-10-23); the others are skipped
// and stay queued.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { type Gate, MAX_EXAMINED, MAX_PER_RUN, postsPerRun, runRepostQueue } from "../supabase/functions/_shared/repostQueue.ts";

const NOW = new Date("2026-10-20T06:00:00.000Z");
const allowAll: Gate = async () => ({ allowed: true, reason: "Krishna is in the picture" });

function fakeDb(rows: Array<Record<string, unknown>>) {
  const reads: Array<{ limit: number }> = [];
  return {
    rows,
    reads,
    from: () => {
      const eqs: Array<[string, unknown]> = [];
      const notNull: string[] = [];
      const isNull: string[] = [];
      let limit = Infinity;
      let update: Record<string, unknown> | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => (eqs.push([c, v]), q),
        not: (c: string) => (notNull.push(c), q),
        is: (c: string) => (isNull.push(c), q),
        order: () => q,
        limit: (n: number) => ((limit = n), q),
        update: (v: Record<string, unknown>) => ((update = v), q),
        then: (res: (v: unknown) => unknown) => {
          let hit = rows.filter((r) => eqs.every(([c, v]) => r[c] === v) && notNull.every((c) => r[c] != null) && isNull.every((c) => r[c] == null));
          if (!update) {
            reads.push({ limit });
            hit = [...hit].sort((a, b) => String(a.repost_requested_at).localeCompare(String(b.repost_requested_at))).slice(0, limit);
            return Promise.resolve({ data: hit.map((r) => ({ ...r })), error: null }).then(res);
          }
          for (const r of hit) Object.assign(r, update);
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(res);
        },
      };
      return q;
    },
  };
}

const queued = () => [
  { id: 1, status: "approved", chapter_title: "A", repost_requested_at: "2026-10-19T10:00:00.000Z", reposted_at: null },
  { id: 2, status: "approved", chapter_title: "B", repost_requested_at: "2026-10-19T09:00:00.000Z", reposted_at: null },
  { id: 3, status: "approved", chapter_title: "C", repost_requested_at: null, reposted_at: null },
];

describe("runRepostQueue", () => {
  test("posts the oldest queued post again, Instagram then Threads, and takes it off the queue", async () => {
    // Arrange
    const db = fakeDb(queued());
    const calls: string[] = [];
    // Act
    const out = await runRepostQueue({ supabase: db, gate: allowAll, republish: async (id, s) => (calls.push(`${id}:${s}`), { ok: true, detail: "ok" }), now: () => NOW });
    // Assert
    assert.deepEqual(calls, ["2:instagram", "2:threads"]);
    assert.equal(out.runs[0].done, true);
    assert.equal(db.rows[1].repost_requested_at, null);
    assert.equal(db.rows[1].reposted_at, "2026-10-20T06:00:00.000Z");
    assert.equal(db.rows[0].repost_requested_at, "2026-10-19T10:00:00.000Z", "the next one waits for the next run");
  });

  test("a post never published goes ahead of reposts, however long the reposts have waited", async () => {
    // Arrange: two replaced posts queued yesterday, one new approval today
    const db = fakeDb([
      ...queued().map((r) => ({ ...r, buffer_post_ids: [{ service: "instagram", postId: "x" }] })),
      { id: 9, status: "approved", chapter_title: "New", repost_requested_at: "2026-10-20T05:00:00.000Z", buffer_post_ids: null },
    ]);
    const calls: string[] = [];
    // Act
    await runRepostQueue({ supabase: db, gate: allowAll, republish: async (id, s) => (calls.push(`${id}:${s}`), { ok: true, detail: "ok" }), now: () => NOW });
    // Assert
    assert.deepEqual(calls, ["9:instagram", "9:threads"]);
  });

  test("with no new post waiting, the oldest repost goes", async () => {
    // Arrange
    const db = fakeDb(queued().map((r) => ({ ...r, buffer_post_ids: [{ service: "instagram", postId: "x" }] })));
    // Act
    const out = await runRepostQueue({ supabase: db, gate: allowAll, republish: async () => ({ ok: true, detail: "ok" }), now: () => NOW });
    // Assert
    assert.deepEqual(out.runs.map((r) => r.id), [2]);
  });

  test("a post Instagram did not take stays queued for the next run, even when Threads took it", async () => {
    // Arrange
    const db = fakeDb(queued());
    // Act
    const out = await runRepostQueue({ supabase: db, gate: allowAll, republish: async (_id, s) => ({ ok: s === "threads", detail: s === "threads" ? "ok" : "Buffer: expired" }), now: () => NOW });
    // Assert
    assert.equal(out.runs[0].done, false);
    assert.equal(db.rows[1].repost_requested_at, "2026-10-19T09:00:00.000Z");
    assert.equal(out.runs[0].channels.instagram.detail, "Buffer: expired");
  });

  test("a channel that throws is recorded and the run goes on", async () => {
    // Arrange
    const db = fakeDb(queued());
    // Act
    const out = await runRepostQueue({ supabase: db, gate: allowAll, republish: async (_id, s) => { if (s === "threads") throw new Error("down"); return { ok: true, detail: "ok" }; }, now: () => NOW });
    // Assert
    assert.equal(out.runs[0].done, true);
    assert.deepEqual(out.runs[0].channels.threads, { ok: false, detail: "Error: down" });
  });

  test("preview lists what would be posted and posts nothing", async () => {
    // Arrange
    const db = fakeDb(queued());
    let called = 0;
    // Act
    const out = await runRepostQueue({ supabase: db, gate: allowAll, republish: async () => (called++, { ok: true, detail: "" }), preview: true, limit: 2 });
    // Assert
    assert.deepEqual(out.queued.map((q) => q.id), [2, 1]);
    assert.equal(called, 0);
    assert.deepEqual(out.runs, []);
  });

  test("an empty queue posts nothing", async () => {
    const db = fakeDb([{ id: 3, status: "approved", repost_requested_at: null }]);
    const out = await runRepostQueue({ supabase: db, gate: allowAll, republish: async () => { throw new Error("must not post"); } });
    assert.deepEqual(out, { queued: [], runs: [], held: [] });
  });
});

describe("the Krishna gate", () => {
  const withoutKrishna = (ids: number[]): Gate => async (post) =>
    ids.includes(post.id) ? { allowed: false, reason: "no Krishna in the picture" } : { allowed: true, reason: "Krishna is in the picture" };

  test("a post without Krishna is skipped, stays queued, and the next one goes in its place", async () => {
    // Arrange: #2 is oldest but shows no Krishna
    const db = fakeDb(queued());
    const calls: string[] = [];
    // Act
    const out = await runRepostQueue({ supabase: db, gate: withoutKrishna([2]), republish: async (id, s) => (calls.push(`${id}:${s}`), { ok: true, detail: "ok" }), now: () => NOW });
    // Assert
    assert.deepEqual(calls, ["1:instagram", "1:threads"]);
    assert.deepEqual(out.held, [{ id: 2, reason: "no Krishna in the picture" }]);
    assert.equal(db.rows[1].repost_requested_at, "2026-10-19T09:00:00.000Z", "the held post stays queued");
  });

  test("when no queued post has Krishna in it, nothing is posted", async () => {
    const db = fakeDb(queued());
    const out = await runRepostQueue({ supabase: db, gate: withoutKrishna([1, 2]), republish: async () => { throw new Error("must not post"); }, now: () => NOW });
    assert.deepEqual([out.queued, out.runs], [[], []]);
    assert.deepEqual(out.held.map((h) => h.id), [2, 1]);
  });

  test("a gate that throws holds the post back: it fails closed", async () => {
    const db = fakeDb(queued());
    const out = await runRepostQueue({ supabase: db, gate: async () => { throw new Error("Claude down"); }, republish: async () => { throw new Error("must not post"); }, now: () => NOW });
    assert.deepEqual(out.runs, []);
    assert.match(out.held[0].reason, /the Krishna check failed: Error: Claude down/);
  });

  test("the gate sees the post's image and its stored check", async () => {
    const db = fakeDb([{ id: 5, status: "approved", chapter_title: "A", repost_requested_at: "2026-10-19T10:00:00.000Z", image_path: "p.jpg", image_url: "u", krishna_check: { version: 1 } }]);
    const seen: unknown[] = [];
    await runRepostQueue({ supabase: db, gate: async (p) => (seen.push([p.image_path, p.image_url, p.krishna_check]), { allowed: false, reason: "x" }), republish: async () => ({ ok: true, detail: "" }) });
    assert.deepEqual(seen, [["p.jpg", "u", { version: 1 }]]);
  });

  test("a run looks at no more than MAX_EXAMINED posts, which bounds the checks it starts", async () => {
    // Arrange: 30 queued posts, none with Krishna
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, status: "approved", chapter_title: "x", repost_requested_at: `2026-10-19T${String(i).padStart(2, "0")}:00:00.000Z`, buffer_post_ids: null }));
    const db = fakeDb(rows);
    let gated = 0;
    // Act
    await runRepostQueue({ supabase: db, gate: async () => (gated++, { allowed: false, reason: "no Krishna" }), republish: async () => ({ ok: true, detail: "" }) });
    // Assert
    assert.equal(gated, MAX_EXAMINED);
  });

  test("preview lists only posts the gate lets through, and what it held back", async () => {
    const db = fakeDb(queued());
    const out = await runRepostQueue({ supabase: db, gate: withoutKrishna([2]), republish: async () => { throw new Error("must not post"); }, preview: true, limit: 2 });
    assert.deepEqual(out.queued.map((q) => q.id), [1]);
    assert.deepEqual(out.held.map((h) => h.id), [2]);
  });
});

describe("postsPerRun", () => {
  test("one a run unless asked, never more than the cap", () => {
    assert.equal(postsPerRun(undefined), 1);
    assert.equal(postsPerRun(2), 2);
    assert.equal(postsPerRun(50), MAX_PER_RUN);
    assert.equal(postsPerRun(0), 1);
    assert.equal(postsPerRun("3"), 1);
  });
});
