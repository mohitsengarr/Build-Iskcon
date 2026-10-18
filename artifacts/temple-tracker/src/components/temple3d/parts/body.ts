// The walls: the body of the temple, between its base and its crown.

import type { BodyKind } from "@/lib/templeDesign";
import { domeProfile, facadeSlots } from "@/lib/templeGeometry";
import {
  FACES, archFrame, archPanel, barrelVault, bevelledBox, facetedLathe, type Vec3,
} from "../geometry";
import type { Builder } from "../kit";
import { Kalashes, corners, onFace, type BodyFrame } from "./common";

export function buildBody(b: Builder, kind: BodyKind, floor: number): BodyFrame {
  if (kind === "sanctum") return sanctum(b, floor);
  if (kind === "pillared") return pillared(b, floor);
  return hall(b, floor);
}

/**
 * A marble hall: arched windows in beige surrounds standing proud of the wall,
 * corner pilasters, a cornice, a projecting eave (chhajja) and a parapet.
 */
function hall(b: Builder, y0: number): BodyFrame {
  const half = 1.25;
  const height = 1.25;
  const W = half * 2;
  b.add("stone", bevelledBox(W, height, W), [0, y0 + height / 2, 0]);
  b.add("trim", bevelledBox(W + 0.12, 0.1, W + 0.12), [0, y0 + 0.05, 0]);
  const pilaster = bevelledBox(0.24, height, 0.24);
  for (const [x, z] of corners(half - 0.07)) b.add("stone", pilaster, [x, y0 + height / 2, z]);

  const top = y0 + height;
  b.add("trim", bevelledBox(W + 0.22, 0.07, W + 0.22), [0, top + 0.035, 0]);
  b.add("stone", bevelledBox(W + 0.36, 0.045, W + 0.36, 0.008), [0, top + 0.0925, 0]);
  b.add("stone", bevelledBox(W + 0.06, 0.16, W + 0.06), [0, top + 0.195, 0]);
  b.add("trim", bevelledBox(W + 0.12, 0.035, W + 0.12, 0.008), [0, top + 0.2925, 0]);

  const frame = archFrame(0.38, 0.8, 0.055, 0.06);
  const glass = archPanel(0.3, 0.77, 0.01);
  const sill = bevelledBox(0.46, 0.035, 0.09, 0.006);
  const sillY = y0 + 0.27;
  for (const face of FACES) {
    const front = face.dir[1] === 1;
    const how = { rotationY: face.rotationY };
    for (const s of front ? [-0.86, 0.86] : facadeSlots(1.8, 3)) {
      b.add("trim", frame, onFace(face, s, sillY, half + 0.02), how);
      b.add("glass", glass, onFace(face, s, sillY, half + 0.006), how);
      b.add("trim", sill, onFace(face, s, sillY - 0.0175, half + 0.045), how);
    }
    if (front) {
      b.add("trim", archFrame(0.66, 1.02, 0.08, 0.07), onFace(face, 0, y0, half + 0.025), how);
      b.add("wood", archPanel(0.52, 0.99, 0.02), onFace(face, 0, y0, half + 0.01), how);
    }
  }
  return { floor: y0, wallHeight: height, roofY: top + 0.31, half, crownHalf: 1.08, front: half };
}

/**
 * A Nagara sanctum: a projecting bay (bhadra) on every face with a niche — or,
 * at the front, the doorway — corner pilasters, and a double cornice.
 */
function sanctum(b: Builder, y0: number): BodyFrame {
  const H = 1.05;
  const half = 1.05;
  b.add("stone", bevelledBox(half * 2, H, half * 2), [0, y0 + H / 2, 0]);
  b.add("trim", bevelledBox(2.26, 0.12, 2.26), [0, y0 + 0.06, 0]);
  b.add("trim", bevelledBox(2.18, 0.05, 2.18, 0.008), [0, y0 + 0.145, 0]);
  const corner = bevelledBox(0.2, H, 0.2);
  for (const [x, z] of corners(half - 0.03)) b.add("stone", corner, [x, y0 + H / 2, z]);

  const bayH = H - 0.17;
  const bay = bevelledBox(0.78, bayH, 0.1);
  const niche = archFrame(0.42, 0.62, 0.06, 0.05);
  const dark = archPanel(0.32, 0.6, 0.01);
  const bayFront = half + 0.09;
  for (const face of FACES) {
    const how = { rotationY: face.rotationY };
    b.add("stone", bay, onFace(face, 0, y0 + 0.17 + bayH / 2, half + 0.04), how);
    if (face.dir[1] === 1) {
      b.add("trim", archFrame(0.56, 0.84, 0.08, 0.06), onFace(face, 0, y0 + 0.17, bayFront + 0.02), how);
      b.add("wood", archPanel(0.42, 0.8, 0.02), onFace(face, 0, y0 + 0.17, bayFront + 0.006), how);
    } else {
      b.add("trim", niche, onFace(face, 0, y0 + 0.32, bayFront + 0.02), how);
      b.add("shade", dark, onFace(face, 0, y0 + 0.32, bayFront + 0.004), how);
    }
  }
  b.add("trim", bevelledBox(2.34, 0.08, 2.34), [0, y0 + H + 0.04, 0]);
  b.add("trim", bevelledBox(2.22, 0.06, 2.22), [0, y0 + H + 0.11, 0]);
  // The roof runs out to the upper cornice, past the wall.
  return { floor: y0, wallHeight: H, roofY: y0 + H + 0.14, half: 1.1, crownHalf: 0.98, front: half };
}

