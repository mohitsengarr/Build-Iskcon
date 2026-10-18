// The four temples, as buildings rather than stacked shapes.
//
// Each follows the anatomy of its tradition closely enough to be recognised by
// someone who has stood in front of one:
//
//   TOVP     a white marble hall with arched windows and a portico, a drum
//            ringed with windows, and a cobalt tiled dome ribbed in gold, with
//            chhatris at the corners — after the Temple of the Vedic
//            Planetarium in Mayapur.
//   Nagara   a sandstone sanctum with a projecting niche on every face, a
//            curving square shikhara clustered with smaller ones, an amalaka,
//            a kalash and a flag, and a pillared porch with a stepped roof.
//   Dravida  a granite gopuram: an oblong pyramid of storeys, each fringed with
//            miniature shrines and pierced by a dark opening, crowned by a
//            barrel vault carrying a row of kalashas.
//   Modern   the marble hall again, under a faceted, polished white dome.
//
// Dimensions are in scene units, y up, standing on y = 0, the main entrance
// facing +z. The whole thing is pure geometry — no React, no WebGL — so it is
// built and checked in tests.

import type { BufferGeometry } from "three";
import type { TempleStyle } from "@/lib/communityTemples";
import {
  amalakaProfile, domeProfile, facadeSlots, kalashProfile, shikharaProfile, stackTiers,
  type Point,
} from "@/lib/templeGeometry";
import {
  FACES, archFrame, archPanel, barrelVault, bevelledBox, columnShaft, domeRibs,
  facetedLathe, latheFrom, petal, ribbedLathe, type Vec3,
} from "./geometry";
import { Kit, type Stuff } from "./kit";

type Face = (typeof FACES)[number];

export const PLINTH_STEPS = [
  { width: 3.9, height: 0.12 },
  { width: 3.62, height: 0.12 },
  { width: 3.34, height: 0.14 },
] as const;
export const PLINTH_WIDTH = PLINTH_STEPS[0].width;
export const PLINTH_TOP = PLINTH_STEPS.reduce((y, s) => y + s.height, 0);

/** Where on a face a point `along` it, `out` from the centre, ends up. */
function onFace(face: Face, along: number, y: number, out: number): Vec3 {
  const t = face.rotationY;
  return [along * Math.cos(t) + out * Math.sin(t), y, -along * Math.sin(t) + out * Math.cos(t)];
}

const corners = (d: number): Array<[number, number]> => [[d, d], [-d, d], [d, -d], [-d, -d]];

/** Lathe shapes reused at one size across a building — kalash of a given height. */
class Kalashes {
  private bySize = new Map<number, BufferGeometry>();
  constructor(private kit: Kit) {}
  add(at: Vec3, height: number) {
    let geo = this.bySize.get(height);
    if (!geo) {
      // A finial a few pixels tall needs no more sides than one the size of a hand.
      const sides = Math.round(Math.min(32, Math.max(10, height * 80)));
      geo = latheFrom(kalashProfile(height), sides);
      this.bySize.set(height, geo);
    }
    this.kit.add("gold", geo, at);
  }
}

function plinth(kit: Kit, stuff: Stuff) {
  let y = 0;
  for (const { width, height } of PLINTH_STEPS) {
    kit.add(stuff, bevelledBox(width, height, width, 0.015), [0, y + height / 2, 0]);
    y += height;
  }
}

// ── The marble hall (TOVP and Modern) ─────────────────────────────────────────

const HALL = { half: 1.25, height: 1.25 } as const;
/** The top of the hall's parapet, where its dome and chhatris stand. */
export const HALL_ROOF = 1.94;

