// A temple from a design: base, walls, porch, crown, roof corners and pinnacle,
// each a part that fits itself to the one below it (parts/).
//
// The crown is the part with the most to fit. It is built at its own natural
// size and then scaled to the roof it stands on: no wider than the roof leaves
// room for (after any chhatris at the corners), and no taller than keeps the
// whole temple, pinnacle and all, inside the frame the camera is set for.
//
// Dimensions are in scene units, y up, standing on y = 0, the entrance facing
// +z. Pure geometry — no React, no WebGL — so every design is built and
// checked in tests.

import type { BufferGeometry } from "three";
import type { TempleDesign } from "@/lib/templeDesign";
import { Kit, scoped, type Stuff } from "./kit";
import { buildBase } from "./parts/base";
import { buildBody } from "./parts/body";
import { buildPorch } from "./parts/porch";
import { CROWN_SPECS } from "./parts/crown";
import { buildCorners, buildFinial, cornerPieceHalf, type FlagMount } from "./parts/roof";

export { PLINTH_WIDTH } from "./parts/base";

/** The highest a pinnacle may reach: what the camera's framing allows for. */
export const MAX_TOP = 4.75;
/** Below this a crown would read as a model on a roof rather than its crown. */
const MIN_CROWN_SCALE = 0.5;
const MAX_CROWN_SCALE = 1.1;
/**
 * How far a pinnacle reaches above its kalash, at natural size: a flagpole's
 * length, or the Sudarshana chakra and the pole over it. Counted in the crown's
 * height, so a chakra and flag never push a temple out of frame.
 */
const PINNACLE_EXTRA: Record<TempleDesign["finial"], number> = {
  kalash: 0,
  "kalash-flag": 0.45,
  "chakra-flag": 0.95,
};

export interface TempleParts {
  /** One merged geometry per role. */
  meshes: Array<[Stuff, BufferGeometry]>;
  /** Where a flag flies, if this design has one. */
  flag: FlagMount | null;
}

/** How large the crown is drawn, relative to its natural size, on these walls. */
export function crownScale(design: TempleDesign, roof: { roofY: number; half: number; crownHalf: number }): number {
  const spec = CROWN_SPECS[design.crown];
  let room = roof.crownHalf;
  if (design.corners === "chhatris" || design.corners === "finials") {
    // Corner pieces stand inside the roof's corners. A round drum can pass
    // between them; a square tower has to stop short of them.
    const c = cornerPieceHalf(design.corners);
    const free = spec.round ? (roof.half - c) * Math.SQRT2 - c - 0.02 : roof.half - 2 * c - 0.02;
    room = Math.min(room, free);
  }
  const byWidth = room / spec.half;
  const byHeight = (MAX_TOP - roof.roofY) / (spec.height + spec.finial + PINNACLE_EXTRA[design.finial]);
  return Math.max(MIN_CROWN_SCALE, Math.min(MAX_CROWN_SCALE, byWidth, byHeight));
}

export function buildTemple(design: TempleDesign): TempleParts {
  const kit = new Kit();
  const base = buildBase(kit, design.base);
  const body = buildBody(kit, design.body, base.top);
  buildPorch(kit, design.porch, body, base.topHalf);

  const spec = CROWN_SPECS[design.crown];
  const s = crownScale(design, body);
  const { apex, ownsFinial = false } = spec.build(scoped(kit, [0, body.roofY, 0], s));
  const worldApex: [number, number, number] = [apex[0] * s, body.roofY + apex[1] * s, apex[2] * s];

  buildCorners(kit, design.corners, body, design.crown);
  const flag = buildFinial(kit, design.finial, worldApex, s, spec.finial, ownsFinial);
  return { meshes: kit.build(), flag };
}
