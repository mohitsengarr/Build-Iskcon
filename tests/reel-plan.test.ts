// scripts/reels/reelPlan.ts (owner, 2026-10-30: "yes build the reels, i will send
// the audio"): which pictures get a reel, and the ffmpeg commands that make one.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { compositeArgs, planReels, REEL, reelRefusal, reelsPerRun, videoArgs } from "../scripts/reels/reelPlan.ts";
import { reelFileName } from "../supabase/functions/_shared/instagramMedia.ts";

const IMG = "ig-canto10-ch35-1792527961662.jpg";
const krishna = { version: 1, image_path: IMG, krishna_visible: true, form: "krishna", prominence: "main", observed: "", model: "m", checked_at: "2026-10-30T00:00:00Z" };
const post = (extra: Record<string, unknown> = {}) => ({ id: 810, status: "approved", image_url: `https://x/${IMG}`, image_path: IMG, reel_path: null, krishna_check: krishna, repost_requested_at: "2026-10-21T18:00:00Z", ...extra });
const cover = (extra: Record<string, unknown> = {}) => ({ id: 51, status: "approved", image_url: `https://x/${IMG}`, image_path: IMG, reel_path: null, krishna_check: krishna, posted_at: null, error_message: null, ...extra });

describe("ffmpeg commands", () => {
  test("the composite: painting over a blurred copy of itself at twice the output size, one frame", () => {
    const a = compositeArgs("in.jpg", "composite.png");
    const graph = a[a.indexOf("-filter_complex") + 1];
    assert.equal(a[a.indexOf("-i") + 1], "in.jpg");
    assert.equal(a.at(-1), "composite.png");
    assert.match(graph, /scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,gblur/);
    assert.match(graph, /scale=1944:-2:force_original_aspect_ratio=decrease\[fg\]/);
    assert.match(graph, /\[bg\]\[fg\]overlay=\(W-w\)\/2:\(H-h\)\/2/);
    assert.deepEqual(a.slice(a.indexOf("-frames:v"), a.indexOf("-frames:v") + 2), ["-frames:v", "1"]);
  });

  test("the video: a 12 second slow zoom at 30 fps, 1080x1920, the recording faded in and out, an MP4 Instagram takes", () => {
    const a = videoArgs("composite.png", "hare-krishna.mp3", "reel.mp4");
    const graph = a[a.indexOf("-filter_complex") + 1];
    assert.match(graph, /zoompan=z='min\(zoom\+0\.00025,1\.09\)':d=360:.*:s=1080x1920:fps=30,format=yuv420p\[v\]/);
    assert.match(graph, /\[1:a\]atrim=0:12,afade=t=in:st=0:d=1,afade=t=out:st=10\.5:d=1\.5\[a\]/);
    assert.deepEqual(a.slice(a.indexOf("-t"), a.indexOf("-t") + 2), ["-t", "12"]);
    assert.ok(a.includes("libx264") && a.includes("aac") && a.includes("+faststart") && a.includes("-shortest"));
    assert.deepEqual(a.slice(a.indexOf("-ss"), a.indexOf("-ss") + 4), ["-ss", "0", "-i", "hare-krishna.mp3"]);
    assert.equal(a.at(-1), "reel.mp4");
  });

  test("a longer reel and a later start in the recording", () => {
    const a = videoArgs("c.png", "a.mp3", "r.mp4", { seconds: 15, audioOffset: 30 });
    assert.match(a[a.indexOf("-filter_complex") + 1], /d=450:/);
    assert.match(a[a.indexOf("-filter_complex") + 1], /atrim=0:15,.*st=13\.5:d=1\.5/);
    assert.deepEqual(a.slice(a.indexOf("-ss"), a.indexOf("-ss") + 2), ["-ss", "30"]);
    assert.equal(REEL.seconds, 12);
  });
});

describe("reelRefusal", () => {
  test("a queued, approved post with Krishna and no reel gets one; so does an unposted cover", () => {
    assert.equal(reelRefusal("post", post()), null);
    assert.equal(reelRefusal("cover", cover()), null);
  });

  test("a cover already on Instagram does not; one that failed on Instagram does", () => {
    assert.equal(reelRefusal("cover", cover({ posted_at: "2026-10-24T06:00:00Z" })), "already on Instagram");
    assert.equal(reelRefusal("cover", cover({ posted_at: "2026-10-24T06:00:00Z", error_message: "instagram: Error: Channel not found" })), null);
    assert.equal(reelRefusal("cover", cover({ posted_at: "2026-10-24T06:00:00Z", error_message: "threads: HTTP 500 | instagram: Error: waiting for its reel" })), null);
  });

  test("not queued, not approved, no image, has its reel, or no Krishna", () => {
    assert.equal(reelRefusal("post", post({ repost_requested_at: null })), "not queued for Instagram");
    assert.equal(reelRefusal("post", post({ status: "pending" })), "status pending");
    assert.equal(reelRefusal("post", post({ image_url: "" })), "no image");
    assert.equal(reelRefusal("post", post({ reel_path: reelFileName("ig_pending_review", 810, IMG) })), "has its reel");
    assert.equal(reelRefusal("post", post({ reel_path: reelFileName("ig_pending_review", 810, "older.jpg") })), null, "a reel for an older image is not this image's reel");
    assert.match(String(reelRefusal("post", post({ krishna_check: { ...krishna, krishna_visible: false, form: "none", prominence: "none" } }))), /^no Krishna: /);
    assert.match(String(reelRefusal("post", post({ krishna_check: null }))), /not been checked/);
    assert.equal(reelRefusal("post", null), "not found");
  });
});

describe("planReels", () => {
  test("keeps the order given, stops at the limit, and says why the rest are held", () => {
    const out = planReels([
      { table: "ig_pending_review", kind: "post", row: post({ id: 1 }) },
      { table: "ig_pending_review", kind: "post", row: post({ id: 2, repost_requested_at: null }) },
      { table: "gita_chapter_art_review", kind: "cover", row: cover({ id: 3 }) },
      { table: "gita_chapter_art_review", kind: "cover", row: cover({ id: 4 }) },
    ], 2);
    assert.deepEqual(out.make.map((m) => [m.table, m.row.id, m.path]), [
      ["ig_pending_review", 1, reelFileName("ig_pending_review", 1, IMG)],
      ["gita_chapter_art_review", 3, reelFileName("gita_chapter_art_review", 3, IMG)],
    ]);
    assert.deepEqual(out.held, [{ table: "ig_pending_review", id: 2, reason: "not queued for Instagram" }]);
  });

  test("reelsPerRun: six unless asked, never more than 25", () => {
    assert.equal(reelsPerRun(undefined), 6);
    assert.equal(reelsPerRun("10"), 10);
    assert.equal(reelsPerRun(100), 25);
    assert.equal(reelsPerRun("x"), 6);
  });
});