function marbleHall(kit: Kit, kal: Kalashes, domeStuff: Stuff) {
  const y0 = PLINTH_TOP;
  const { half, height } = HALL;
  const W = half * 2;
  kit.add("marble", bevelledBox(W, height, W), [0, y0 + height / 2, 0]);
  kit.add("marbleTrim", bevelledBox(W + 0.12, 0.1, W + 0.12), [0, y0 + 0.05, 0]);
  const pilaster = bevelledBox(0.24, height, 0.24);
  for (const [x, z] of corners(half - 0.07)) kit.add("marble", pilaster, [x, y0 + height / 2, z]);

  // Cornice, the projecting eave (chhajja), and the parapet over the roof.
  const top = y0 + height;
  kit.add("marbleTrim", bevelledBox(W + 0.22, 0.07, W + 0.22), [0, top + 0.035, 0]);
  kit.add("marble", bevelledBox(W + 0.36, 0.045, W + 0.36, 0.008), [0, top + 0.0925, 0]);
  kit.add("marble", bevelledBox(W + 0.06, 0.16, W + 0.06), [0, top + 0.195, 0]);
  kit.add("marbleTrim", bevelledBox(W + 0.12, 0.035, W + 0.12, 0.008), [0, top + 0.2925, 0]);

  // Arched windows: a beige marble surround standing proud of the wall, the
  // glass set back inside it, and a sill below.
  const frame = archFrame(0.38, 0.8, 0.055, 0.06);
  const glass = archPanel(0.3, 0.77, 0.01);
  const sill = bevelledBox(0.46, 0.035, 0.09, 0.006);
  const sillY = y0 + 0.27;
  for (const face of FACES) {
    const front = face.dir[1] === 1;
    const slots = front ? [-0.86, 0.86] : facadeSlots(1.8, 3);
    for (const s of slots) {
      const how = { rotationY: face.rotationY };
      kit.add("marbleTrim", frame, onFace(face, s, sillY, half + 0.02), how);
      kit.add("glass", glass, onFace(face, s, sillY, half + 0.006), how);
      kit.add("marbleTrim", sill, onFace(face, s, sillY - 0.0175, half + 0.045), how);
    }
    if (front) {
      kit.add("marbleTrim", archFrame(0.66, 1.02, 0.08, 0.07), onFace(face, 0, y0, half + 0.025), { rotationY: 0 });
      kit.add("wood", archPanel(0.52, 0.99, 0.02), onFace(face, 0, y0, half + 0.01), { rotationY: 0 });
    }
  }

  // The portico: four columns carrying an entablature, a small dome above.
  const pz = half + 0.31;
  const base = bevelledBox(0.15, 0.06, 0.15, 0.01);
  const shaft = columnShaft(0.05, 0.058, 0.9, 20);
  const capital = latheFrom([[0, 0], [0.05, 0], [0.078, 0.035], [0.078, 0.055], [0, 0.055]], 20);
  const abacus = bevelledBox(0.17, 0.05, 0.17, 0.01);
  for (const x of [-0.62, -0.22, 0.22, 0.62]) {
    kit.add("marbleTrim", base, [x, y0 + 0.03, pz]);
    kit.add("marble", shaft, [x, y0 + 0.06, pz]);
    kit.add("marbleTrim", capital, [x, y0 + 0.96, pz]);
    kit.add("marbleTrim", abacus, [x, y0 + 1.04, pz]);
  }
  const ent = y0 + 1.065;
  const ez = half + 0.23;
  kit.add("marble", bevelledBox(1.52, 0.13, 0.46), [0, ent + 0.065, ez]);
  kit.add("marbleTrim", bevelledBox(1.58, 0.04, 0.5, 0.008), [0, ent + 0.15, ez]);
  kit.add("marble", bevelledBox(1.48, 0.135, 0.42), [0, ent + 0.2375, ez - 0.01]);
  const py = ent + 0.305;
  kit.add("marbleTrim", latheFrom([[0, 0], [0.2, 0], [0.2, 0.07], [0, 0.07]], 32), [0, py, ez]);
  kit.add(domeStuff, latheFrom(domeProfile({ radius: 0.19, height: 0.24, bulge: 0.08, point: 0.3, steps: 16 }), 32), [0, py + 0.07, ez]);
  kal.add([0, py + 0.29, ez], 0.18);
}

