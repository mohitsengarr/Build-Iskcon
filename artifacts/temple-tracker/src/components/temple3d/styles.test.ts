import { describe, expect, it } from "vitest";
import { Box3, type BufferGeometry } from "three";
import { TEMPLE_STYLES } from "@/lib/communityTemples";
import { PLINTH_WIDTH, buildTemple } from "./styles";

const STYLES = TEMPLE_STYLES.map((s) => s.key);

function bounds(meshes: Array<[string, BufferGeometry]>): Box3 {
  const box = new Box3();
  for (const [, g] of meshes) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return box;
}

describe("buildTemple", () => {
  it.each(STYLES)("%s builds into one mesh per material, never two", (style) => {
    const { meshes } = buildTemple(style);
    const stuffs = meshes.map(([s]) => s);
    expect(new Set(stuffs).size).toBe(stuffs.length);
    // A whole building in a handful of draw calls, which is the point of merging.
    expect(meshes.length).toBeLessThanOrEqual(8);
  });

  it.each(STYLES)("%s stands on the ground, not in it or above it", (style) => {
    const box = bounds(buildTemple(style).meshes);
    expect(box.min.y).toBeCloseTo(0, 6);
  });

  it.each(STYLES)("%s stays on its plinth, square to the middle", (style) => {
    const box = bounds(buildTemple(style).meshes);
    expect(box.max.x).toBeCloseTo(PLINTH_WIDTH / 2, 2);
    expect(box.min.x).toBeCloseTo(-PLINTH_WIDTH / 2, 2);
    expect(box.min.z).toBeCloseTo(-PLINTH_WIDTH / 2, 2);
    // Nothing reaches past the plinth's front edge, the porch included.
    expect(box.max.z).toBeLessThanOrEqual(PLINTH_WIDTH / 2 + 1e-6);
  });

  it.each(STYLES)("%s rises to a temple's height, so the camera frames them alike", (style) => {
    const box = bounds(buildTemple(style).meshes);
    expect(box.max.y).toBeGreaterThan(3.9);
    expect(box.max.y).toBeLessThan(4.8);
  });

  it.each(STYLES)("%s has no broken vertices", (style) => {
    for (const [stuff, g] of buildTemple(style).meshes) {
      const pos = g.getAttribute("position").array;
      const finite = Array.prototype.every.call(pos, (v: number) => Number.isFinite(v));
      expect(finite, `${stuff} has a NaN or infinite position`).toBe(true);
      expect(g.getAttribute("normal"), `${stuff} has no normals`).toBeTruthy();
      expect(g.getAttribute("uv"), `${stuff} has no UVs for its texture`).toBeTruthy();
    }
  });

  it("crowns every temple in gold", () => {
    for (const style of STYLES) {
      expect(buildTemple(style).meshes.map(([s]) => s)).toContain("gold");
    }
  });

  it("gives the TOVP its blue tiled dome and glazed windows", () => {
    const stuffs = buildTemple("tovp-dome").meshes.map(([s]) => s);
    expect(stuffs).toContain("glaze");
    expect(stuffs).toContain("glass");
  });

  it("builds the shikhara and the gopuram in stone, not marble", () => {
    const nagara = buildTemple("north-shikhara").meshes.map(([s]) => s);
    const dravida = buildTemple("south-gopuram").meshes.map(([s]) => s);
    expect(nagara).toContain("sandstone");
    expect(dravida).toContain("granite");
    expect([...nagara, ...dravida].some((s) => s.startsWith("marble"))).toBe(false);
  });

  it("flies a flag over the shikhara only, above its kalash", () => {
    const nagara = buildTemple("north-shikhara");
    expect(nagara.flag).not.toBeNull();
    const top = bounds(nagara.meshes.filter(([s]) => s !== "gold")).max.y;
    expect(nagara.flag![1]).toBeGreaterThan(top);
    for (const style of STYLES.filter((s) => s !== "north-shikhara")) {
      expect(buildTemple(style).flag).toBeNull();
    }
  });

  it("falls back to the TOVP for a style it does not know", () => {
    const unknown = buildTemple("art-deco" as never).meshes.map(([s]) => s).sort();
    const tovp = buildTemple("tovp-dome").meshes.map(([s]) => s).sort();
    expect(unknown).toEqual(tovp);
  });
});
