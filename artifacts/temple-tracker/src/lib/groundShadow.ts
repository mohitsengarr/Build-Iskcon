// The soft shadow the temple's base casts on the ground it stands on.
//
// drei's ContactShadows used to do this, by rendering the scene from below into
// a render target every frame. Through the post-processing pipeline that plane
// came out far more opaque than it does on its own, and drew a flat grey floor
// across the whole canvas on phones — removing it left the floor clean and
// proved it was the cause. This is the same cue built the plain way: one static
// texture on one transparent plane, which composites like any other material.
//
// A rounded square rather than a disc, because the base is a square plinth: a
// round blob would leave its four corners standing on nothing.

/**
 * Darkness at each pixel of a size×size tile, as alpha bytes, row by row.
 *
 * `half` is the plinth's half-width as a fraction of the tile (0-0.5): full
 * strength inside it. `falloff` is how far past the edge, in the same units,
 * the shadow takes to fade to nothing. `strength` is the alpha at full shadow.
 */
export function groundShadowTile(
  size: number,
  { half, falloff, strength }: { half: number; falloff: number; strength: number },
): Uint8ClampedArray {
  const n = Math.max(1, Math.floor(size));
  const out = new Uint8ClampedArray(n * n);
  const fade = Math.max(1e-6, falloff);
  const peak = Math.min(1, Math.max(0, strength));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Centre of the pixel, in -0.5..0.5 from the middle of the tile.
      const u = (x + 0.5) / n - 0.5;
      const v = (y + 0.5) / n - 0.5;
      // Distance outside a square of half-width `half`; zero inside it.
      const dx = Math.max(Math.abs(u) - half, 0);
      const dy = Math.max(Math.abs(v) - half, 0);
      const d = Math.hypot(dx, dy);
      const t = Math.min(1, d / fade);
      const smooth = t * t * (3 - 2 * t);
      out[y * n + x] = Math.round((1 - smooth) * peak * 255);
    }
  }
  return out;
}