/** A chhatri — the open domed pavilion on each corner of the roof. */
function chhatris(kit: Kit, kal: Kalashes, domeStuff: Stuff, dome: (r: number, h: number) => BufferGeometry) {
  const y = HALL_ROOF;
  const base = bevelledBox(0.4, 0.06, 0.4, 0.01);
  const column = columnShaft(0.02, 0.023, 0.3, 12);
  const slab = bevelledBox(0.46, 0.04, 0.46, 0.008);
  const drum = latheFrom([[0, 0], [0.17, 0], [0.17, 0.05], [0, 0.05]], 24);
  const cap = dome(0.17, 0.21);
  for (const [x, z] of corners(HALL.half - 0.21)) {
    kit.add("marbleTrim", base, [x, y + 0.03, z]);
    for (const [cx, cz] of corners(0.14)) kit.add("marble", column, [x + cx, y + 0.06, z + cz]);
    kit.add("marble", slab, [x, y + 0.38, z]);
    kit.add("marbleTrim", drum, [x, y + 0.4, z]);
    kit.add(domeStuff, cap, [x, y + 0.45, z]);
    kal.add([x, y + 0.64, z], 0.16);
  }
}

/** The ring of arched windows round a drum of `radius`, on `sides` faces or round. */
function drumWindows(kit: Kit, { count, radius, y, height }: { count: number; radius: number; y: number; height: number }) {
  const frame = archFrame(0.17, 0.36, 0.03, 0.04);
  const glass = archPanel(0.125, 0.345, 0.008);
  const pilaster = bevelledBox(0.045, height, 0.03, 0.006);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const at = (r: number, yy: number): Vec3 => [Math.sin(a) * r, yy, Math.cos(a) * r];
    kit.add("marbleTrim", frame, at(radius + 0.012, y + 0.1), { rotationY: a });
    kit.add("glass", glass, at(radius + 0.004, y + 0.1), { rotationY: a });
    const b = a + Math.PI / count;
    kit.add("marble", pilaster, [Math.sin(b) * (radius + 0.008), y + height / 2, Math.cos(b) * (radius + 0.008)], { rotationY: b });
  }
}

function lotusRing(kit: Kit, { count, radius, y, size }: { count: number; radius: number; y: number; size: number }) {
  const leaf = petal(size, size, 0.025);
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5) / count) * Math.PI * 2;
    kit.add("gold", leaf, [Math.sin(a) * radius, y, Math.cos(a) * radius], { rotationY: a, rotationX: 0.25 });
  }
}

/** The gilded neck a kalash stands on, at a dome's crown. */
function lantern(kit: Kit, kal: Kalashes, y: number, kalashHeight: number) {
  kit.add("gold", latheFrom([
    [0, 0], [0.2, 0], [0.2, 0.03], [0.13, 0.07], [0.13, 0.12], [0.18, 0.15], [0.18, 0.18], [0, 0.18],
  ], 40), [0, y, 0]);
  kal.add([0, y + 0.18, 0], kalashHeight);
}

function tovp(kit: Kit) {
  const kal = new Kalashes(kit);
  plinth(kit, "marbleTrim");
  marbleHall(kit, kal, "glaze");
  chhatris(kit, kal, "glaze", (r, h) => latheFrom(domeProfile({ radius: r, height: h, bulge: 0.08, point: 0.3, steps: 16 }), 24));

  const y0 = HALL_ROOF;
  kit.add("marbleTrim", latheFrom([[0, 0], [1.08, 0], [1.08, 0.05], [1.03, 0.08], [0, 0.08]], 64), [0, y0, 0]);
  const drumY = y0 + 0.08;
  const drum = { radius: 0.98, height: 0.56 };
  kit.add("marble", columnShaft(drum.radius, drum.radius, drum.height, 64), [0, drumY, 0]);
  drumWindows(kit, { count: 12, radius: drum.radius, y: drumY, height: drum.height });
  kit.add("marbleTrim", latheFrom([[0, 0], [1.0, 0], [1.06, 0.035], [1.06, 0.06], [1.0, 0.08], [0, 0.08]], 64), [0, drumY + drum.height, 0]);

  const domeY = drumY + drum.height + 0.08;
  const profile = domeProfile({ radius: 0.95, height: 1.08, bulge: 0.06, point: 0.22, steps: 48 });
  kit.add("glaze", latheFrom(profile, 96), [0, domeY, 0]);
  kit.add("gold", domeRibs(profile, { count: 16 }), [0, domeY, 0]);
  lotusRing(kit, { count: 18, radius: 0.94, y: domeY - 0.02, size: 0.3 });
  lantern(kit, kal, domeY + 1.03, 0.62);
}

