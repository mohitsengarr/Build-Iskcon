// What every part of the temple shares: where things sit on a face, the four
// corners, and the kalash, which crowns nearly everything.

import type { BufferGeometry } from "three";
import { kalashProfile } from "@/lib/templeGeometry";
import { FACES, latheFrom, type Vec3 } from "../geometry";
import type { Builder } from "../kit";

export type Face = (typeof FACES)[number];

/** Where on a face a point `along` it, `out` from the centre, ends up. */
export function onFace(face: Face, along: number, y: number, out: number): Vec3 {
  const t = face.rotationY;
  return [along * Math.cos(t) + out * Math.sin(t), y, -along * Math.sin(t) + out * Math.cos(t)];
}

export const corners = (d: number): Array<[number, number]> => [[d, d], [-d, d], [d, -d], [-d, -d]];

/** Lathe shapes reused at one size across a building — kalash of a given height. */
export class Kalashes {
  private bySize = new Map<number, BufferGeometry>();
  constructor(private builder: Builder) {}
  add(at: Vec3, height: number) {
    let geo = this.bySize.get(height);
    if (!geo) {
      // A finial a few pixels tall needs no more sides than one the size of a hand.
      const sides = Math.round(Math.min(32, Math.max(10, height * 80)));
      geo = latheFrom(kalashProfile(height), sides);
      this.bySize.set(height, geo);
    }
    this.builder.add("metal", geo, at);
  }
}

/** What the walls hand on to the rest of the building. */
export interface BodyFrame {
  /** Floor level the walls stand on. */
  floor: number;
  /** Height of the walls, floor to cornice. */
  wallHeight: number;
  /** Top of the roof, where the crown and the corner pieces stand. */
  roofY: number;
  /** Half-width of the roof. */
  half: number;
  /** Half-width of the roof a crown may use, inside parapets and fringes. */
  crownHalf: number;
  /** Where the front wall's face is, along +z. */
  front: number;
}
