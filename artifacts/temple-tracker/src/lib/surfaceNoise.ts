// The grain under the temple's surfaces.
//
// Real stone and beaten gold are never uniformly smooth, and a perfectly even
// roughness is most of what made the 3D temple read as moulded plastic. This
// builds one small tile of value noise that the materials use as a roughness
// map: the stone keeps its colour, it just stops being glass-even.
//
// Seeded, so every visitor sees the same temple. An unseeded Math.random would
// have given each page load a slightly different surface — harmless, but it
// would also have made the thing impossible to test or to compare against a
// screenshot from yesterday.

/** The map MULTIPLIES roughness, so a dark tile would turn the temple into a mirror. */
export const MIN_ROUGHNESS_BYTE = 150;
export const MAX_ROUGHNESS_BYTE = 255;

/** Deterministic [0,1) generator — mulberry32. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smoothstep, so the lattice does not show as diamonds. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * One octave of value noise on an `n`x`n` lattice that wraps at the edges, so
 * the finished tile can repeat across a surface without a visible seam.
 */
export function latticeOctave(n: number, random: () => number): (x: number, y: number) => number {
  const grid: number[] = [];
  for (let i = 0; i < n * n; i++) grid.push(random());
  const at = (a: number, b: number) => grid[(((b % n) + n) % n) * n + (((a % n) + n) % n)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const sx = smooth(x - xi), sy = smooth(y - yi);
    const top = at(xi, yi) + sx * (at(xi + 1, yi) - at(xi, yi));
    const bottom = at(xi, yi + 1) + sx * (at(xi + 1, yi + 1) - at(xi, yi + 1));
    return top + sy * (bottom - top);
  };
}

export const TILE_SIZE = 128;

/**
 * The tile as greyscale bytes, one per pixel, row by row. Three octaves: broad
 * patches of wear, then grain, then tooth.
 */
export function roughnessTile(size = TILE_SIZE, seed = 0x5eed): Uint8ClampedArray {
  const random = seededRandom(seed);
  const broad = latticeOctave(4, random);
  const grain = latticeOctave(8, random);
  const tooth = latticeOctave(16, random);

  const bytes = new Uint8ClampedArray(size * size);
  const span = MAX_ROUGHNESS_BYTE - MIN_ROUGHNESS_BYTE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const n = broad(u * 4, v * 4) * 0.55 + grain(u * 8, v * 8) * 0.3 + tooth(u * 16, v * 16) * 0.15;
      bytes[y * size + x] = Math.round(MIN_ROUGHNESS_BYTE + n * span);
    }
  }
  return bytes;
}
