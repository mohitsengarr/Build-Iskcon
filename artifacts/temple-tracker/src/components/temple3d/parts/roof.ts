// What stands on the roof besides the crown: the pieces at its four corners,
// and the pinnacle at the crown's apex.

import { TorusGeometry } from "three";
import type { CornerKind, CrownKind, FinialKind } from "@/lib/templeDesign";
import { amalakaProfile, shikharaProfile } from "@/lib/templeGeometry";
import { bevelledBox, columnShaft, facetedLathe, latheFrom, ribbedLathe, type Vec3 } from "../geometry";
import type { Builder } from "../kit";
import { Kalashes, corners, type BodyFrame } from "./common";
import { chhatriDome } from "./crown";

/** Half the footprint of one corner piece: how much of the roof's corner it takes. */
export function cornerPieceHalf(kind: CornerKind): number {
  return kind === "chhatris" ? 0.23 : kind === "finials" ? 0.09 : kind === "spires" ? 0.12 : 0;
}

/**
 * chhatris: open domed pavilions, the dome in keeping with the main crown.
 * spires:   small towers (karna-shringas) that read as part of the main tower.
 * finials:  a kalash on a pedestal at each corner.
 */
export function buildCorners(b: Builder, kind: CornerKind, f: BodyFrame, crown: CrownKind) {
  if (kind === "none") return;
  const kal = new Kalashes(b);
  const y = f.roofY;
  if (kind === "chhatris") {
    const d = f.half - cornerPieceHalf(kind);
    const base = bevelledBox(0.4, 0.06, 0.4, 0.01);
    const column = columnShaft(0.02, 0.023, 0.3, 12);
    const slab = bevelledBox(0.46, 0.04, 0.46, 0.008);
    const drum = latheFrom([[0, 0], [0.17, 0], [0.17, 0.05], [0, 0.05]], 24);
    const cap = chhatriDome(crown);
    for (const [x, z] of corners(d)) {
      b.add("trim", base, [x, y + 0.03, z]);
      for (const [cx, cz] of corners(0.14)) b.add("stone", column, [x + cx, y + 0.06, z + cz]);
      b.add("stone", slab, [x, y + 0.38, z]);
      b.add("trim", drum, [x, y + 0.4, z]);
      b.add("crown", cap, [x, y + 0.45, z]);
      kal.add([x, y + 0.64, z], 0.16);
    }
    return;
  }
  const d = f.half - 0.1;
  if (kind === "spires") {
    const karna = facetedLathe(shikharaProfile({ baseHalf: 0.12, topHalf: 0.04, height: 0.5, steps: 10 }), 4);
    const amalaka = ribbedLathe(amalakaProfile(0.07, 0.045), 16, 0.15, 40);
    for (const [x, z] of corners(d)) {
      b.add("crown", karna, [x, y, z]);
      b.add("crown", amalaka, [x, y + 0.5, z]);
      kal.add([x, y + 0.545, z], 0.08);
    }
    return;
  }
  const pedestal = bevelledBox(0.14, 0.12, 0.14, 0.01);
  for (const [x, z] of corners(d)) {
    b.add("trim", pedestal, [x, y + 0.06, z]);
    kal.add([x, y + 0.12, z], 0.22);
  }
}

export interface FlagMount {
  /** The top of the flagpole, where the pennant is tied. */
  top: Vec3;
  /** How large the pennant is, relative to the crown's natural size. */
  scale: number;
}

/**
 * The pinnacle at the crown's apex, at the crown's own scale:
 *   kalash        the auspicious pot alone;
 *   kalash-flag   with a saffron flag on a pole beside it;
 *   chakra-flag   with the Sudarshana chakra above it and the flag over that,
 *                 as on the Jagannath temple at Puri.
 * A crown that carries its own kalashas (the gopuram's row) gets only the flag.
 */
export function buildFinial(
  b: Builder, kind: FinialKind, apex: Vec3, scale: number, kalashHeight: number, ownsFinial: boolean,
): FlagMount | null {
  const kal = new Kalashes(b);
  const [ax, ay, az] = apex;
  const size = kalashHeight * scale;
  if (!ownsFinial) kal.add(apex, size);
  if (kind === "kalash") return null;

  if (kind === "kalash-flag") {
    const off = ownsFinial ? [0, -0.1 * scale] : [Math.max(0.2, size * 0.42) * (scale < 1 ? 1 : scale), 0];
    const poleH = (ownsFinial ? 0.3 : size) + 0.45 * scale;
    const foot: Vec3 = [ax + off[0], ay, az + off[1]];
    b.add("metal", columnShaft(0.007 * scale + 0.002, 0.01 * scale + 0.002, poleH, 8), foot);
    return { top: [foot[0], ay + poleH, foot[2]], scale };
  }

  // The chakra stands upright over the kalash, facing the entrance.
  const top = ownsFinial ? ay + 0.3 : ay + size;
  const r = 0.2 * scale;
  const cy = top + r + 0.03 * scale;
  b.add("metal", new TorusGeometry(r, 0.022 * scale, 8, 40), [ax, cy, az]);
  b.add("metal", new TorusGeometry(r * 0.22, 0.02 * scale, 6, 20), [ax, cy, az]);
  const spoke = bevelledBox(0.016 * scale, r * 1.6, 0.016 * scale, 0.002);
  for (let i = 0; i < 4; i++) {
    // Rotate each spoke in the wheel's own plane: lay it along z, turn about x.
    b.add("metal", spoke, [ax, cy, az], { rotationY: Math.PI / 2, rotationX: (i * Math.PI) / 4 });
  }
  b.add("metal", columnShaft(0.012 * scale, 0.014 * scale, cy - top, 10), [ax, top, az]);
  // The flagpole rises from the top of the wheel, and the pennant is tied at its tip.
  const poleH = 0.5 * scale;
  b.add("metal", columnShaft(0.007 * scale + 0.002, 0.009 * scale + 0.002, poleH, 8), [ax, cy + r, az]);
  return { top: [ax, cy + r + poleH, az], scale };
}
