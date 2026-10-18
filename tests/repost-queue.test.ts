// _shared/repostQueue.ts: replaced Instagram posts are posted again a little at
// a time, oldest first, and leave the queue once Instagram took them.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PER_RUN, postsPerRun, runRepostQueue } from "../supabase/functions/_shared/repostQueue.ts";

const NOW = new Date("2026-10-20T06:00:00.000Z");

function fakeDb(rows: Array<Record<string, unknown>>) {
  const reads: Array<{ limit: number }> = [];
  return {
    rows,
    reads,
    from: () => {
      const eqs: Array<[string, unknown]> = [];
      let notNull: string | null = null;
      let limit = Infinity;
      let update: Record<string, unknown> | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => (eqs.push([c, v]), q),
        not: (c: string) => ((notNull = c), q),
        order: () => q,
        limit: (n: number) => ((limit = n), q),
        update: (v: Record<string, unknown>) => ((update = v), q),
        then: (res: (v: unknown) => unknown) => {
          let hit = rows.filter((r) => eqs.every(([c, v]) => r[c] === v) && (notNull === null || r[notNull] != null));
          if (!update) {
            reads.push({ limit });
            hit = [...hit].sort((a, b) => String(a.repost_requested_at).localeCompare(String(b.repost_requested_at))).slice(0, limit);
            return Promise.resolve({ data: hit.map((r) => ({ id: r.id, chapter_title: r.chapter_title, repost_requested_at: r.repost_requested_at })), error: null }).then(res);
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
    const out = await runRepostQueue({ supabase: db, republish: async (id, s) => (calls.push(`${id}:${s}`), { ok: true, detail: "ok" }), now: () => NOW });
    // Assert
    assert.deepEqual(calls, ["2:instagram", "2:threads"]);
    assert.equal(out.runs[0].done, true);
    assert.equal(db.rows[1].repost_requested_at, null);
    assert.equal(db.rows[1].reposted_at, "2026-10-20T06:00:00.000Z");
    assert.equal(db.rows[0].repost_requested_at, "2026-10-19T10:00:00.000Z", "the next one waits for the next run");
  });

  test("a post Instagram did not take stays queued for the next run, even when Threads took it", async () => {
    // Arrange
    const db = fakeDb(queued());
    // Act
    const out = await runRepostQueue({ supabase: db, republish: async (_id, s) => ({ ok: s === "threads", detail: s === "threads" ? "ok" : "Buffer: expired" }), now: () => NOW });
    // Assert
    assert.equal(out.runs[0].done, false);
    assert.equal(db.rows[1].repost_requested_at, "2026-10-19T09:00:00.000Z");
    assert.equal(out.runs[0].channels.instagram.detail, "Buffer: expired");
  });

  test("a channel that throws is recorded and the run goes on", async () => {
    // Arrange
    const db = fakeDb(queued());
    // Act
    const out = await runRepostQueue({ supabase: db, republish: async (_id, s) => { if (s === "threads") throw new Error("down"); return { ok: true, detail: "ok" }; }, now: () => NOW });
    // Assert
    assert.equal(out.runs[0].done, true);
    assert.deepEqual(out.runs[0].channels.threads, { ok: false, detail: "Error: down" });
  });

  test("preview lists what would be posted and posts nothing", async () => {
    // Arrange
    const db = fakeDb(queued());
    let called = 0;
    // Act
    const out = await runRepostQueue({ supabase: db, republish: async () => (called++, { ok: true, detail: "" }), preview: true, limit: 2 });
    // Assert
    assert.deepEqual(out.queued.map((q) => q.id), [2, 1]);
    assert.equal(called, 0);
    assert.deepEqual(out.runs, []);
  });

  test("an empty queue posts nothing", async () => {
    const db = fakeDb([{ id: 3, status: "approved", repost_requested_at: null }]);
    const out = await runRepostQueue({ supabase: db, republish: async () => { throw new Error("must not post"); } });
    assert.deepEqual(out, { queued: [], runs: [] });
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
