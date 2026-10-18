// The crown: the dome or tower over the sanctum, which is most of what makes a
// temple recognisably of its tradition.
//
// Each is built at its own natural size around (0, 0, 0) — standing on its
// roof, centred — and the composer scales it to the roof it is given. Each says
// how wide it is at the base, how tall to its apex, how big a kalash it wants,
// and whether its footprint is round (a drum) or square (a tower), which
// decides how much room corner pieces leave it.

import type { BufferGeometry } from "three";
import type { CrownKind } from "@/lib/templeDesign";
import {
  amalakaProfile, domeProfile, facadeSlots, shikharaProfile, stackTiers, type Point,
} from "@/lib/templeGeometry";
import {
  FACES, archFrame, archPanel, barrelVault, bevelledBox, domeRibs,
  facetedLathe, latheFrom, petal, ribbedLathe, type Vec3,
} from "../geometry";
import type { Builder } from "../kit";
import { Kalashes, corners, onFace } from "./common";
import { fringe } from "./body";

export interface CrownSpec {
  /** Half-width of its base at natural size. */
  half: number;
  /** Height to the apex, where the pinnacle goes. */
  height: number;
  /** The kalash it wants at natural size. */
  finial: number;
  /** A round drum leaves the roof's corners free; a square tower does not. */
  round: boolean;
  build(b: Builder): { apex: Vec3; ownsFinial?: boolean };
}

function drumWindows(b: Builder, { count, radius, y, height }: { count: number; radius: number; y: number; height: number }) {
  const frame = archFrame(0.17, 0.36, 0.03, 0.04);
  const glass = archPanel(0.125, 0.345, 0.008);
  const pilaster = bevelledBox(0.045, height, 0.03, 0.006);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const at = (r: number, yy: number): Vec3 => [Math.sin(a) * r, yy, Math.cos(a) * r];
    b.add("trim", frame, at(radius + 0.012, y + 0.1), { rotationY: a });
    b.add("glass", glass, at(radius + 0.004, y + 0.1), { rotationY: a });
    const p = a + Math.PI / count;
    b.add("stone", pilaster, [Math.sin(p) * (radius + 0.008), y + height / 2, Math.cos(p) * (radius + 0.008)], { rotationY: p });
  }
}

function lotusRing(b: Builder, { count, radius, y, size }: { count: number; radius: number; y: number; size: number }) {
  const leaf = petal(size, size, 0.025);
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5) / count) * Math.PI * 2;
    b.add("metal", leaf, [Math.sin(a) * radius, y, Math.cos(a) * radius], { rotationY: a, rotationX: 0.25 });
  }
}

/** The gilded neck at a dome's crown; returns where its top is. */
function lantern(b: Builder, y: number): number {
  b.add("metal", latheFrom([
    [0, 0], [0.2, 0], [0.2, 0.03], [0.13, 0.07], [0.13, 0.12], [0.18, 0.15], [0.18, 0.18], [0, 0.18],
  ], 40), [0, y, 0]);
  return y + 0.18;
}

/** Neck, ribbed amalaka and the flat chandrika over it: how a stone tower ends. */
function amalakaCap(b: Builder, y: number, size: number): number {
  b.add("crown", latheFrom([[0, 0], [0.6 * size, 0], [0.48 * size, 0.13 * size], [0, 0.13 * size]], 32), [0, y, 0]);
  const ay = y + 0.13 * size;
  b.add("crown", ribbedLathe(amalakaProfile(size, 0.48 * size), 32, 0.12), [0, ay, 0]);
  const cy = ay + 0.48 * size;
  b.add("crown", latheFrom([[0, 0], [0.65 * size, 0], [0.65 * size, 0.075 * size], [0, 0.075 * size]], 32), [0, cy, 0]);
  return cy + 0.075 * size;
}