/** Miniature shrines along a roof edge: square kutas at the corners, barrel-roofed shalas between. */
export function fringe(b: Builder, kal: Kalashes, y: number, w: number, d: number, stuff: "stone" | "crown") {
  const kutaBase = bevelledBox(0.18, 0.12, 0.18, 0.01);
  const kutaDome = facetedLathe(domeProfile({ radius: 0.1, height: 0.1, point: 0.2 }), 4);
  const kuta = ([x, yy, z]: Vec3) => {
    b.add(stuff, kutaBase, [x, yy + 0.06, z]);
    b.add(stuff, kutaDome, [x, yy + 0.12, z]);
    kal.add([x, yy + 0.215, z], 0.06);
  };
  const shala = ([x, yy, z]: Vec3, length: number, alongZ: boolean) => {
    const how = { rotationY: alongZ ? Math.PI / 2 : 0 };
    b.add(stuff, bevelledBox(length, 0.1, 0.14, 0.01), [x, yy + 0.05, z], how);
    b.add(stuff, barrelVault(length, 0.07), [x, yy + 0.1, z], how);
  };
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
}

/**
 * Dravida walls: a moulded base (adhishthana), pilasters with niches between,
 * a doorway with a lintel, a heavy cornice (kapota), and a parapet of
 * miniature shrines round the roof.
 */
function pillared(b: Builder, y0: number): BodyFrame {
  const kal = new Kalashes(b);
  const H = 1.0;
  const half = 1.05;
  b.add("stone", bevelledBox(half * 2, H, half * 2), [0, y0 + H / 2, 0]);
  b.add("trim", bevelledBox(2.3, 0.14, 2.3), [0, y0 + 0.07, 0]);
  b.add("trim", bevelledBox(2.2, 0.05, 2.2, 0.008), [0, y0 + 0.165, 0]);

  const pilaster = bevelledBox(0.08, 0.8, 0.045, 0.008);
  const niche = archFrame(0.3, 0.5, 0.045, 0.04);
  const dark = archPanel(0.22, 0.47, 0.01);
  const doorFoot = y0 + 0.19;
  for (const face of FACES) {
    const how = { rotationY: face.rotationY };
    const front = face.dir[1] === 1;
    for (const s of front ? [-0.78, -0.48, 0.48, 0.78] : facadeSlots(1.7, 4)) {
      b.add("stone", pilaster, onFace(face, s, doorFoot + 0.4, half + 0.015), how);
    }
    if (front) {
      const jamb = bevelledBox(0.08, 0.73, 0.07, 0.008);
      b.add("trim", jamb, onFace(face, -0.29, doorFoot + 0.365, half + 0.03), how);
      b.add("trim", jamb, onFace(face, 0.29, doorFoot + 0.365, half + 0.03), how);
      b.add("trim", bevelledBox(0.7, 0.09, 0.08, 0.008), onFace(face, 0, doorFoot + 0.775, half + 0.035), how);
      b.add("wood", bevelledBox(0.5, 0.73, 0.02, 0.004), onFace(face, 0, doorFoot + 0.365, half + 0.01), how);
    } else {
      b.add("trim", niche, onFace(face, 0, y0 + 0.3, half + 0.02), how);
      b.add("shade", dark, onFace(face, 0, y0 + 0.3, half + 0.004), how);
    }
  }
  b.add("trim", bevelledBox(2.26, 0.05, 2.26, 0.008), [0, y0 + H + 0.025, 0]);
  b.add("trim", bevelledBox(2.4, 0.08, 2.4), [0, y0 + H + 0.09, 0]);
  const roofY = y0 + H + 0.13;
  fringe(b, kal, roofY, 2.4, 2.4, "stone");
  return { floor: y0, wallHeight: H, roofY, half: 1.2, crownHalf: 1.0, front: half };
}
