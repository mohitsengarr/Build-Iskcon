// The colour of the page behind the 3D temple, in the form the GPU wants it.
//
// The temple's last post-processing pass composites the finished frame onto the
// card it sits in. Post effects over a transparent canvas are ill-defined at the
// edges: bloom adds light to pixels whose alpha is zero, and the browser then
// composites those "brighter than their own alpha" pixels as extra light — which
// drew a white halo off the sunlit plinth and a grey veil over the contact
// shadow's soft fringe. Flattening onto the real page colour inside the GPU
// hands the browser fully opaque, correctly blended pixels instead.
//
// Effects run in linear light, before the final sRGB encode, so the page colour
// has to be converted to linear; and it is read from the page rather than
// written down, so it stays right on every card the temple appears on.

export type Rgb = [number, number, number];

/** One sRGB channel, 0-1, to linear light. The piecewise sRGB transfer function. */
export function srgbChannelToLinear(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** sRGB 0-255 triple to linear 0-1. */
export function srgbToLinear([r, g, b]: Rgb): Rgb {
  return [srgbChannelToLinear(r / 255), srgbChannelToLinear(g / 255), srgbChannelToLinear(b / 255)];
}

export interface CssColor { rgb: Rgb; alpha: number }

/**
 * Read a computed CSS colour. Browsers report computed backgrounds as
 * "rgb(r, g, b)" or "rgba(r, g, b, a)" — and newer ones the space-separated
 * "rgb(r g b / a)" — so those are what this reads. Anything else is null.
 */
export function parseCssColor(value: unknown): CssColor | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i);
  if (!m) return null;
  const channels = [m[1], m[2], m[3]].map(Number);
  if (channels.some((n) => !Number.isFinite(n))) return null;
  let alpha = 1;
  if (m[4] !== undefined) {
    alpha = m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    if (!Number.isFinite(alpha)) return null;
  }
  return { rgb: channels.map((n) => Math.min(255, Math.max(0, n))) as Rgb, alpha: Math.min(1, Math.max(0, alpha)) };
}

/** The cream the temple's cards are painted in, for before the page has been read. */
export const DEFAULT_PAGE_RGB: Rgb = [251, 246, 238];

/**
 * The first fully opaque background found walking out from an element — what
 * actually shows behind the canvas. Semi-transparent layers are stepped over:
 * the opaque surface underneath them dominates what the eye sees.
 */
export function opaqueBackgroundBehind(
  start: { parentElement: unknown } | null,
  readBackground: (el: unknown) => string,
): Rgb {
  let el: unknown = start;
  for (let depth = 0; el && depth < 40; depth++) {
    const color = parseCssColor(readBackground(el));
    if (color && color.alpha >= 1) return color.rgb;
    el = (el as { parentElement: unknown }).parentElement;
  }
  return DEFAULT_PAGE_RGB;
}