function domeOnDrum(
  b: Builder,
  { ring, drum, cornice, profile, faceted, ribs, petals, windows }: {
    ring: Point[]; drum: { radius: number; height: number }; cornice: Point[];
    profile: Point[]; faceted?: number; ribs: number; petals: { count: number; radius: number; size: number };
    windows: number;
  },
): { domeY: number } {
  const lathe = (pts: Point[], seg: number) => (faceted ? facetedLathe(pts, faceted) : latheFrom(pts, seg));
  b.add("trim", lathe(ring, 64), [0, 0, 0]);
  const ringH = ring[ring.length - 1][1];
  b.add("stone", lathe([[0, 0], [drum.radius, 0], [drum.radius, drum.height], [0, drum.height]], 64), [0, ringH, 0]);
  drumWindows(b, { count: windows, radius: drum.radius, y: ringH, height: drum.height });
  b.add("trim", lathe(cornice, 64), [0, ringH + drum.height, 0]);
  const domeY = ringH + drum.height + cornice[cornice.length - 1][1];
  b.add("crown", faceted ? facetedLathe(profile, faceted) : latheFrom(profile, 96), [0, domeY, 0]);
  if (faceted) {
    const toCorner = 1 / Math.cos(Math.PI / faceted);
    const arrises: Point[] = profile.map(([x, y]) => [x * toCorner, y]);
    b.add("metal", domeRibs(arrises, { count: faceted, phase: Math.PI / faceted, offset: 0, radius: 0.012 }), [0, domeY, 0]);
  } else {
    b.add("metal", domeRibs(profile, { count: ribs }), [0, domeY, 0]);
  }
  lotusRing(b, { ...petals, y: domeY - 0.02 });
  return { domeY };
}

const planetarium: CrownSpec = {
  half: 1.08, height: 1.93, finial: 0.62, round: true,
  build(b) {
    const profile = domeProfile({ radius: 0.95, height: 1.08, bulge: 0.06, point: 0.22, steps: 48 });
    const { domeY } = domeOnDrum(b, {
      ring: [[0, 0], [1.08, 0], [1.08, 0.05], [1.03, 0.08], [0, 0.08]],
      drum: { radius: 0.98, height: 0.56 },
      cornice: [[0, 0], [1.0, 0], [1.06, 0.035], [1.06, 0.06], [1.0, 0.08], [0, 0.08]],
      profile, ribs: 16, petals: { count: 18, radius: 0.94, size: 0.3 }, windows: 12,
    });
    return { apex: [0, lantern(b, domeY + 1.03), 0] };
  },
};

const faceted: CrownSpec = {
  half: 1.08, height: 2.04, finial: 0.7, round: true,
  build(b) {
    const profile = domeProfile({ radius: 0.92, height: 1.25, bulge: 0.1, point: 0.5, steps: 40 });
    const { domeY } = domeOnDrum(b, {
      ring: [[0, 0], [1.08, 0], [1.08, 0.06], [1.02, 0.08], [0, 0.08]],
      drum: { radius: 0.96, height: 0.5 },
      cornice: [[0, 0], [0.98, 0], [1.04, 0.035], [1.04, 0.06], [0.98, 0.08], [0, 0.08]],
      profile, faceted: 12, ribs: 12,
      // The dome swells past its springing line, so its petals stand further out.
      petals: { count: 24, radius: 1.0, size: 0.24 }, windows: 12,
    });
    return { apex: [0, lantern(b, domeY + 1.2), 0] };
  },
};

const onion: CrownSpec = {
  half: 1.0, height: 1.94, finial: 0.55, round: true,
  build(b) {
    const profile = domeProfile({ radius: 0.8, height: 1.1, bulge: 0.3, point: 0.75, steps: 48 });
    const { domeY } = domeOnDrum(b, {
      ring: [[0, 0], [1.0, 0], [1.0, 0.04], [0.95, 0.06], [0, 0.06]],
      drum: { radius: 0.78, height: 0.56 },
      cornice: [[0, 0], [0.8, 0], [0.86, 0.035], [0.86, 0.06], [0.8, 0.08], [0, 0.08]],
      profile, ribs: 12, petals: { count: 14, radius: 0.76, size: 0.26 }, windows: 10,
    });
    return { apex: [0, lantern(b, domeY + 1.06), 0] };
  },
};

