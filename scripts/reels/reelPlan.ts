// The Reel renderer's pure parts: which pictures need a reel, and the ffmpeg
// commands that make one (owner, 2026-10-30: "yes build the reels, i will send
// the audio"). make-reels.ts runs these; tests/reel-plan.test.ts covers them.
//
// A reel is 12 seconds at 30 fps, 1080x1920: the painting fitted inside a
// blurred, darkened copy of itself, zooming in slowly, with the owner's Hare
// Krishna recording faded in and out. Two ffmpeg passes: a still composite at
// twice the output size (so the zoom has pixels to spare and does not shimmer),
// then the zoom and the audio into an MP4 Instagram accepts (H.264, AAC,
// faststart).

import { isReelFor, reelFileName } from "../../supabase/functions/_shared/instagramMedia.ts";
import { krishnaAllowed } from "../../supabase/functions/_shared/krishnaCheckCore.ts";

export const REEL = {
  seconds: 12,
  fps: 30,
  width: 1080,
  height: 1920,
  compositeWidth: 2160,
  compositeHeight: 3840,
  /** The painting's width inside the composite: 90% of it, so the blurred edge shows. */
  paintingWidth: 1944,
  zoomStep: 0.00025,
  zoomMax: 1.09,
  audioFadeIn: 1,
  audioFadeOut: 1.5,
} as const;

export type ReelKind = "post" | "cover";
export const REEL_TABLES: ReadonlyArray<{ table: string; kind: ReelKind }> = [
  { table: "ig_pending_review", kind: "post" },
  { table: "gita_chapter_art_review", kind: "cover" },
  { table: "chaitanya_chapter_art_review", kind: "cover" },
];

/** Pass 1: the still composite, the painting over a blurred, darkened copy of itself. */
export function compositeArgs(input: string, out: string): string[] {
  const { compositeWidth: W, compositeHeight: H, paintingWidth } = REEL;
  const graph = [
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=45,eq=brightness=-0.18:saturation=0.85[bg]`,
    `[0:v]scale=${paintingWidth}:-2:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2:format=auto`,
  ].join(";");
  return ["-y", "-loglevel", "error", "-i", input, "-filter_complex", graph, "-frames:v", "1", out];
}

/** Pass 2: the slow zoom over the composite with the recording, as an MP4 for Instagram. */
export function videoArgs(composite: string, audio: string, out: string, o: { seconds?: number; audioOffset?: number } = {}): string[] {
  const seconds = o.seconds ?? REEL.seconds;
  const frames = Math.round(seconds * REEL.fps);
  const offset = Math.max(0, o.audioOffset ?? 0);
  const fadeOutAt = Math.max(0, seconds - REEL.audioFadeOut);
  const graph = [
    `[0:v]zoompan=z='min(zoom+${REEL.zoomStep},${REEL.zoomMax})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${REEL.width}x${REEL.height}:fps=${REEL.fps},format=yuv420p[v]`,
    `[1:a]atrim=0:${seconds},afade=t=in:st=0:d=${REEL.audioFadeIn},afade=t=out:st=${fadeOutAt}:d=${REEL.audioFadeOut}[a]`,
  ].join(";");
  return [
    "-y", "-loglevel", "error",
    "-i", composite,
    "-ss", String(offset), "-i", audio,
    "-filter_complex", graph,
    "-map", "[v]", "-map", "[a]",
    "-t", String(seconds),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", String(REEL.fps),
    "-c:a", "aac", "-b:a", "160k",
    "-shortest", "-movflags", "+faststart",
    out,
  ];
}

export interface ReelRow {
  id: unknown;
  status?: unknown;
  image_url?: unknown;
  image_path?: unknown;
  reel_path?: unknown;
  krishna_check?: unknown;
  repost_requested_at?: unknown;
  posted_at?: unknown;
  error_message?: unknown;
}

/**
 * Why this row gets no reel now, or null when it should have one: an approved
 * picture with Krishna in it that Instagram is still to receive (a queued post; a
 * cover not posted yet, or posted but failed on Instagram) and has no reel for its
 * current image.
 */
export function reelRefusal(kind: ReelKind, row: ReelRow | null | undefined): string | null {
  if (!row) return "not found";
  if (row.status !== "approved") return `status ${String(row.status)}`;
  if (typeof row.image_url !== "string" || !row.image_url || typeof row.image_path !== "string" || !row.image_path) return "no image";
  if (kind === "post" && row.repost_requested_at == null) return "not queued for Instagram";
  if (kind === "cover" && row.posted_at != null && !/(^|\|\s*)instagram:/i.test(String(row.error_message ?? ""))) return "already on Instagram";
  if (isReelFor(row.reel_path, row.image_path)) return "has its reel";
  const k = krishnaAllowed(row.krishna_check, row.image_path);
  if (!k.allowed) return `no Krishna: ${k.reason}`;
  return null;
}

export interface ReelCandidate {
  table: string;
  kind: ReelKind;
  row: ReelRow;
}

/** The rows to render this run, in the order given (posts first, then covers), up to `limit`. */
export function planReels(candidates: ReelCandidate[], limit: number): {
  make: Array<ReelCandidate & { path: string }>;
  held: Array<{ table: string; id: unknown; reason: string }>;
} {
  const make: Array<ReelCandidate & { path: string }> = [];
  const held: Array<{ table: string; id: unknown; reason: string }> = [];
  for (const c of candidates) {
    const refusal = reelRefusal(c.kind, c.row);
    if (refusal) {
      held.push({ table: c.table, id: c.row.id, reason: refusal });
      continue;
    }
    if (make.length >= limit) break;
    make.push({ ...c, path: reelFileName(c.table, c.row.id, String(c.row.image_path)) });
  }
  return { make, held };
}

/** How many reels a run renders: 6 unless asked, never more than 25. */
export function reelsPerRun(limit: unknown): number {
  const n = typeof limit === "string" ? Number(limit) : typeof limit === "number" ? limit : NaN;
  if (!Number.isInteger(n) || n < 1) return 6;
  return Math.min(25, n);
}
