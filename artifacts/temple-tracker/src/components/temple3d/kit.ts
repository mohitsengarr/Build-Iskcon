// A temple is a few hundred stones but only a handful of materials, so it is
// built as one mesh per material: every stone part merged into one geometry,
// every gold part into another. The whole building then costs about seven draw
// calls, which is what lets it turn smoothly on a phone with shadows on.
//
// Parts are added by role, not by material — "stone", "trim", "crown" — and the
// design decides what each role is made of: the same walls are white marble in
// one temple and red sandstone in the next, the same dome cobalt or gold.

import type { BufferGeometry } from "three";
import { merged, placed, type Placement, type Vec3 } from "./geometry";

/** What a part is made of, by its role in the building. */
export type Stuff =
  | "stone"   // the walls and most of the building
  | "trim"    // mouldings, frames, plinth: the stone's companion
  | "crown"   // the dome or tower's surface, in the design's finish
  | "metal"   // gilding: kalash, ribs, petals
  | "glass" | "shade" | "wood";

/** Anything parts can be added to: the kit itself, or a scaled region of it. */
export interface Builder {
  add(stuff: Stuff, geo: BufferGeometry, at?: Vec3, how?: Placement): void;
}

export class Kit implements Builder {
  private parts = new Map<Stuff, BufferGeometry[]>();
  /** Every shape handed in, placed once or many times; freed after build. */
  private shapes = new Set<BufferGeometry>();

  /** Put a copy of `geo`, made of `stuff`, at `at`. */
  add(stuff: Stuff, geo: BufferGeometry, at: Vec3 = [0, 0, 0], how: Placement = {}): void {
    this.shapes.add(geo);
    const list = this.parts.get(stuff) ?? [];
    list.push(placed(geo, at, how));
    this.parts.set(stuff, list);
  }

  /** One merged geometry per material. */
  build(): Array<[Stuff, BufferGeometry]> {
    const out: Array<[Stuff, BufferGeometry]> = [];
    for (const [stuff, list] of this.parts) {
      out.push([stuff, merged(list)]);
      for (const g of list) g.dispose();
    }
    for (const g of this.shapes) g.dispose();
    this.parts.clear();
    this.shapes.clear();
    return out;
  }
}

/**
 * A region of a builder moved to `origin` and scaled by `scale`: what a crown
 * built at its own nominal size uses to sit on a smaller or larger roof.
 * Uniform scale commutes with rotation, so it folds into each part's own.
 */
export function scoped(builder: Builder, origin: Vec3, scale: number): Builder {
  return {
    add(stuff, geo, at = [0, 0, 0], how = {}) {
      const s = how.scale ?? 1;
      const local: Vec3 = typeof s === "number" ? [s, s, s] : s;
      builder.add(stuff, geo, [origin[0] + at[0] * scale, origin[1] + at[1] * scale, origin[2] + at[2] * scale], {
        ...how,
        scale: [local[0] * scale, local[1] * scale, local[2] * scale],
      });
    },
  };
}
