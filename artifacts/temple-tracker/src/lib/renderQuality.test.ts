import { describe, expect, it } from "vitest";
import { DENSE_DPR, fxSettings, initialFxLevel, PHONE_WIDTH, stepDown } from "./renderQuality";

describe("initialFxLevel", () => {
  it("starts a desktop at the full finish", () => {
    expect(initialFxLevel({ width: 1440, dpr: 2 })).toBe("full");
  });

  it("starts a phone light", () => {
    expect(initialFxLevel({ width: 390, dpr: 3 })).toBe("lite");
  });

  it("starts a very dense screen light, even when it is wide", () => {
    expect(initialFxLevel({ width: 1440, dpr: 3 })).toBe("lite");
  });

  it("treats the phone breakpoint itself as not a phone", () => {
    expect(initialFxLevel({ width: PHONE_WIDTH, dpr: 1 })).toBe("full");
    expect(initialFxLevel({ width: PHONE_WIDTH - 1, dpr: 1 })).toBe("lite");
  });

  it("treats the density threshold itself as not dense", () => {
    expect(initialFxLevel({ width: 1440, dpr: DENSE_DPR })).toBe("full");
  });

  it("starts light when it cannot tell what it is running on", () => {
    expect(initialFxLevel({ width: Number.NaN, dpr: 1 })).toBe("lite");
    expect(initialFxLevel({ width: 1440, dpr: Number.POSITIVE_INFINITY })).toBe("lite");
  });
});

describe("stepDown", () => {
  it("drops the full finish to the light one", () => {
    expect(stepDown("full")).toBe("lite");
  });

  it("drops the light finish to none", () => {
    expect(stepDown("lite")).toBe("off");
  });

  it("stays at none rather than wrapping round to full", () => {
    expect(stepDown("off")).toBe("off");
  });
});

describe("fxSettings", () => {
  it("draws nothing extra when switched off", () => {
    expect(fxSettings("off")).toBeNull();
  });

  it("saves in the light level through fewer samples, not lower resolution", () => {
    expect(fxSettings("lite")).toEqual({ multisampling: 2, aoQuality: "performance", aoHalfRes: false });
  });

  it("never renders the occlusion at half resolution, which drew a grey slab on phones", () => {
    for (const level of ["full", "lite"] as const) {
      expect(fxSettings(level)!.aoHalfRes).toBe(false);
    }
  });

  it("spends more on antialiasing in the full level than the light one", () => {
    expect(fxSettings("full")!.multisampling).toBeGreaterThan(fxSettings("lite")!.multisampling);
  });

  it("keeps some antialiasing on every level that draws, since the composer ignores the canvas's own", () => {
    for (const level of ["full", "lite"] as const) {
      expect(fxSettings(level)!.multisampling).toBeGreaterThan(0);
    }
  });
});
