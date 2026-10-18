// The row the Image Playground's "Approve config" saves to image_gen_config.
//
// Every image function reads the active row on each request — Gita, Bhagavatam
// and Chaitanya covers, Instagram posts, reader scenes — so whatever this row
// leaves out, they all fall back on. Approving once dropped the Instagram and
// cover sizes (the form never showed them), and every feed post and book cover
// after it came out portrait. Those sizes are carried from the configuration
// being approved, or set to the production shapes when it has none.

export interface GenConfigDraft {
  label?: string | null;
  model: string;
  width: number;
  height: number;
  steps?: number | null;
  style_positives: string;
  style_negatives: string;
  extra_rules?: string | null;
  prompt_max_len: number;
  fallback_model?: string | null;
  fallback_width?: number | null;
  fallback_height?: number | null;
  ig_width?: number | null;
  ig_height?: number | null;
  cover_width?: number | null;
  cover_height?: number | null;
  notes?: string | null;
}

/**
 * Portrait feed posts and landscape book covers. A feed post is 4:5 (1088x1344),
 * the tallest Instagram shows in the feed uncropped (a 9:16 image is cut to 4:5
 * there); landscape 1344x768 posts were replaced on 2026-10-19 at the owner's
 * request.
 */
export const PRODUCTION_SIZES = {
  instagram: { w: 1088, h: 1344 },
  cover: { w: 1344, h: 1088 },
} as const;

/**
 * A size as a CSS aspect-ratio ("1088 / 1344"), so a frame shows the whole image
 * at the shape it is made: the Instagram review card shows exactly what is posted.
 */
export function aspectRatioCss(size: { w: number; h: number }): string {
  return `${size.w} / ${size.h}`;
}

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** Both sides of a size, or the fallback: never half a size. */
function sizeOr(w: unknown, h: unknown, fallback: { w: number; h: number }): { w: number; h: number } {
  const pw = positive(w);
  const ph = positive(h);
  return pw && ph ? { w: pw, h: ph } : { w: fallback.w, h: fallback.h };
}

export function approvalRow(cfg: GenConfigDraft, now: Date = new Date()) {
  const ig = sizeOr(cfg.ig_width, cfg.ig_height, PRODUCTION_SIZES.instagram);
  const cover = sizeOr(cfg.cover_width, cfg.cover_height, PRODUCTION_SIZES.cover);
  return {
    label: cfg.label || `Tuned ${now.toISOString().slice(0, 16).replace("T", " ")}`,
    model: cfg.model,
    width: cfg.width,
    height: cfg.height,
    steps: cfg.steps ?? null,
    style_positives: cfg.style_positives,
    style_negatives: cfg.style_negatives,
    extra_rules: cfg.extra_rules || "",
    prompt_max_len: cfg.prompt_max_len,
    fallback_model: cfg.fallback_model ?? null,
    fallback_width: cfg.fallback_width ?? null,
    fallback_height: cfg.fallback_height ?? null,
    ig_width: ig.w,
    ig_height: ig.h,
    cover_width: cover.w,
    cover_height: cover.h,
    is_active: true,
    notes: cfg.notes || null,
  };
}