function modern(kit: Kit) {
  const kal = new Kalashes(kit);
  const sides = 12;
  plinth(kit, "marbleTrim");
  marbleHall(kit, kal, "marblePolished");
  chhatris(kit, kal, "marblePolished", (r, h) => facetedLathe(domeProfile({ radius: r, height: h, bulge: 0.1, point: 0.5 }), 8));

  const y0 = HALL_ROOF;
  kit.add("marbleTrim", facetedLathe([[0, 0], [1.08, 0], [1.08, 0.06], [1.02, 0.08], [0, 0.08]], sides), [0, y0, 0]);
  const drumY = y0 + 0.08;
  const drum = { radius: 0.96, height: 0.5 };
  kit.add("marble", facetedLathe([[0, 0], [drum.radius, 0], [drum.radius, drum.height], [0, drum.height]], sides), [0, drumY, 0]);
  drumWindows(kit, { count: sides, radius: drum.radius, y: drumY, height: drum.height });
  kit.add("marbleTrim", facetedLathe([[0, 0], [0.98, 0], [1.04, 0.035], [1.04, 0.06], [0.98, 0.08], [0, 0.08]], sides), [0, drumY + drum.height, 0]);

  const domeY = drumY + drum.height + 0.08;
  const profile = domeProfile({ radius: 0.92, height: 1.25, bulge: 0.1, point: 0.5, steps: 40 });
  kit.add("marblePolished", facetedLathe(profile, sides), [0, domeY, 0]);
  // Gold down every arris of the facets.
  const toCorner = 1 / Math.cos(Math.PI / sides);
  const arrises: Point[] = profile.map(([x, y]) => [x * toCorner, y]);
  kit.add("gold", domeRibs(arrises, { count: sides, phase: Math.PI / sides, offset: 0, radius: 0.012 }), [0, domeY, 0]);
  // The dome swells past its springing line, so its petals stand further out.
  lotusRing(kit, { count: 24, radius: 1.0, y: domeY - 0.02, size: 0.24 });
  lantern(kit, kal, domeY + 1.2, 0.7);
}

// ── Nagara: the North-Indian shikhara ────────────────────────────────────────

/** Where the Nagara temple's flag flies from: the foot of its pole. */
export const NAGARA_FLAG = { pole: [0.22, 0, 0] as Vec3, height: 0.8 };

