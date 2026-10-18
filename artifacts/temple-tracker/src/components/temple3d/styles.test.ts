import { describe, expect, it } from "vitest";
import { Box3, type BufferGeometry } from "three";
import {
  BASES, BODIES, CORNERS, CROWNS, DEFAULT_DESIGN, FINIALS, PORCHES, PRESETS, type TempleDesign,
} from "@/lib/templeDesign";
import { MAX_TOP, PLINTH_WIDTH, buildTemple, crownScale } from "./styles";

function bounds(meshes: Array<[string, BufferGeometry]>): Box3 {
  const box = new Box3();
  for (const [, g] of meshes) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return box;
}

/** Everything a design must be, whatever it is made of. */
function expectSound(design: TempleDesign, label: string) {
  const { meshes, flag } = buildTemple(design);
  const roles = meshes.map(([s]) => s);
  expect(new Set(roles).size, `${label}: a role built twice`).toBe(roles.length);
  expect(meshes.length, `${label}: too many draw calls`).toBeLessThanOrEqual(7);
  const box = bounds(meshes);
  expect(box.min.y, `${label}: not standing on the ground`).toBeCloseTo(0, 6);
  expect(box.max.x, `${label}: off the plinth`).toBeLessThanOrEqual(PLINTH_WIDTH / 2 + 1e-6);
  expect(box.min.x, `${label}: off the plinth`).toBeGreaterThanOrEqual(-PLINTH_WIDTH / 2 - 1e-6);
  expect(box.max.z, `${label}: off the plinth`).toBeLessThanOrEqual(PLINTH_WIDTH / 2 + 1e-6);
  expect(box.min.z, `${label}: off the plinth`).toBeGreaterThanOrEqual(-PLINTH_WIDTH / 2 - 1e-6);
  expect(box.max.y, `${label}: taller than the frame allows`).toBeLessThanOrEqual(MAX_TOP + 0.02);
  expect(roles, `${label}: no gilding`).toContain("metal");
  for (const [role, g] of meshes) {
    const pos = g.getAttribute("position").array;
    expect(Array.prototype.every.call(pos, (v: number) => Number.isFinite(v)), `${label}: ${role} has a broken vertex`).toBe(true);
    expect(g.getAttribute("uv"), `${label}: ${role} has no UVs`).toBeTruthy();
  }
  if (flag) expect(flag.top[1], `${label}: flag below the roof`).toBeGreaterThan(1.5);
  return { box, flag };
}

describe("every one of the 108 styles", () => {
  it.each(PRESETS.map((p) => [p.id, p.design] as const))("%s builds sound", (id, design) => {
    expectSound(design, id);
  });
});

describe("every crown on every kind of walls, on either base", () => {
  const combos = CROWNS.flatMap((crown) => BODIES.flatMap((body) => BASES.map((base) => ({ crown, body, base }))));
  it.each(combos.map((c) => [`${c.crown} on ${c.body}, ${c.base}`, c] as const))("%s", (label, c) => {
    expectSound({ ...DEFAULT_DESIGN, preset: undefined, ...c, corners: "chhatris", porch: "portico" }, label);
  });
});

describe("every porch, corner piece and pinnacle", () => {
  it.each(PORCHES.map((p) => [p] as const))("porch %s fits on each kind of walls", (porch) => {
    for (const body of BODIES) expectSound({ ...DEFAULT_DESIGN, porch, body }, `${porch} on ${body}`);
  });

  it.each(CORNERS.map((c) => [c] as const))("corners %s", (corners) => {
    expectSound({ ...DEFAULT_DESIGN, corners }, corners);
  });

  it.each(FINIALS.map((f) => [f] as const))("pinnacle %s", (finial) => {
    expectSound({ ...DEFAULT_DESIGN, finial }, finial);
  });
});

describe("the pinnacle", () => {
  it("flies a flag only when asked for one", () => {
    expect(buildTemple({ ...DEFAULT_DESIGN, finial: "kalash" }).flag).toBeNull();
    expect(buildTemple({ ...DEFAULT_DESIGN, finial: "kalash-flag" }).flag).not.toBeNull();
    expect(buildTemple({ ...DEFAULT_DESIGN, finial: "chakra-flag" }).flag).not.toBeNull();
  });

  it("flies the flag above everything else", () => {
    for (const p of PRESETS.filter((x) => x.design.finial !== "kalash")) {
      const { meshes, flag } = buildTemple(p.design);
      const top = bounds(meshes.filter(([s]) => s !== "metal")).max.y;
      expect(flag!.top[1], p.id).toBeGreaterThan(top);
    }
  });

  it("flies the gopuram's flag from the vault, which carries its own kalashas", () => {
    const flag = buildTemple({ ...DEFAULT_DESIGN, body: "pillared", crown: "gopuram", finial: "kalash-flag" }).flag;
    expect(flag).not.toBeNull();
  });
});

describe("crownScale", () => {
  const hall = { roofY: 1.94, half: 1.25, crownHalf: 1.08 };

  it("draws the Planetarium dome at its own size on the hall it was designed for", () => {
    expect(crownScale(DEFAULT_DESIGN, hall)).toBeCloseTo(1, 2);
  });

  it("shrinks a square tower to clear chhatris at the roof's corners", () => {
    const withChhatris = crownScale({ ...DEFAULT_DESIGN, crown: "shikhara", corners: "chhatris" }, hall);
    const plain = crownScale({ ...DEFAULT_DESIGN, crown: "shikhara", corners: "none" }, hall);
    expect(withChhatris).toBeLessThan(plain);
  });

  it("lets small spires press against the tower, as karna-shringas do", () => {
    const spires = crownScale({ ...DEFAULT_DESIGN, crown: "shikhara", corners: "spires" }, hall);
    const plain = crownScale({ ...DEFAULT_DESIGN, crown: "shikhara", corners: "none" }, hall);
    expect(spires).toBe(plain);
  });

  it("keeps a tall tower inside the frame on a high roof", () => {
    const s = crownScale({ ...DEFAULT_DESIGN, crown: "rekha", corners: "none" }, { roofY: 2.1, half: 1.25, crownHalf: 1.08 });
    expect(s).toBeLessThan(1);
  });
});