/** A curving square tower with smaller towers (urushringas) clustered on each face. */
const shikhara: CrownSpec = {
  half: 0.98, height: 2.565, finial: 0.5, round: false,
  build(b) {
    const kal = new Kalashes(b);
    const towerH = 2.25;
    b.add("crown", facetedLathe(shikharaProfile({ baseHalf: 0.98, topHalf: 0.3, height: towerH, steps: 26 }), 4), [0, 0, 0]);
    const uru = facetedLathe(shikharaProfile({ baseHalf: 0.36, topHalf: 0.1, height: 1.3, steps: 18 }), 4);
    const small = ribbedLathe(amalakaProfile(0.13, 0.08), 20, 0.15, 48);
    for (const face of FACES) {
      const [x, , z] = onFace(face, 0, 0, 0.74);
      b.add("crown", uru, [x, 0, z]);
      b.add("crown", small, [x, 1.3, z]);
      kal.add([x, 1.38, z], 0.14);
    }
    b.add("crown", latheFrom([[0, 0], [0.27, 0], [0.22, 0.06], [0, 0.06]], 32), [0, towerH, 0]);
    b.add("crown", ribbedLathe(amalakaProfile(0.46, 0.22), 32, 0.12), [0, towerH + 0.06, 0]);
    b.add("crown", latheFrom([[0, 0], [0.3, 0], [0.3, 0.035], [0, 0.035]], 32), [0, towerH + 0.28, 0]);
    return { apex: [0, towerH + 0.315, 0] };
  },
};

/**
 * A Kalinga rekha deul: taller and straighter than a Nagara shikhara, its faces
 * stepped out in vertical bands (pagas) running the full height, under a broad
 * amalaka.
 */
const rekha: CrownSpec = {
  half: 0.98, height: 3.12, finial: 0.45, round: false,
  build(b) {
    const towerH = 2.7;
    b.add("crown", facetedLathe(shikharaProfile({ baseHalf: 0.98, topHalf: 0.44, height: towerH, steps: 30 }), 4), [0, 0, 0]);
    const paga = facetedLathe(shikharaProfile({ baseHalf: 0.4, topHalf: 0.2, height: towerH - 0.1, steps: 30 }), 4);
    for (const face of FACES) {
      const [x, , z] = onFace(face, 0, 0, 0.64);
      b.add("crown", paga, [x, 0, z]);
    }
    // Horizontal bands where the tower's courses gather.
    for (const t of [0.34, 0.66]) {
      const y = towerH * t;
      const w = 2 * (0.44 + 0.54 * (1 - Math.pow(t, 2.2))) + 0.08;
      b.add("crown", bevelledBox(w, 0.04, w, 0.01), [0, y, 0]);
    }
    const top = amalakaCap(b, towerH, 0.58);
    return { apex: [0, top, 0] };
  },
};

/** Three octagonal marble shikharas over one hall, the middle one tallest. */
const triple: CrownSpec = {
  half: 1.25, height: 2.13, finial: 0.45, round: false,
  build(b) {
    const kal = new Kalashes(b);
    const centreH = 1.85;
    b.add("crown", facetedLathe(shikharaProfile({ baseHalf: 0.62, topHalf: 0.2, height: centreH, steps: 24 }), 8), [0, 0, 0]);
    const top = amalakaCap(b, centreH, 0.32);
    const sideH = 1.15;
    const side = facetedLathe(shikharaProfile({ baseHalf: 0.36, topHalf: 0.12, height: sideH, steps: 18 }), 8);
    for (const x of [-0.86, 0.86]) {
      b.add("crown", side, [x, 0, 0]);
      b.add("crown", ribbedLathe(amalakaProfile(0.18, 0.09), 24, 0.14, 48), [x, sideH, 0]);
      kal.add([x, sideH + 0.09, 0], 0.22);
    }
    return { apex: [0, top, 0] };
  },
};