function nagara(kit: Kit): Vec3 {
  const S: Stuff = "sandstone";
  const kal = new Kalashes(kit);
  plinth(kit, S);
  const y0 = PLINTH_TOP;
  const H = 1.05;
  const half = 1.05;
  kit.add(S, bevelledBox(half * 2, H, half * 2), [0, y0 + H / 2, 0]);
  kit.add(S, bevelledBox(2.26, 0.12, 2.26), [0, y0 + 0.06, 0]);
  kit.add(S, bevelledBox(2.18, 0.05, 2.18, 0.008), [0, y0 + 0.145, 0]);
  const corner = bevelledBox(0.2, H, 0.2);
  for (const [x, z] of corners(half - 0.03)) kit.add(S, corner, [x, y0 + H / 2, z]);

  // A projecting bay (bhadra) on every face, with a niche — or the doorway.
  const bayH = H - 0.17;
  const bay = bevelledBox(0.78, bayH, 0.1);
  const niche = archFrame(0.42, 0.62, 0.06, 0.05);
  const dark = archPanel(0.32, 0.6, 0.01);
  const bayFront = half + 0.09;
  for (const face of FACES) {
    const how = { rotationY: face.rotationY };
    kit.add(S, bay, onFace(face, 0, y0 + 0.17 + bayH / 2, half + 0.04), how);
    if (face.dir[1] === 1) {
      kit.add(S, archFrame(0.56, 0.84, 0.08, 0.06), onFace(face, 0, y0 + 0.17, bayFront + 0.02), how);
      kit.add("wood", archPanel(0.42, 0.8, 0.02), onFace(face, 0, y0 + 0.17, bayFront + 0.006), how);
    } else {
      kit.add(S, niche, onFace(face, 0, y0 + 0.32, bayFront + 0.02), how);
      kit.add("shade", dark, onFace(face, 0, y0 + 0.32, bayFront + 0.004), how);
    }
  }
  kit.add(S, bevelledBox(2.34, 0.08, 2.34), [0, y0 + H + 0.04, 0]);
  kit.add(S, bevelledBox(2.22, 0.06, 2.22), [0, y0 + H + 0.11, 0]);

  // The shikhara, and the smaller towers clustered on it.
  const sy = y0 + H + 0.14;
  const towerH = 2.25;
  kit.add(S, facetedLathe(shikharaProfile({ baseHalf: 0.98, topHalf: 0.3, height: towerH, steps: 26 }), 4), [0, sy, 0]);
  const uru = facetedLathe(shikharaProfile({ baseHalf: 0.36, topHalf: 0.1, height: 1.3, steps: 18 }), 4);
  const smallAmalaka = ribbedLathe(amalakaProfile(0.13, 0.08), 20, 0.15, 48);
  for (const face of FACES) {
    const [x, , z] = onFace(face, 0, 0, 0.74);
    kit.add(S, uru, [x, sy, z]);
    kit.add(S, smallAmalaka, [x, sy + 1.3, z]);
    kal.add([x, sy + 1.38, z], 0.14);
  }
  const karna = facetedLathe(shikharaProfile({ baseHalf: 0.12, topHalf: 0.04, height: 0.5, steps: 10 }), 4);
  const tinyAmalaka = ribbedLathe(amalakaProfile(0.07, 0.045), 16, 0.15, 40);
  for (const [x, z] of corners(1.0)) {
    kit.add(S, karna, [x, sy, z]);
    kit.add(S, tinyAmalaka, [x, sy + 0.5, z]);
    kal.add([x, sy + 0.545, z], 0.08);
  }
  const ty = sy + towerH;
  kit.add(S, latheFrom([[0, 0], [0.27, 0], [0.22, 0.06], [0, 0.06]], 32), [0, ty, 0]);
  kit.add(S, ribbedLathe(amalakaProfile(0.46, 0.22), 32, 0.12), [0, ty + 0.06, 0]);
  kit.add(S, latheFrom([[0, 0], [0.3, 0], [0.3, 0.035], [0, 0.035]], 32), [0, ty + 0.28, 0]);
  kal.add([0, ty + 0.315, 0], 0.5);
  const poleFoot: Vec3 = [NAGARA_FLAG.pole[0], ty + 0.06, NAGARA_FLAG.pole[2]];
  kit.add("gold", columnShaft(0.007, 0.01, NAGARA_FLAG.height, 8), poleFoot);

  // The porch (mandapa): four pillars and a stepped (phamsana) roof.
  const pz = 1.5;
  const pillarBase = bevelledBox(0.18, 0.06, 0.18, 0.01);
  const pillar = bevelledBox(0.12, 0.8, 0.12, 0.01);
  const capital = bevelledBox(0.2, 0.07, 0.2, 0.01);
  for (const x of [-0.62, -0.22, 0.22, 0.62]) {
    kit.add(S, pillarBase, [x, y0 + 0.03, pz]);
    kit.add(S, pillar, [x, y0 + 0.46, pz]);
    kit.add(S, capital, [x, y0 + 0.895, pz]);
  }
  const beamY = y0 + 0.93;
  kit.add(S, bevelledBox(1.5, 0.1, 0.64), [0, beamY + 0.05, half + 0.32]);
  let ry = beamY + 0.1;
  for (let k = 0; k < 4; k++) {
    const w = 1.62 - 0.2 * k;
    const d = 0.74 - 0.1 * k;
    kit.add(S, bevelledBox(w, 0.07, d, 0.01), [0, ry + 0.035, half + d / 2]);
    ry += 0.07;
  }
  const roofZ = half + 0.22;
  kit.add(S, facetedLathe([[0.42, 0], [0.06, 0.26], [0, 0.26]], 4), [0, ry, roofZ], { scale: [1, 1, 0.42] });
  kal.add([0, ry + 0.26, roofZ], 0.16);
  return [poleFoot[0], poleFoot[1] + NAGARA_FLAG.height, poleFoot[2]];
}

