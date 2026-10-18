// The silhouettes of the realistic temple, as plain numbers.
//
// Every turned form — a dome, a kalash, a shikhara — is a lathe: a 2D profile
// spun around the vertical axis. Keeping the profiles here, as [x, y] pairs with
// no three.js in sight, means the shapes can be checked by tests (a dome closes
// at its apex, a kalash never folds back through its own axis) rather than only
// by eye in a browser.

export type Point = [number, number];

/**
 * A masonry dome: from its springing line (radius, 0) up to its apex (0, height).
 *
 * `bulge` > 0 swells the shoulders past the springing radius, the way the domes
 * of the Temple of the Vedic Planetarium do; 0 gives a plain half-ellipse.
 * `point` > 0 draws the crown up into a gentle point, as most Indian domes have.
 */
export function domeProfile(
  { radius, height, bulge = 0, point = 0, steps = 32 }:
  { radius: number; height: number; bulge?: number; point?: number; steps?: number },
): Point[] {
  const n = Math.max(4, Math.floor(steps));
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;                       // 0 at the springing line, 1 at the apex
    const theta = t * (Math.PI / 2);
    // Swelling peaks a third of the way up and is gone at both ends.
    const swell = 1 + bulge * Math.sin(Math.PI * Math.min(1, t * 1.5));
    // Pointing pulls the upper half inward faster than a circle would.
    const pinch = 1 - point * Math.pow(t, 3);
    const x = Math.max(0, radius * Math.cos(theta) * swell * pinch);
    const y = height * Math.sin(theta);
    pts.push([i === n ? 0 : x, y]);
  }
  return pts;
}

/**
 * A kalash — the auspicious pot that crowns a temple — with its finial spike,
 * scaled so that the whole thing is `height` tall. Read bottom to top.
 */
export function kalashProfile(height: number): Point[] {
  // Proportions taken from temple finials: a foot, a full belly, a waisted
  // neck, a flared lip, two stacked balls, and the spike.
  const unit: Point[] = [
    [0.0, 0.0],
    [0.16, 0.0], [0.17, 0.03], [0.12, 0.06],            // foot
    [0.2, 0.12], [0.27, 0.22], [0.28, 0.3], [0.24, 0.39], // belly
    [0.12, 0.45], [0.09, 0.48],                         // neck
    [0.15, 0.51], [0.15, 0.53], [0.07, 0.55],           // lip
    [0.12, 0.6], [0.12, 0.65], [0.06, 0.69],            // first ball
    [0.09, 0.73], [0.09, 0.77], [0.04, 0.8],            // second ball
    [0.03, 0.88], [0.0, 1.0],                           // spike
  ];
  return unit.map(([x, y]) => [x * height, y * height]);
}

/**
 * A North-Indian (Nagara) shikhara: a tall tower that rises almost straight and
 * then curves in to its crown, like a beehive. Spun with four segments it comes
 * out square in plan, which is what a shikhara is.
 */
export function shikharaProfile(
  { baseHalf, topHalf, height, steps = 24 }:
  { baseHalf: number; topHalf: number; height: number; steps?: number },
): Point[] {
  const n = Math.max(4, Math.floor(steps));
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Barely tapering at first, curving in hard near the top.
    const curve = 1 - Math.pow(t, 2.2);
    pts.push([topHalf + (baseHalf - topHalf) * curve, height * t]);
  }
  pts.push([0, height]);
  return pts;
}

/**
 * The outline of a round-arched opening, as a closed loop starting at the
 * bottom-left corner: up the left jamb, over a semicircular head, down the right.
 */
export function archOutline(
  { width, height, steps = 16 }: { width: number; height: number; steps?: number },
): Point[] {
  const r = width / 2;
  const spring = Math.max(0, height - r);   // where the arch head begins
  const n = Math.max(4, Math.floor(steps));
  const pts: Point[] = [[-r, 0], [-r, spring]];
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    pts.push([r * Math.cos(a), spring + r * Math.sin(a)]);
  }
  pts.push([r, spring], [r, 0]);
  return pts;
}

/** `count` points evenly around a circle, starting at `phase` radians. */
export function ringPositions(count: number, radius: number, phase = 0): Point[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
}

/** Total length of a profile — what a lathe's v coordinate is stretched over. */
export function profileLength(points: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return len;
}

/** Centres of `count` equal bays across a facade `span` wide, left to right. */
export function facadeSlots(span: number, count: number): number[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, (_, i) => -span / 2 + (span * (i + 0.5)) / n);
}

/**
 * How far out a ribbed surface stands at angle `phi`: 1 on every rib's crest,
 * `1 - depth` in the groove between two. An amalaka — the ribbed stone disc
 * that caps a Nagara shikhara — is a flattened sphere scaled by this.
 */
export function ribbedScale(phi: number, ribs: number, depth: number): number {
  return 1 - depth * (1 - Math.abs(Math.cos((ribs * phi) / 2)));
}

/**
 * A lotus petal, as a closed outline: from the left of its base, swelling out
 * and drawing in to a point at (0, height), and back down the other side.
 */
export function petalOutline(
  { width, height, steps = 12 }: { width: number; height: number; steps?: number },
): Point[] {
  const n = Math.max(2, Math.floor(steps));
  const half = width / 2;
  const side: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;                                  // 0 at the base, 1 at the tip
    // Widest a third of the way up, then a long taper to the tip.
    const w = half * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.15 * t);
    side.push([-Math.max(0, w), height * t]);
  }
  side[0] = [-half * 0.55, 0];                        // a flat foot to stand on
  side[n] = [0, height];
  const back = side.slice(0, -1).reverse().map(([x, y]): Point => [-x, y]);
  return [...side, ...back];
}

export interface Tier { width: number; depth: number; y: number; height: number }

/**
 * The storeys of a stepped tower, bottom to top: each one narrower than the
 * last, sitting exactly on the one below. Width and depth shrink separately,
 * which is what makes a South-Indian gopuram an oblong pyramid, not a square one.
 */
export function stackTiers(
  { count, base, top, height, startY = 0 }:
  { count: number; base: [number, number]; top: [number, number]; height: number; startY?: number },
): Tier[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return {
      width: base[0] + (top[0] - base[0]) * t,
      depth: base[1] + (top[1] - base[1]) * t,
      y: startY + i * height,
      height,
    };
  });
}

/**
 * The direction a light has to shine from to match a sun at `elevation` and
 * `azimuth` (degrees) in an equirectangular sky, in three.js's convention: the
 * azimuth is measured from +x towards +z, which is how three samples the map.
 */
export function sunDirection(elevation: number, azimuth: number): [number, number, number] {
  const el = (elevation * Math.PI) / 180;
  const az = (azimuth * Math.PI) / 180;
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}

/**
 * The flattened sphere an amalaka is turned from, `radius` wide and `height`
 * tall, standing on y = 0. Ribbing it is left to ribbedScale.
 */
export function amalakaProfile(radius: number, height: number, steps = 14): Point[] {
  const n = Math.max(4, Math.floor(steps));
  return Array.from({ length: n + 1 }, (_, i): Point => {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    const x = i === 0 || i === n ? 0 : radius * Math.cos(a);
    return [x, (height / 2) * (1 + Math.sin(a))];
  });
}