/** Bengal's pancharatna: a curved roof carrying a central tower and four at the corners. */
const pancharatna: CrownSpec = {
  half: 1.05, height: 1.82, finial: 0.4, round: false,
  build(b) {
    const kal = new Kalashes(b);
    b.add("stone", facetedLathe([[1.05, 0], [0.92, 0.16], [0, 0.16]], 4), [0, 0, 0]);
    const ped = 0.42;
    b.add("stone", bevelledBox(0.92, ped, 0.92), [0, 0.16 + ped / 2, 0]);
    const opening = archPanel(0.2, 0.28, 0.01);
    const frame = archFrame(0.28, 0.32, 0.04, 0.03);
    for (const face of FACES) {
      const how = { rotationY: face.rotationY };
      b.add("shade", opening, onFace(face, 0, 0.22, 0.464), how);
      b.add("trim", frame, onFace(face, 0, 0.21, 0.47), how);
    }
    const towerY = 0.16 + ped;
    b.add("crown", facetedLathe(shikharaProfile({ baseHalf: 0.4, topHalf: 0.14, height: 1.1, steps: 18 }), 4), [0, towerY, 0]);
    b.add("crown", ribbedLathe(amalakaProfile(0.2, 0.1), 24, 0.15, 48), [0, towerY + 1.1, 0]);
    const cornerPed = bevelledBox(0.44, 0.26, 0.44);
    const cornerTower = facetedLathe(shikharaProfile({ baseHalf: 0.2, topHalf: 0.07, height: 0.55, steps: 12 }), 4);
    const cornerAmalaka = ribbedLathe(amalakaProfile(0.11, 0.06), 18, 0.15, 40);
    for (const [x, z] of corners(0.7)) {
      b.add("stone", cornerPed, [x, 0.16 + 0.13, z]);
      b.add("crown", cornerTower, [x, 0.42, z]);
      b.add("crown", cornerAmalaka, [x, 0.97, z]);
      kal.add([x, 1.03, z], 0.14);
    }
    return { apex: [0, towerY + 1.2, 0] };
  },
};

/**
 * A gopuram: an oblong pyramid of storeys, each fringed with miniature shrines
 * and pierced by a dark opening, under a barrel vault carrying seven kalashas.
 */
const gopuram: CrownSpec = {
  half: 1.0, height: 2.47, finial: 0.24, round: false,
  build(b) {
    const kal = new Kalashes(b);
    const tiers = stackTiers({ count: 6, base: [2.0, 1.6], top: [0.95, 0.5], height: 0.36, startY: 0 });
    const opening = archPanel(0.14, 0.2, 0.01);
    const openingFrame = archFrame(0.21, 0.245, 0.035, 0.03);
    for (const t of tiers) {
      const core = t.height * 0.72;
      b.add("crown", bevelledBox(t.width, core, t.depth), [0, t.y + core / 2, 0]);
      b.add("crown", bevelledBox(t.width + 0.12, 0.05, t.depth + 0.12, 0.01), [0, t.y + core + 0.025, 0]);
      for (const side of [1, -1]) {
        const how = { rotationY: side === 1 ? 0 : Math.PI };
        b.add("shade", opening, [0, t.y + 0.035, side * (t.depth / 2 + 0.004)], how);
        b.add("crown", openingFrame, [0, t.y + 0.02, side * (t.depth / 2 + 0.012)], how);
      }
      fringe(b, kal, t.y + core + 0.05, t.width + 0.12, t.depth + 0.12, "crown");
    }
    const last = tiers[tiers.length - 1];
    const vy = last.y + last.height;
    b.add("crown", bevelledBox(1.05, 0.06, 0.56, 0.01), [0, vy + 0.03, 0]);
    b.add("crown", barrelVault(0.95, 0.25), [0, vy + 0.06, 0]);
    const gable = archFrame(0.6, 0.3, 0.06, 0.05);
    b.add("crown", gable, [0.49, vy + 0.06, 0], { rotationY: Math.PI / 2 });
    b.add("crown", gable, [-0.49, vy + 0.06, 0], { rotationY: -Math.PI / 2 });
    for (const x of facadeSlots(0.8, 7)) kal.add([x, vy + 0.3, 0], 0.24);
    return { apex: [0, vy + 0.31, 0], ownsFinial: true };
  },
};

