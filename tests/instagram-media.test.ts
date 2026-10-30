// _shared/instagramMedia.ts (owner, 2026-10-30: "yes build the reels"): what the
// Instagram send carries — the reel for the row's current image, the photo while
// reels are off, or nothing yet (wait) so no picture goes out without its music.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { imageTag, instagramMedia, isReelFor, reelFileName, reelsEnabled } from "../supabase/functions/_shared/instagramMedia.ts";

const IMG = "ig-canto10-ch35-1792527961662.jpg";

describe("the reel's tie to its image", () => {
  test("imageTag is eight hex characters, stable, and differs between images", () => {
    assert.match(imageTag(IMG), /^[0-9a-f]{8}$/);
    assert.equal(imageTag(IMG), imageTag(IMG));
    assert.notEqual(imageTag(IMG), imageTag("ig-canto10-ch35-1792527961663.jpg"));
  });

  test("reelFileName lives under reels/ and names table, row and image", () => {
    assert.equal(reelFileName("ig_pending_review", 810, IMG), `reels/ig-810-${imageTag(IMG)}.mp4`);
    assert.equal(reelFileName("gita_chapter_art_review", 51, "g.jpg"), `reels/gita-51-${imageTag("g.jpg")}.mp4`);
  });

  test("isReelFor: only a reel rendered from this very image counts", () => {
    assert.equal(isReelFor(reelFileName("ig_pending_review", 810, IMG), IMG), true);
    assert.equal(isReelFor(reelFileName("ig_pending_review", 810, "older.jpg"), IMG), false);
    assert.equal(isReelFor(null, IMG), false);
    assert.equal(isReelFor("reels/ig-810-abcdef01.mp4", ""), false);
  });
});

describe("instagramMedia", () => {
  const row = (extra: Record<string, unknown> = {}) => ({ image_url: `https://x/${IMG}`, image_path: IMG, reel_path: null, reel_url: null, ...extra });

  test("reels off: the photo, as a post", () => {
    assert.deepEqual(instagramMedia(row(), { reelsEnabled: false }), { kind: "photo", asset: { image: { url: `https://x/${IMG}` } }, type: "post" });
  });

  test("reels on with a reel for the current image: the reel, as a reel", () => {
    const path = reelFileName("ig_pending_review", 810, IMG);
    const out = instagramMedia(row({ reel_path: path, reel_url: `https://x/${path}` }), { reelsEnabled: true });
    assert.deepEqual(out, { kind: "reel", asset: { video: { url: `https://x/${path}` } }, type: "reel" });
  });

  test("reels on without a reel, or with one for an older image: wait", () => {
    assert.equal(instagramMedia(row(), { reelsEnabled: true }).kind, "wait");
    const stale = reelFileName("ig_pending_review", 810, "older.jpg");
    const out = instagramMedia(row({ reel_path: stale, reel_url: `https://x/${stale}` }), { reelsEnabled: true });
    assert.equal(out.kind, "wait");
    assert.match((out as { reason: string }).reason, /waiting for its reel/);
  });

  test("the switch is IG_REELS_ENABLED=true, nothing else", () => {
    assert.equal(reelsEnabled(() => "true"), true);
    assert.equal(reelsEnabled(() => "1"), false);
    assert.equal(reelsEnabled(() => undefined), false);
  });
});
