// Instagram Reels (owner, 2026-10-30: "yes build the reels, i will send the audio").
//
// Instagram's API cannot put music on a photo post (Buffer's help says so too), so
// every painting goes to Instagram as a short Reel: the picture with a slow zoom
// over a blurred backdrop of itself and a Hare Krishna recording the owner holds
// the rights to. Reels are rendered outside the database (scripts/reels/, run by
// GitHub Actions) and stored next to the picture: reel_path, reel_url and
// reel_made_at on the row (migration 20261031000000). The file name carries a tag
// of the image it was rendered from, so a replaced picture is never sent with the
// old reel.
//
// instagramMedia() decides what the Instagram send carries:
//   - reels off (IG_REELS_ENABLED not "true"): the photo, as before;
//   - reels on and the row holds a reel for its current image: the reel;
//   - reels on and no reel yet: wait. A picture without its music is not sent.
//     Threads still takes the photo; the Instagram send is retried later (the
//     posting queue keeps the post, the daily cover's 10:00 catch-up re-sends it).
//
// Pure: no Deno globals, so tests and the Node renderer import it too.

export const REEL_PREFIX = "reels/";

/** Eight hex characters of FNV-1a over the image path: the reel's tie to its picture. */
export function imageTag(imagePath: unknown): string {
  const s = String(imagePath ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const SHORT: Record<string, string> = {
  ig_pending_review: "ig",
  gita_chapter_art_review: "gita",
  chaitanya_chapter_art_review: "chaitanya",
};

/** Where a reel for this row's current image lives in the instagram-images bucket. */
export function reelFileName(table: string, id: unknown, imagePath: string): string {
  return `${REEL_PREFIX}${SHORT[table] ?? table}-${String(id)}-${imageTag(imagePath)}.mp4`;
}

/** Whether this reel was rendered from this image. */
export function isReelFor(reelPath: unknown, imagePath: unknown): boolean {
  if (typeof reelPath !== "string" || typeof imagePath !== "string" || !imagePath) return false;
  return reelPath.endsWith(`-${imageTag(imagePath)}.mp4`);
}

export function reelsEnabled(env: (key: string) => string | undefined): boolean {
  return env("IG_REELS_ENABLED") === "true";
}

export interface MediaRow {
  image_url?: unknown;
  image_path?: unknown;
  reel_url?: unknown;
  reel_path?: unknown;
}

export type InstagramMedia =
  | { kind: "reel"; asset: { video: { url: string } }; type: "reel" }
  | { kind: "photo"; asset: { image: { url: string } }; type: "post" }
  | { kind: "wait"; reason: string };

/** What the Instagram send carries for this row: its reel, its photo, or nothing yet. */
export function instagramMedia(row: MediaRow, o: { reelsEnabled: boolean }): InstagramMedia {
  const imageUrl = typeof row.image_url === "string" ? row.image_url : "";
  if (!o.reelsEnabled) return { kind: "photo", asset: { image: { url: imageUrl } }, type: "post" };
  if (typeof row.reel_url === "string" && row.reel_url && isReelFor(row.reel_path, row.image_path)) {
    return { kind: "reel", asset: { video: { url: row.reel_url } }, type: "reel" };
  }
  return { kind: "wait", reason: "waiting for its reel (the video with the Hare Krishna recording is not rendered yet)" };
}