/** A Dravida vimana: square storeys fringed with shrines, a neck, and an octagonal domed stupi. */
const vimana: CrownSpec = {
  half: 1.0, height: 2.09, finial: 0.4, round: false,
  build(b) {
    const kal = new Kalashes(b);
    const tiers = stackTiers({ count: 4, base: [1.9, 1.9], top: [1.05, 1.05], height: 0.34, startY: 0 });
    for (const t of tiers) {
      const core = t.height * 0.72;
      b.add("crown", bevelledBox(t.width, core, t.depth), [0, t.y + core / 2, 0]);
      b.add("crown", bevelledBox(t.width + 0.1, 0.05, t.depth + 0.1, 0.01), [0, t.y + core + 0.025, 0]);
      fringe(b, kal, t.y + core + 0.05, t.width + 0.1, t.depth + 0.1, "crown");
    }
    const top = tiers.length * 0.34;
    b.add("crown", bevelledBox(0.72, 0.18, 0.72), [0, top + 0.09, 0]);
    b.add("crown", facetedLathe(domeProfile({ radius: 0.6, height: 0.55, bulge: 0.12, point: 0.25 }), 8), [0, top + 0.18, 0]);
    return { apex: [0, top + 0.73, 0] };
  },
};

/** A stepped pyramid roof: stone in the mountains, sheeted copper in Kerala. */
const pyramid: CrownSpec = {
  half: 1.0, height: 1.48, finial: 0.4, round: false,
  build(b) {
    let y = 0;
    let w = 2.0;
    for (let i = 0; i < 5; i++) {
      w = 2.0 - 0.22 * i;
      b.add("crown", bevelledBox(w, 0.14, w, 0.012), [0, y + 0.07, 0]);
      y += 0.14;
      b.add("stone", bevelledBox(w - 0.12, 0.04, w - 0.12, 0.006), [0, y + 0.02, 0]);
      y += 0.04;
    }
    const capHalf = (w - 0.22) / 2;
    b.add("crown", facetedLathe([[capHalf, 0], [0.06, 0.5], [0, 0.5]], 4), [0, y, 0]);
    b.add("crown", ribbedLathe(amalakaProfile(0.16, 0.08), 20, 0.15, 48), [0, y + 0.5, 0]);
    return { apex: [0, y + 0.58, 0] };
  },
};

export const CROWN_SPECS: Record<CrownKind, CrownSpec> = {
  "planetarium-dome": planetarium,
  "onion-dome": onion,
  "faceted-dome": faceted,
  shikhara,
  rekha,
  "triple-shikhara": triple,
  pancharatna,
  gopuram,
  vimana,
  pyramid,
};

/** The small dome a chhatri carries, in keeping with the main crown. */
export function chhatriDome(crown: CrownKind): BufferGeometry {
  if (crown === "faceted-dome") return facetedLathe(domeProfile({ radius: 0.17, height: 0.21, bulge: 0.1, point: 0.5, steps: 16 }), 8);
  if (crown === "onion-dome") return latheFrom(domeProfile({ radius: 0.15, height: 0.24, bulge: 0.3, point: 0.75, steps: 16 }), 24);
  return latheFrom(domeProfile({ radius: 0.17, height: 0.21, bulge: 0.08, point: 0.3, steps: 16 }), 24);
}

