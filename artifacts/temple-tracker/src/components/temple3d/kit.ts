// A temple is a few hundred stones but only a handful of materials, so it is
// built as one mesh per material: every marble part merged into one geometry,
// every gold part into another. The whole building then costs about seven draw
// calls, which is what lets it turn smoothly on a phone with shadows on.

import type { BufferGeometry } from "three";
import { merged, placed, type Placement, type Vec3 } from "./geometry";

/** The material a part is made of — the keys of TempleMaterials. */
export type Stuff =
  | "marble" | "marblePolished" | "marbleTrim" | "sandstone" | "granite"
  | "gold" | "glaze" | "glass" | "shade" | "wood";

export class Kit {
  private parts = new Map<Stuff, BufferGeometry[]>();
  /** Every shape handed in, placed once or many times; freed after build. */
  private shapes = new Set<BufferGeometry>();

  /** Put a copy of `geo`, made of `stuff`, at `at`. */
  add(stuff: Stuff, geo: BufferGeometry, at: Vec3 = [0, 0, 0], how: Placement = {}): this {
    this.shapes.add(geo);
    const list = this.parts.get(stuff) ?? [];
    list.push(placed(geo, at, how));
    this.parts.set(stuff, list);
    return this;
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
