import { describe, expect, it } from "vitest";
import {
  amalakaProfile, archOutline, domeProfile, facadeSlots, kalashProfile, petalOutline, profileLength,
  ribbedScale, ringPositions, shikharaProfile, stackTiers, sunDirection,
} from "./templeGeometry";

describe("domeProfile", () => {
  it("springs from its radius and closes at the apex on the axis", () => {
    const p = domeProfile({ radius: 1, height: 1.2 });
    expect(p[0]).toEqual([1, 0]);
    expect(p[p.length - 1][0]).toBe(0);
    expect(p[p.length - 1][1]).toBeCloseTo(1.2, 10);
  });

  it("only ever rises, so the lathe never folds back on itself", () => {
    const p = domeProfile({ radius: 1, height: 1, bulge: 0.12, point: 0.3 });
    for (let i = 1; i < p.length; i++) expect(p[i][1]).toBeGreaterThan(p[i - 1][1]);
  });

  it("never crosses the axis", () => {
    const p = domeProfile({ radius: 1, height: 1, bulge: 0.2, point: 0.9 });
    expect(p.every(([x]) => x >= 0)).toBe(true);
  });

  it("swells its shoulders past the springing line when asked to", () => {
    const plain = domeProfile({ radius: 1, height: 1 });
    const swollen = domeProfile({ radius: 1, height: 1, bulge: 0.12 });
    expect(Math.max(...swollen.map(([x]) => x))).toBeGreaterThan(1);
    expect(Math.max(...plain.map(([x]) => x))).toBeCloseTo(1, 10);
  });

  it("draws the crown in when pointed", () => {
    const round = domeProfile({ radius: 1, height: 1, steps: 20 });
    const pointed = domeProfile({ radius: 1, height: 1, point: 0.5, steps: 20 });
    expect(pointed[16][0]).toBeLessThan(round[16][0]);
  });

  it("keeps a usable number of steps however few it is asked for", () => {
    expect(domeProfile({ radius: 1, height: 1, steps: 1 }).length).toBeGreaterThanOrEqual(5);
  });
});

describe("kalashProfile", () => {
  it("stands on the axis and ends in a point on the axis", () => {
    const p = kalashProfile(1);
    expect(p[0]).toEqual([0, 0]);
    expect(p[p.length - 1]).toEqual([0, 1]);
  });

  it("scales to the height it is given", () => {
    const p = kalashProfile(0.5);
    expect(Math.max(...p.map(([, y]) => y))).toBeCloseTo(0.5, 10);
  });

  it("never goes downward, so it reads as one turned piece", () => {
    const p = kalashProfile(1);
    for (let i = 1; i < p.length; i++) expect(p[i][1]).toBeGreaterThanOrEqual(p[i - 1][1]);
  });

  it("has a belly wider than its neck", () => {
    const p = kalashProfile(1);
    const belly = Math.max(...p.filter(([, y]) => y > 0.1 && y < 0.4).map(([x]) => x));
    const neck = Math.min(...p.filter(([, y]) => y > 0.44 && y < 0.5).map(([x]) => x));
    expect(belly).toBeGreaterThan(neck * 2);
  });
});

describe("shikharaProfile", () => {
  it("starts at its base width and ends closed at the top", () => {
    const p = shikharaProfile({ baseHalf: 1, topHalf: 0.3, height: 2.5 });
    expect(p[0]).toEqual([1, 0]);
    expect(p[p.length - 1]).toEqual([0, 2.5]);
  });

  it("tapers all the way up", () => {
    const p = shikharaProfile({ baseHalf: 1, topHalf: 0.3, height: 2 }).slice(0, -1);
    for (let i = 1; i < p.length; i++) expect(p[i][0]).toBeLessThanOrEqual(p[i - 1][0]);
  });

  it("curves in late, like a beehive rather than a cone", () => {
    const p = shikharaProfile({ baseHalf: 1, topHalf: 0, height: 1, steps: 20 });
    // Halfway up, a straight cone would be at 0.5; a shikhara is still wider.
    expect(p[10][0]).toBeGreaterThan(0.6);
  });
});

describe("archOutline", () => {
  it("starts and ends on the sill, either side of the opening", () => {
    const p = archOutline({ width: 0.4, height: 0.8 });
    expect(p[0]).toEqual([-0.2, 0]);
    expect(p[p.length - 1]).toEqual([0.2, 0]);
  });

  it("reaches exactly its height at the crown of the arch", () => {
    const p = archOutline({ width: 0.4, height: 0.8, steps: 16 });
    expect(Math.max(...p.map(([, y]) => y))).toBeCloseTo(0.8, 10);
  });

  it("never pokes outside its own width", () => {
    const p = archOutline({ width: 0.4, height: 0.8 });
    expect(p.every(([x]) => Math.abs(x) <= 0.2 + 1e-9)).toBe(true);
  });

  it("is all head and no jambs when it is no taller than half its width", () => {
    const p = archOutline({ width: 1, height: 0.3 });
    expect(p[1]).toEqual([-0.5, 0]);
  });
});

describe("ringPositions", () => {
  it("spaces points evenly round the circle", () => {
    const p = ringPositions(4, 2);
    expect(p[0][0]).toBeCloseTo(2, 10);
    expect(p[1][1]).toBeCloseTo(2, 10);
    expect(p[2][0]).toBeCloseTo(-2, 10);
  });

  it("returns nothing for nothing", () => {
    expect(ringPositions(0, 1)).toEqual([]);
  });
});

