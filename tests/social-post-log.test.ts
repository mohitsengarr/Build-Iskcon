// _shared/socialPostLog.ts: every picture Buffer accepted, one row per channel;
// and _shared/bufferChannels.ts: Instagram posts go to mohit.bhaktigram since
// 2026-10-30, Threads to dailybhagwatham.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { logSocialPosts, postedSince } from "../supabase/functions/_shared/socialPostLog.ts";
import { BUFFER_INSTAGRAM_CHANNEL, BUFFER_THREADS_CHANNEL, bufferChannelIds } from "../supabase/functions/_shared/bufferChannels.ts";

function fakeDb(o: { rows?: Array<Record<string, unknown>>; insertError?: string; readError?: string; throws?: boolean } = {}) {
  const inserts: unknown[] = [];
  const reads: Array<{ eq: Array<[string, unknown]>; gte: Array<[string, unknown]>; limit: number }> = [];
  return {
    inserts,
    reads,
    from: (table: string) => {
      if (o.throws) throw new Error("network down");
      assert.equal(table, "social_post_log");
      const eq: Array<[string, unknown]> = [];
      const gte: Array<[string, unknown]> = [];
      let limit = Infinity;
      const q: Record<string, unknown> = {
        insert: async (rows: unknown) => (inserts.push(rows), { error: o.insertError ? { message: o.insertError } : null }),
        select: () => q,
        eq: (c: string, v: unknown) => (eq.push([c, v]), q),
        gte: (c: string, v: unknown) => (gte.push([c, v]), q),
        limit: async (n: number) => {
          limit = n;
          reads.push({ eq, gte, limit });
          if (o.readError) return { data: null, error: { message: o.readError } };
          const hit = (o.rows ?? []).filter((r) => eq.every(([c, v]) => r[c] === v) && gte.every(([c, v]) => String(r[c]) >= String(v)));
          return { data: hit.slice(0, n), error: null };
        },
      };
      return q;
    },
  };
}

describe("logSocialPosts", () => {
  test("logs one row per channel Buffer accepted", async () => {
    const db = fakeDb();
    await logSocialPosts(db, [
      { service: "instagram", source_table: "ig_pending_review", source_id: 7, buffer_post_id: "b1", image_url: "u" },
      { service: "threads", source_table: "ig_pending_review", source_id: 7, buffer_post_id: "b2", image_url: "u" },
    ]);
    assert.equal((db.inserts[0] as unknown[]).length, 2);
  });

  test("nothing accepted: nothing written", async () => {
    const db = fakeDb();
    await logSocialPosts(db, [{ service: "threads", source_table: "t", source_id: 1, buffer_post_id: "" }]);
    assert.deepEqual(db.inserts, []);
  });

  test("a failed write never fails the post: it is logged and the call returns", async () => {
    const lines: string[] = [];
    await logSocialPosts(fakeDb({ insertError: "permission denied" }), [{ service: "threads", source_table: "t", source_id: 1, buffer_post_id: "b" }], (l) => lines.push(l));
    await logSocialPosts(fakeDb({ throws: true }), [{ service: "threads", source_table: "t", source_id: 1, buffer_post_id: "b" }], (l) => lines.push(l));
    assert.equal(lines.length, 2);
    assert.match(lines[0], /permission denied/);
  });
});

describe("postedSince", () => {
  const rows = [{ service: "threads", source_table: "ig_pending_review", source_id: 7, created_at: "2026-10-30T05:00:00Z" }];

  test("a picture on the channel since then: true", async () => {
    assert.equal(await postedSince(fakeDb({ rows }), { service: "threads", since: "2026-10-29T17:00:00Z" }), true);
  });

  test("none since then, or on another channel: false", async () => {
    assert.equal(await postedSince(fakeDb({ rows }), { service: "threads", since: "2026-10-30T06:00:00Z" }), false);
    assert.equal(await postedSince(fakeDb({ rows }), { service: "instagram", since: "2026-10-29T00:00:00Z" }), false);
  });

  test("narrowed to one post's picture", async () => {
    const db = fakeDb({ rows });
    assert.equal(await postedSince(db, { service: "threads", since: "2026-10-01T00:00:00Z", source_table: "ig_pending_review", source_id: 8 }), false);
    assert.deepEqual(db.reads[0].eq, [["service", "threads"], ["source_table", "ig_pending_review"], ["source_id", 8]]);
  });

  test("a log that cannot be read is unknown (null), not no", async () => {
    assert.equal(await postedSince(fakeDb({ readError: "timeout" }), { service: "threads", since: "x" }), null);
    assert.equal(await postedSince(fakeDb({ throws: true }), { service: "threads", since: "x" }), null);
  });
});

describe("bufferChannelIds", () => {
  test("Instagram goes to mohit.bhaktigram and Threads to dailybhagwatham by default", () => {
    assert.equal(BUFFER_INSTAGRAM_CHANNEL, "6adc337f778b240e2fa98c02");
    assert.equal(BUFFER_THREADS_CHANNEL, "69db52c2031bfa423cf5ddc7");
    assert.deepEqual(bufferChannelIds(() => undefined), { instagram: BUFFER_INSTAGRAM_CHANNEL, threads: BUFFER_THREADS_CHANNEL });
  });

  test("the env still overrides each channel", () => {
    const env: Record<string, string> = { BUFFER_INSTAGRAM_CHANNEL_ID: "ig-x", BUFFER_THREADS_CHANNEL_ID: "th-y" };
    assert.deepEqual(bufferChannelIds((k) => env[k]), { instagram: "ig-x", threads: "th-y" });
  });
});