// ── Dravida: the South-Indian gopuram ────────────────────────────────────────

function dravida(kit: Kit) {
  const G: Stuff = "granite";
  const kal = new Kalashes(kit);
  plinth(kit, G);
  const y0 = PLINTH_TOP;
  const H = 1.0;
  const half = 1.05;
  kit.add(G, bevelledBox(half * 2, H, half * 2), [0, y0 + H / 2, 0]);
  kit.add(G, bevelledBox(2.3, 0.14, 2.3), [0, y0 + 0.07, 0]);
  kit.add(G, bevelledBox(2.2, 0.05, 2.2, 0.008), [0, y0 + 0.165, 0]);

  // Pilasters, niches, and the doorway with its lintel.
  const pilaster = bevelledBox(0.08, 0.8, 0.045, 0.008);
  const niche = archFrame(0.3, 0.5, 0.045, 0.04);
  const dark = archPanel(0.22, 0.47, 0.01);
  const doorFoot = y0 + 0.19;
  for (const face of FACES) {
    const how = { rotationY: face.rotationY };
    const front = face.dir[1] === 1;
    for (const s of front ? [-0.78, -0.48, 0.48, 0.78] : facadeSlots(1.7, 4)) {
      kit.add(G, pilaster, onFace(face, s, doorFoot + 0.4, half + 0.015), how);
    }
    if (front) {
      const jamb = bevelledBox(0.08, 0.73, 0.07, 0.008);
      kit.add(G, jamb, onFace(face, -0.29, doorFoot + 0.365, half + 0.03), how);
      kit.add(G, jamb, onFace(face, 0.29, doorFoot + 0.365, half + 0.03), how);
      kit.add(G, bevelledBox(0.7, 0.09, 0.08, 0.008), onFace(face, 0, doorFoot + 0.775, half + 0.035), how);
      kit.add("wood", bevelledBox(0.5, 0.73, 0.02, 0.004), onFace(face, 0, doorFoot + 0.365, half + 0.01), how);
    } else {
      kit.add(G, niche, onFace(face, 0, y0 + 0.3, half + 0.02), how);
      kit.add("shade", dark, onFace(face, 0, y0 + 0.3, half + 0.004), how);
    }
  }
  kit.add(G, bevelledBox(2.26, 0.05, 2.26, 0.008), [0, y0 + H + 0.025, 0]);
  kit.add(G, bevelledBox(2.4, 0.08, 2.4), [0, y0 + H + 0.09, 0]);

  // Miniature shrines along each storey's edge: square kutas at the corners,
  // barrel-roofed shalas between them.
  const kutaBase = bevelledBox(0.18, 0.12, 0.18, 0.01);
  const kutaDome = facetedLathe(domeProfile({ radius: 0.1, height: 0.1, point: 0.2 }), 4);
  const kuta = ([x, y, z]: Vec3) => {
    kit.add(G, kutaBase, [x, y + 0.06, z]);
    kit.add(G, kutaDome, [x, y + 0.12, z]);
    kal.add([x, y + 0.215, z], 0.06);
  };
  const shala = ([x, y, z]: Vec3, length: number, alongZ: boolean) => {
    const how = { rotationY: alongZ ? Math.PI / 2 : 0 };
    kit.add(G, bevelledBox(length, 0.1, 0.14, 0.01), [x, y + 0.05, z], how);
    kit.add(G, barrelVault(length, 0.07), [x, y + 0.1, z], how);
  };
  const fringe = (y: number, w: number, d: number) => {
    const hx = w / 2 - 0.09;
    const hz = d / 2 - 0.09;
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) kuta([sx * hx, y, sz * hz]);
    const len = Math.min(0.5, w * 0.32);
    shala([0, y, hz], len, false);
    shala([0, y, -hz], len, false);
    if (d > 0.8) {
      const lz = Math.min(0.4, d * 0.3);
      shala([hx, y, 0], lz, true);
      shala([-hx, y, 0], lz, true);
    }
  };
  const corniceTop = y0 + H + 0.13;
  fringe(corniceTop, 2.4, 2.4);

  // The storeys.
  const tiers = stackTiers({ count: 6, base: [2.0, 1.6], top: [0.95, 0.5], height: 0.36, startY: corniceTop });
  const opening = archPanel(0.14, 0.2, 0.01);
  const openingFrame = archFrame(0.21, 0.245, 0.035, 0.03);
  for (const t of tiers) {
    const core = t.height * 0.72;
    kit.add(G, bevelledBox(t.width, core, t.depth), [0, t.y + core / 2, 0]);
    kit.add(G, bevelledBox(t.width + 0.12, 0.05, t.depth + 0.12, 0.01), [0, t.y + core + 0.025, 0]);
    for (const side of [1, -1]) {
      const how = { rotationY: side === 1 ? 0 : Math.PI };
      kit.add("shade", opening, [0, t.y + 0.035, side * (t.depth / 2 + 0.004)], how);
      kit.add(G, openingFrame, [0, t.y + 0.02, side * (t.depth / 2 + 0.012)], how);
    }
    fringe(t.y + core + 0.05, t.width + 0.12, t.depth + 0.12);
  }

  // The crowning barrel vault and its row of kalashas.
  const last = tiers[tiers.length - 1];
  const vy = last.y + last.height;
  kit.add(G, bevelledBox(1.05, 0.06, 0.56, 0.01), [0, vy + 0.03, 0]);
  kit.add(G, barrelVault(0.95, 0.25), [0, vy + 0.06, 0]);
  const gable = archFrame(0.6, 0.3, 0.06, 0.05);
  kit.add(G, gable, [0.49, vy + 0.06, 0], { rotationY: Math.PI / 2 });
  kit.add(G, gable, [-0.49, vy + 0.06, 0], { rotationY: -Math.PI / 2 });
  for (const x of facadeSlots(0.8, 7)) kal.add([x, vy + 0.3, 0], 0.24);

  // The porch: square pillars with bracket capitals, and a flat roof.
  const pz = 1.5;
  const pillar = bevelledBox(0.13, 0.82, 0.13, 0.01);
  const bracket = bevelledBox(0.28, 0.06, 0.14, 0.01);
  for (const x of [-0.62, -0.22, 0.22, 0.62]) {
    kit.add(G, bevelledBox(0.19, 0.06, 0.19, 0.01), [x, y0 + 0.03, pz]);
    kit.add(G, pillar, [x, y0 + 0.47, pz]);
    kit.add(G, bracket, [x, y0 + 0.91, pz]);
  }
  const roofY = y0 + 0.94;
  kit.add(G, bevelledBox(1.56, 0.08, 0.66), [0, roofY + 0.04, half + 0.33]);
  kit.add(G, bevelledBox(1.64, 0.05, 0.72, 0.01), [0, roofY + 0.105, half + 0.34]);
  for (const x of [-0.6, 0, 0.6]) kuta([x, roofY + 0.13, pz + 0.08]);
}

export interface TempleParts {
  /** One merged geometry per material. */
  meshes: Array<[Stuff, BufferGeometry]>;
  /** Where a flag flies, if this temple has one: the top of its pole. */
  flag: Vec3 | null;
}

export function buildTemple(style: TempleStyle): TempleParts {
  const kit = new Kit();
  let flag: Vec3 | null = null;
  switch (style) {
    case "north-shikhara": flag = nagara(kit); break;
    case "south-gopuram": dravida(kit); break;
    case "modern-vedic": modern(kit); break;
    case "tovp-dome":
    default: tovp(kit); break;
  }
  return { meshes: kit.build(), flag };
}