describe("profileLength", () => {
  it("adds up the segments", () => {
    expect(profileLength([[0, 0], [3, 4], [3, 6]])).toBeCloseTo(7, 10);
  });

  it("is zero for a single point", () => {
    expect(profileLength([[1, 1]])).toBe(0);
  });
});

describe("facadeSlots", () => {
  it("centres the bays on the facade", () => {
    expect(facadeSlots(1.8, 3)).toEqual([-0.6, 0, 0.6].map((v) => expect.closeTo(v, 10)));
  });

  it("puts a single bay in the middle", () => {
    expect(facadeSlots(2, 1)).toEqual([0]);
  });

  it("returns nothing for no bays, or a negative count", () => {
    expect(facadeSlots(2, 0)).toEqual([]);
    expect(facadeSlots(2, -3)).toEqual([]);
  });
});

describe("ribbedScale", () => {
  it("is full on a rib's crest", () => {
    expect(ribbedScale(0, 16, 0.1)).toBeCloseTo(1, 10);
    expect(ribbedScale((2 * Math.PI) / 16, 16, 0.1)).toBeCloseTo(1, 10);
  });

  it("dips by the depth halfway between two ribs", () => {
    expect(ribbedScale(Math.PI / 16, 16, 0.1)).toBeCloseTo(0.9, 10);
  });

  it("never goes past the crest or below the groove", () => {
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      const s = ribbedScale(a, 24, 0.12);
      expect(s).toBeLessThanOrEqual(1 + 1e-12);
      expect(s).toBeGreaterThanOrEqual(0.88 - 1e-12);
    }
  });

  it("is a plain circle at zero depth", () => {
    expect(ribbedScale(1.234, 24, 0)).toBe(1);
  });
});

describe("petalOutline", () => {
  const p = petalOutline({ width: 0.3, height: 0.4 });

  it("comes to its point at its full height, on the centre line", () => {
    const tip = p.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(tip).toEqual([0, 0.4]);
  });

  it("is a mirror image about its centre line", () => {
    for (let i = 0; i < p.length; i++) {
      const [x, y] = p[i];
      const [mx, my] = p[p.length - 1 - i];
      expect(mx).toBeCloseTo(-x, 10);
      expect(my).toBeCloseTo(y, 10);
    }
  });

  it("stays inside its width", () => {
    expect(p.every(([x]) => Math.abs(x) <= 0.15 + 1e-9)).toBe(true);
  });

  it("stands on a foot rather than a point", () => {
    expect(p[0][1]).toBe(0);
    expect(Math.abs(p[0][0])).toBeGreaterThan(0.05);
  });
});

describe("stackTiers", () => {
  const tiers = stackTiers({ count: 5, base: [2, 1.5], top: [1, 0.5], height: 0.3, startY: 1 });

  it("starts at the base size and ends at the top size", () => {
    expect(tiers[0]).toMatchObject({ width: 2, depth: 1.5, y: 1 });
    expect(tiers[4].width).toBeCloseTo(1, 10);
    expect(tiers[4].depth).toBeCloseTo(0.5, 10);
  });

  it("sits each storey exactly on the one below", () => {
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].y).toBeCloseTo(tiers[i - 1].y + tiers[i - 1].height, 10);
    }
  });

  it("narrows all the way up", () => {
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].width).toBeLessThan(tiers[i - 1].width);
      expect(tiers[i].depth).toBeLessThan(tiers[i - 1].depth);
    }
  });

  it("gives a lone storey the base size rather than dividing by zero", () => {
    expect(stackTiers({ count: 1, base: [2, 2], top: [1, 1], height: 0.3 })[0].width).toBe(2);
  });
});

describe("sunDirection", () => {
  it("points straight up for a sun overhead", () => {
    const [x, y, z] = sunDirection(90, 0);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it("is a unit vector", () => {
    const [x, y, z] = sunDirection(48.2, 34.2);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
  });

  it("matches where the sun sits in the sky file", () => {
    // Measured from the brightest pixel of the HDRI, (304, 59) of 512x256 —
    // to the half-pixel that measurement is good to.
    const [x, y, z] = sunDirection(48.2, 34.2);
    expect(x).toBeCloseTo(0.551, 2);
    expect(y).toBeCloseTo(0.746, 2);
    expect(z).toBeCloseTo(0.375, 2);
  });
});

describe("amalakaProfile", () => {
  const p = amalakaProfile(0.4, 0.2);

  it("closes on the axis at its foot and its crown", () => {
    expect(p[0]).toEqual([0, 0]);
    expect(p[p.length - 1][0]).toBe(0);
    expect(p[p.length - 1][1]).toBeCloseTo(0.2, 10);
  });

  it("is widest halfway up, at its full radius", () => {
    const widest = p.reduce((a, b) => (b[0] > a[0] ? b : a));
    expect(widest[0]).toBeCloseTo(0.4, 10);
    expect(widest[1]).toBeCloseTo(0.1, 10);
  });

  it("only ever rises", () => {
    for (let i = 1; i < p.length; i++) expect(p[i][1]).toBeGreaterThan(p[i - 1][1]);
  });
});
