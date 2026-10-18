import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_RGB, opaqueBackgroundBehind, parseCssColor,
  srgbChannelToLinear, srgbToLinear,
} from "./colorSpace";

describe("srgbChannelToLinear", () => {
  it("leaves black and white where they are", () => {
    expect(srgbChannelToLinear(0)).toBe(0);
    expect(srgbChannelToLinear(1)).toBeCloseTo(1, 10);
  });

  it("uses the straight segment below the knee", () => {
    expect(srgbChannelToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 10);
  });

  it("darkens a mid-grey, as linear light does", () => {
    // sRGB 0.5 is about 21% linear — the curve that made the cream need converting.
    expect(srgbChannelToLinear(0.5)).toBeCloseTo(0.214, 3);
  });

  it("clamps values outside 0-1 rather than producing nonsense", () => {
    expect(srgbChannelToLinear(-0.2)).toBe(0);
    expect(srgbChannelToLinear(1.4)).toBeCloseTo(1, 10);
  });
});

describe("srgbToLinear", () => {
  it("converts the page cream to the linear value the GPU needs", () => {
    const [r, g, b] = srgbToLinear(DEFAULT_PAGE_RGB);
    expect(r).toBeCloseTo(0.9647, 3);
    expect(g).toBeCloseTo(0.9216, 3);
    expect(b).toBeCloseTo(0.855, 3);
  });
});

describe("parseCssColor", () => {
  it("reads the comma form browsers report", () => {
    expect(parseCssColor("rgb(251, 246, 238)")).toEqual({ rgb: [251, 246, 238], alpha: 1 });
  });

  it("reads an alpha channel", () => {
    expect(parseCssColor("rgba(255, 255, 255, 0.7)")).toEqual({ rgb: [255, 255, 255], alpha: 0.7 });
  });

  it("reads the newer space-separated form, with a slash before alpha", () => {
    expect(parseCssColor("rgb(251 246 238 / 50%)")).toEqual({ rgb: [251, 246, 238], alpha: 0.5 });
  });

  it("treats the transparent default as alpha zero", () => {
    expect(parseCssColor("rgba(0, 0, 0, 0)")?.alpha).toBe(0);
  });

  it("clamps channels a browser would never report", () => {
    expect(parseCssColor("rgb(300, -5, 128)")).toBeNull();   // the minus sign is not a number it accepts
    expect(parseCssColor("rgb(300, 20, 128)")?.rgb).toEqual([255, 20, 128]);
  });

  it("returns null for anything that is not an rgb() colour", () => {
    expect(parseCssColor("transparent")).toBeNull();
    expect(parseCssColor("#fbf6ee")).toBeNull();
    expect(parseCssColor(undefined)).toBeNull();
  });
});

describe("opaqueBackgroundBehind", () => {
  // A tiny stand-in for the DOM: each node knows its parent and its background.
  type Node = { parentElement: Node | null; bg: string };
  const chain = (...bgs: string[]): Node => {
    let parent: Node | null = null;
    for (let i = bgs.length - 1; i >= 0; i--) parent = { parentElement: parent, bg: bgs[i] };
    return parent!;
  };
  const read = (el: unknown) => (el as Node).bg;

  it("finds the card the canvas sits in", () => {
    const canvas = chain("rgba(0, 0, 0, 0)", "rgb(251, 246, 238)", "rgb(255, 255, 255)");
    expect(opaqueBackgroundBehind(canvas, read)).toEqual([251, 246, 238]);
  });

  it("steps over a semi-transparent layer to the opaque surface beneath", () => {
    const canvas = chain("rgba(255, 255, 255, 0.7)", "rgb(240, 230, 220)");
    expect(opaqueBackgroundBehind(canvas, read)).toEqual([240, 230, 220]);
  });

  it("falls back to the cream when nothing opaque is found", () => {
    const canvas = chain("rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)");
    expect(opaqueBackgroundBehind(canvas, read)).toEqual(DEFAULT_PAGE_RGB);
  });

  it("falls back to the cream when there is no element at all", () => {
    expect(opaqueBackgroundBehind(null, read)).toEqual(DEFAULT_PAGE_RGB);
  });
});
