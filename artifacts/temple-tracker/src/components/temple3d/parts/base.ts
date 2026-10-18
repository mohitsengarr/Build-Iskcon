// What the temple stands on.

import type { BaseKind } from "@/lib/templeDesign";
import { bevelledBox } from "../geometry";
import type { Builder } from "../kit";

export const PLINTH_WIDTH = 3.9;

export interface BaseFrame {
  /** The floor the walls stand on. */
  top: number;
  /** Half-width of that floor: how far a porch may reach. */
  topHalf: number;
}

const STEPPED = [
  { width: PLINTH_WIDTH, height: 0.12 },
  { width: 3.62, height: 0.12 },
  { width: 3.34, height: 0.14 },
] as const;

/**
 * stepped: three broad steps, the TOVP's plinth.
 * high:    a jagati — two steps and then a tall platform banded with
 *          mouldings, the raised terrace a Nagara or Kalinga temple stands on.
 */
export function buildBase(b: Builder, kind: BaseKind): BaseFrame {
  if (kind === "high") {
    b.add("trim", bevelledBox(PLINTH_WIDTH, 0.12, PLINTH_WIDTH, 0.015), [0, 0.06, 0]);
    b.add("trim", bevelledBox(3.62, 0.12, 3.62, 0.015), [0, 0.18, 0]);
    const core = 0.3;
    b.add("stone", bevelledBox(3.4, core, 3.4, 0.012), [0, 0.24 + core / 2, 0]);
    const band = bevelledBox(3.48, 0.045, 3.48, 0.01);
    b.add("trim", band, [0, 0.24 + 0.0225, 0]);
    b.add("trim", band, [0, 0.24 + core - 0.0225, 0]);
    b.add("trim", bevelledBox(3.44, 0.03, 3.44, 0.008), [0, 0.24 + core / 2, 0]);
    return { top: 0.24 + core, topHalf: 1.7 };
  }
  let y = 0;
  for (const { width, height } of STEPPED) {
    b.add("trim", bevelledBox(width, height, width, 0.015), [0, y + height / 2, 0]);
    y += height;
  }
  return { top: y, topHalf: STEPPED[STEPPED.length - 1].width / 2 };
}
