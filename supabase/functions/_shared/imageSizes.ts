// Image sizes for the Together renders: PURE, no imports, no Deno globals, so it
// runs unchanged under Deno and under node --experimental-strip-types.
//
// The Image Playground configuration (image_gen_config) has one fallback size,
// fallback_width x fallback_height, made for the portrait scene images. A render of
// another shape (a landscape chapter cover, an Instagram post) that falls back to
// the fallback model keeps its own shape at that size's scale. Chapter covers and
// Instagram posts each had their own rule for this, and they drifted apart: the
// Gita covers fell back at 4:3 while regenerate-chapter-art kept the cover's shape
// for the same queue, and Instagram fallbacks stayed 1024 wide whatever size was
// configured. Every writer uses this one rule now.

/**
 * The fallback size for a w x h render: the long side is the long side of the
 * configured fallback size (1024 when none is set), the other side follows the
 * render's proportions, rounded to a multiple of 32 and at least 256. A 1344x1088
 * cover with a 768x1024 fallback size falls back at 1024x832, a 1344x768 Instagram
 * post with an 832x1216 one at 1216x704.
 */
export function fallbackSizeFor(w: unknown, h: unknown, fallbackW: unknown, fallbackH: unknown): { w: number; h: number } {
  const px = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
  const long = Math.max(px(fallbackW), px(fallbackH)) || 1024;
  const width = px(w);
  const height = px(h);
  if (!width || !height) return { w: long, h: long };
  const scaled = (side: number, of: number) => Math.max(256, Math.round((long * side) / of / 32) * 32);
  return width >= height ? { w: long, h: scaled(height, width) } : { w: scaled(width, height), h: long };
}
