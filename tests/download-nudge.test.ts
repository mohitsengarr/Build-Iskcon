// daily-gita-quote/nudges.ts (Mohit, 30 Oct 2026: "these download messages should
// be sales style"): the reply under the day's verse on Threads sells the app, one
// line a day out of several, always under Threads' limit, always with the link.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { downloadNudge, NUDGES, nudgeIndex, PLAY_URL, THREADS_LIMIT } from "../supabase/functions/daily-gita-quote/nudges.ts";

describe("download nudge", () => {
  test("every line fits a Threads post with the link, ends by asking for the download, and sells a benefit", () => {
    for (const line of NUDGES) {
      const full = `${line}\n${PLAY_URL}`;
      assert.ok(full.length <= THREADS_LIMIT, `${full.length} chars`);
      assert.match(line, /:$/, "the line hands over to the link");
      assert.match(line, /Bhaktigram/);
      assert.match(line, /Free on Android|free Android/i, "the price is part of the pitch");
      assert.match(line, /[Dd]ownload|[Gg]et|[Ss]tart|[Tt]ap|[Oo]pen/, "a call to act");
      assert.doesNotMatch(line, /\d/, "no figures: none can be evidenced");
    }
  });

  test("the lines are distinct, and there are several", () => {
    assert.ok(NUDGES.length >= 6);
    assert.equal(new Set(NUDGES).size, NUDGES.length);
  });

  test("the nudge is a line, then the Play Store link on its own line", () => {
    const n = downloadNudge(new Date("2026-10-31T04:00:00Z"));
    const [line, link] = n.split("\n");
    assert.ok(NUDGES.includes(line));
    assert.equal(link, PLAY_URL);
    assert.match(PLAY_URL, /^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.buildiskcon\.bhaktigram$/);
  });

  test("rotates by day: consecutive days get different lines, every line gets a turn, the same day repeats itself", () => {
    const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n, 4));
    const seen = new Set<number>();
    for (let i = 0; i < NUDGES.length; i++) seen.add(nudgeIndex(day(i)));
    assert.equal(seen.size, NUDGES.length);
    assert.notEqual(nudgeIndex(day(0)), nudgeIndex(day(1)));
    assert.equal(downloadNudge(new Date("2026-11-03T04:00:00Z")), downloadNudge(new Date("2026-11-03T16:00:00Z")), "a retry later the same day says the same thing");
  });
});
