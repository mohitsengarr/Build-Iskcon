// The entrance porch on the front (+z) face. Each fits itself to the walls it
// stands against — their height and where their face is — and to the base,
// reaching no further than the edge of the floor it stands on.

import type { PorchKind } from "@/lib/templeDesign";
import { domeProfile } from "@/lib/templeGeometry";
import { bevelledBox, columnShaft, facetedLathe, latheFrom } from "../geometry";
import type { Builder } from "../kit";
import { Kalashes, type BodyFrame } from "./common";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const PILLAR_XS = [-0.62, -0.22, 0.22, 0.62];

export function buildPorch(b: Builder, kind: PorchKind, f: BodyFrame, edge: number) {
  const kal = new Kalashes(b);
  if (kind === "portico") portico(b, kal, f, edge);
  else if (kind === "mandapa") stepped(b, kal, f, edge, { tiers: 4, cap: 0.26, recessed: false });
  else if (kind === "pidha") stepped(b, kal, f, edge, { tiers: 6, cap: 0.34, recessed: true });
  else if (kind === "flat") flat(b, kal, f, edge);
}

/** Four round columns, an entablature, and a small dome over the door. */
function portico(b: Builder, kal: Kalashes, f: BodyFrame, edge: number) {
  const k = f.wallHeight / 1.25;
  const y0 = f.floor;
  const depth = clamp(edge - f.front - 0.02, 0.3, 0.48);
  const pz = f.front + depth - 0.15;
  const ez = f.front + depth / 2;
  const shaftH = 0.9 * k;
  const base = bevelledBox(0.15, 0.06, 0.15, 0.01);
  const shaft = columnShaft(0.05, 0.058, shaftH, 20);
  const capital = latheFrom([[0, 0], [0.05, 0], [0.078, 0.035], [0.078, 0.055], [0, 0.055]], 20);
  const abacus = bevelledBox(0.17, 0.05, 0.17, 0.01);
  for (const x of PILLAR_XS) {
    b.add("trim", base, [x, y0 + 0.03, pz]);
    b.add("stone", shaft, [x, y0 + 0.06, pz]);
    b.add("trim", capital, [x, y0 + 0.06 + shaftH, pz]);
    b.add("trim", abacus, [x, y0 + 0.06 + shaftH + 0.08, pz]);
  }
  const ent = y0 + 0.06 + shaftH + 0.105;
  b.add("stone", bevelledBox(1.52, 0.13, depth), [0, ent + 0.065, ez]);
  b.add("trim", bevelledBox(1.58, 0.04, depth + 0.04, 0.008), [0, ent + 0.15, ez]);
  b.add("stone", bevelledBox(1.48, 0.135, Math.max(0.2, depth - 0.04)), [0, ent + 0.2375, ez - 0.01]);
  const py = ent + 0.305;
  b.add("trim", latheFrom([[0, 0], [0.2, 0], [0.2, 0.07], [0, 0.07]], 32), [0, py, ez]);
  b.add("crown", latheFrom(domeProfile({ radius: 0.19, height: 0.24, bulge: 0.08, point: 0.3, steps: 16 }), 32), [0, py + 0.07, ez]);
  kal.add([0, py + 0.29, ez], 0.18);
}

/**
 * Square pillars under a roof of receding slabs and a pyramid: the phamsana
 * mandapa of a Nagara temple, or, with more tiers in recessed pairs, the pidha
 * roof of a Kalinga jagamohana.
 */
function stepped(
  b: Builder, kal: Kalashes, f: BodyFrame, edge: number,
  { tiers, cap, recessed }: { tiers: number; cap: number; recessed: boolean },
) {
  const k = f.wallHeight / 1.05;
  const y0 = f.floor;
  const depth = clamp(edge - f.front - 0.02, 0.36, 0.64);
  const pz = f.front + depth - 0.14;
  const pillarH = 0.8 * k;
  const pillarBase = bevelledBox(0.18, 0.06, 0.18, 0.01);
  const pillar = bevelledBox(0.12, pillarH, 0.12, 0.01);
  const capital = bevelledBox(0.2, 0.07, 0.2, 0.01);
  for (const x of PILLAR_XS) {
    b.add("trim", pillarBase, [x, y0 + 0.03, pz]);
    b.add("stone", pillar, [x, y0 + 0.06 + pillarH / 2, pz]);
    b.add("trim", capital, [x, y0 + 0.06 + pillarH + 0.035, pz]);
  }
  const beamY = y0 + 0.06 + pillarH + 0.07;
  b.add("stone", bevelledBox(1.5, 0.1, depth), [0, beamY + 0.05, f.front + depth / 2]);
  let ry = beamY + 0.1;
  const shrink = 0.84 / tiers;
  let d = depth + 0.1;
  for (let i = 0; i < tiers; i++) {
    const w = 1.62 - shrink * i * 1.1;
    d = Math.max(0.24, depth + 0.1 - (0.42 / tiers) * i);
    b.add("trim", bevelledBox(w, 0.07, d, 0.01), [0, ry + 0.035, f.front + d / 2]);
    ry += 0.07;
    if (recessed && i < tiers - 1) {
      // A narrow recess between pidhas, so the tiers read as separate roofs.
      b.add("stone", bevelledBox(w - 0.12, 0.03, Math.max(0.2, d - 0.08), 0.006), [0, ry + 0.015, f.front + d / 2]);
      ry += 0.03;
    }
  }
  const z = f.front + d / 2;
  b.add("crown", facetedLathe([[0.42, 0], [0.06, cap], [0, cap]], 4), [0, ry, z], { scale: [1, 1, Math.min(1, d / 0.84)] });
  kal.add([0, ry + cap, z], 0.16);
}

/** Square pillars with bracket capitals under a flat roof edged with miniature shrines. */
function flat(b: Builder, kal: Kalashes, f: BodyFrame, edge: number) {
  const k = f.wallHeight / 1.0;
  const y0 = f.floor;
  const depth = clamp(edge - f.front - 0.02, 0.36, 0.66);
  const pz = f.front + depth - 0.16;
  const pillarH = 0.82 * k;
  const pillar = bevelledBox(0.13, pillarH, 0.13, 0.01);
  const bracket = bevelledBox(0.28, 0.06, 0.14, 0.01);
  const foot = bevelledBox(0.19, 0.06, 0.19, 0.01);
  for (const x of PILLAR_XS) {
    b.add("trim", foot, [x, y0 + 0.03, pz]);
    b.add("stone", pillar, [x, y0 + 0.06 + pillarH / 2, pz]);
    b.add("trim", bracket, [x, y0 + 0.06 + pillarH + 0.03, pz]);
  }
  const roofY = y0 + 0.06 + pillarH + 0.06;
  b.add("stone", bevelledBox(1.56, 0.08, depth), [0, roofY + 0.04, f.front + depth / 2]);
  b.add("trim", bevelledBox(1.64, 0.05, depth + 0.04, 0.01), [0, roofY + 0.105, f.front + depth / 2 + 0.01]);
  const kutaBase = bevelledBox(0.18, 0.12, 0.18, 0.01);
  const kutaDome = facetedLathe(domeProfile({ radius: 0.1, height: 0.1, point: 0.2 }), 4);
  for (const x of [-0.6, 0, 0.6]) {
    const kz = f.front + depth - 0.1;
    b.add("stone", kutaBase, [x, roofY + 0.13 + 0.06, kz]);
    b.add("crown", kutaDome, [x, roofY + 0.25, kz]);
    kal.add([x, roofY + 0.345, kz], 0.06);
  }
}
