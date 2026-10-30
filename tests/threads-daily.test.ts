// _shared/threadsDaily.ts (owner, 2026-10-30): at least one picture on Threads
// every day. When none went out in 24 hours, the usual posting steps run once
// more, one at a time, until one is on Threads; a log it cannot read means do
// nothing, never a double post.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ensureDailyThreadsImage } from "../supabase/functions/_shared/threadsDaily.ts";

const quiet = () => {};

describe("ensureDailyThreadsImage", () => {
  test("a picture already went to Threads today: nothing runs", async () => {
    let ran = 0;
    const out = await ensureDailyThreadsImage({ postedRecently: async () => true, steps: [{ name: "queue", run: async () => ran++ }], log: quiet });
    assert.deepEqual(out, { outcome: "already_posted", tried: [] });
    assert.equal(ran, 0);
  });

  test("none today: the queue runs once, and a post from it ends the run", async () => {
    // Arrange: the queue posts to Threads
    let posted = false;
    const ran: string[] = [];
    // Act
    const out = await ensureDailyThreadsImage({
      postedRecently: async () => posted,
      steps: [
        { name: "posting queue", run: async () => { ran.push("queue"); posted = true; } },
        { name: "daily cover", run: async () => { ran.push("cover"); } },
      ],
      log: quiet,
    });
    // Assert
    assert.deepEqual(out, { outcome: "posted", via: "posting queue", tried: ["posting queue"] });
    assert.deepEqual(ran, ["queue"], "the cover is not posted as well");
  });

  test("the queue had nothing: the daily cover runs next", async () => {
    let posted = false;
    const out = await ensureDailyThreadsImage({
      postedRecently: async () => posted,
      steps: [{ name: "posting queue", run: async () => {} }, { name: "daily cover", run: async () => { posted = true; } }],
      log: quiet,
    });
    assert.deepEqual(out, { outcome: "posted", via: "daily cover", tried: ["posting queue", "daily cover"] });
  });

  test("a step that throws is logged and the next step still runs", async () => {
    let posted = false;
    const lines: string[] = [];
    const out = await ensureDailyThreadsImage({
      postedRecently: async () => posted,
      steps: [{ name: "posting queue", run: async () => { throw new Error("HTTP 500"); } }, { name: "daily cover", run: async () => { posted = true; } }],
      log: (l) => lines.push(l),
    });
    assert.equal(out.outcome, "posted");
    assert.match(lines[0], /posting queue failed: Error: HTTP 500/);
  });

  test("no picture with Krishna anywhere: says so, after trying each step once", async () => {
    const lines: string[] = [];
    const out = await ensureDailyThreadsImage({ postedRecently: async () => false, steps: [{ name: "a", run: async () => {} }, { name: "b", run: async () => {} }], log: (l) => lines.push(l) });
    assert.deepEqual(out, { outcome: "nothing_to_post", tried: ["a", "b"] });
    assert.match(lines.at(-1)!, /no picture with Krishna/);
  });

  test("a post log it cannot read: nothing is posted", async () => {
    let ran = 0;
    const out = await ensureDailyThreadsImage({ postedRecently: async () => null, steps: [{ name: "queue", run: async () => ran++ }], log: quiet });
    assert.deepEqual(out, { outcome: "unknown", tried: [] });
    assert.equal(ran, 0);
  });
});
