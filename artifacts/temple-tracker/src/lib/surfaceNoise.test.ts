import { describe, expect, it } from "vitest";
import {
  latticeOctave, MAX_ROUGHNESS_BYTE, MIN_ROUGHNESS_BYTE,
  roughnessTile, seededRandom, TILE_SIZE,
} from "./surfaceNoise";

describe("seededRandom", () => {
  it("gives the same sequence for the same seed", () => {
    const a = seededRandom(42), b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("gives a different sequence for a different seed", () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });

  it("stays inside [0, 1)", () => {
    const r = seededRandom(7);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("latticeOctave", () => {
  it("wraps, so a tile meets itself without a seam", () => {
    const octave = latticeOctave(4, seededRandom(3));
    // x = 0 and x = 4 are the same point on a 4-wide wrapped lattice.
    expect(octave(0, 1.5)).toBeCloseTo(octave(4, 1.5), 10);
    expect(octave(1.5, 0)).toBeCloseTo(octave(1.5, 4), 10);
  });

  it("returns a value in the range its lattice was built from", () => {
    const octave = latticeOctave(8, seededRandom(9));
    for (let i = 0; i < 100; i++) {
      const v = octave(Math.random() * 8, Math.random() * 8);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("varies across the lattice rather than returning one flat value", () => {
    const octave = latticeOctave(4, seededRandom(11));
    const samples = new Set([octave(0.3, 0.7), octave(1.8, 2.2), octave(3.1, 1.4)].map(v => v.toFixed(6)));
    expect(samples.size).toBeGreaterThan(1);
  });
});

describe("roughnessTile", () => {
  it("fills one byte per pixel", () => {
    expect(roughnessTile(16).length).toBe(16 * 16);
  });

  it("never goes dark enough to turn the temple into a mirror", () => {
    const tile = roughnessTile();
    for (const byte of tile) {
      expect(byte).toBeGreaterThanOrEqual(MIN_ROUGHNESS_BYTE);
      expect(byte).toBeLessThanOrEqual(MAX_ROUGHNESS_BYTE);
    }
  });

  it("keeps the floor well clear of black", () => {
    // A roughness map multiplies, so the darkest patch still has to read as stone.
    expect(MIN_ROUGHNESS_BYTE / MAX_ROUGHNESS_BYTE).toBeGreaterThan(0.5);
  });

  it("is the same tile every time, so every visitor sees one temple", () => {
    expect(Array.from(roughnessTile(32))).toEqual(Array.from(roughnessTile(32)));
  });

  it("actually varies — a flat tile would be no better than no map at all", () => {
    const tile = roughnessTile();
    expect(new Set(tile).size).toBeGreaterThan(20);
  });

  it("defaults to a tile small enough to be cheap", () => {
    expect(TILE_SIZE).toBeLessThanOrEqual(256);
  });
});
