import { describe, expect, it } from "vitest";
import { groundShadowTile } from "./groundShadow";

const SIZE = 64;
const OPTS = { half: 0.3, falloff: 0.12, strength: 0.5 };
const at = (tile: Uint8ClampedArray, x: number, y: number) => tile[y * SIZE + x];

describe("groundShadowTile", () => {
  it("fills one alpha byte per pixel", () => {
    expect(groundShadowTile(SIZE, OPTS)).toHaveLength(SIZE * SIZE);
  });

  it("is at full strength under the plinth", () => {
    const tile = groundShadowTile(SIZE, OPTS);
    expect(at(tile, SIZE / 2, SIZE / 2)).toBe(Math.round(0.5 * 255));
  });

  it("fades to nothing at the edge of the tile, so the plane has no visible border", () => {
    const tile = groundShadowTile(SIZE, OPTS);
    expect(at(tile, 0, 0)).toBe(0);
    expect(at(tile, SIZE - 1, SIZE / 2)).toBe(0);
  });

  it("keeps the corners of a square base in shadow, which a disc would not", () => {
    // A point just inside the plinth's corner, on the diagonal.
    const tile = groundShadowTile(SIZE, OPTS);
    const corner = Math.round((0.5 - 0.29) * SIZE);
    expect(at(tile, corner, corner)).toBe(Math.round(0.5 * 255));
  });

  it("falls off smoothly just past the edge rather than stopping dead", () => {
    const tile = groundShadowTile(SIZE, OPTS);
    const row = SIZE / 2;
    const edge = Math.round((0.5 + 0.3) * SIZE);         // the plinth's right edge
    const mid = Math.round((0.5 + 0.3 + 0.06) * SIZE);   // halfway through the falloff
    expect(at(tile, edge, row)).toBeGreaterThan(at(tile, mid, row));
    expect(at(tile, mid, row)).toBeGreaterThan(0);
  });

  it("is symmetric, so it sits square under the temple", () => {
    const tile = groundShadowTile(SIZE, OPTS);
    expect(at(tile, 10, SIZE / 2)).toBe(at(tile, SIZE - 1 - 10, SIZE / 2));
    expect(at(tile, SIZE / 2, 10)).toBe(at(tile, SIZE / 2, SIZE - 1 - 10));
  });

  it("never exceeds the strength it was asked for", () => {
    const tile = groundShadowTile(SIZE, OPTS);
    expect(Math.max(...tile)).toBeLessThanOrEqual(Math.round(0.5 * 255));
  });

  it("clamps a strength outside 0-1", () => {
    expect(Math.max(...groundShadowTile(8, { ...OPTS, strength: 3 }))).toBe(255);
    expect(Math.max(...groundShadowTile(8, { ...OPTS, strength: -1 }))).toBe(0);
  });

  it("survives a zero falloff without dividing by zero", () => {
    const tile = groundShadowTile(SIZE, { ...OPTS, falloff: 0 });
    expect(tile.every((b) => Number.isFinite(b))).toBe(true);
  });
});
