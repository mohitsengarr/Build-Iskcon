import { describe, expect, it } from "vitest";
import {
  CROWNS, DEFAULT_DESIGN, FAMILIES, PRESETS, STONES, VARIANTS_PER_FAMILY,
  designForStyle, designLabel, legacyStyleOf, normalizeDesign, presetById, sameParts, withPart,
} from "./templeDesign";

describe("the 108 styles", () => {
  it("are exactly 108", () => {
    expect(PRESETS).toHaveLength(108);
  });

  it("are twelve families of nine", () => {
    expect(FAMILIES).toHaveLength(12);
    for (const f of FAMILIES) {
      expect(PRESETS.filter((p) => p.family.key === f.key)).toHaveLength(VARIANTS_PER_FAMILY);
    }
  });

  it("each have their own id and their own name", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(108);
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(108);
  });

  it("never repeat a look within a family", () => {
    for (const f of FAMILIES) {
      const looks = PRESETS.filter((p) => p.family.key === f.key).map((p) => `${p.design.stone}/${p.design.finish}`);
      expect(new Set(looks).size).toBe(looks.length);
    }
  });

  it("lead each family with its classic form, named for the family alone", () => {
    for (const f of FAMILIES) {
      const first = PRESETS.find((p) => p.family.key === f.key)!;
      expect(first.id).toBe(`${f.key}-classic`);
      expect(first.name).toBe(f.name);
      expect(first.design.stone).toBe(f.stone);
    }
  });

  it("use every kind of crown somewhere", () => {
    const used = new Set(PRESETS.map((p) => p.design.crown));
    for (const c of CROWNS) expect(used).toContain(c);
  });

  it("use every stone somewhere", () => {
    const used = new Set(PRESETS.map((p) => p.design.stone));
    for (const s of STONES) expect(used).toContain(s);
  });

  it("each remember which style they are", () => {
    for (const p of PRESETS) expect(p.design.preset).toBe(p.id);
  });
});

describe("designForStyle", () => {
  it("shows a temple saved before designs as the family its style was", () => {
    expect(designForStyle("north-shikhara").crown).toBe("shikhara");
    expect(designForStyle("south-gopuram").crown).toBe("gopuram");
    expect(designForStyle("modern-vedic").crown).toBe("faceted-dome");
    expect(designForStyle("tovp-dome").crown).toBe("planetarium-dome");
  });

  it("falls back to the Planetarium for no style at all", () => {
    expect(designForStyle(null).preset).toBe("planetarium-classic");
  });
});

describe("legacyStyleOf", () => {
  it("files a design under the nearest of the old four styles", () => {
    expect(legacyStyleOf(presetById("kalinga-gold")!.design)).toBe("north-shikhara");
    expect(legacyStyleOf(presetById("vimana-classic")!.design)).toBe("south-gopuram");
  });

  it("goes by the crown for a custom design", () => {
    expect(legacyStyleOf({ ...DEFAULT_DESIGN, preset: undefined, crown: "gopuram" })).toBe("south-gopuram");
  });
});

describe("normalizeDesign", () => {
  it("keeps a valid design as it is", () => {
    const d = presetById("nagara-gold")!.design;
    expect(normalizeDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("replaces an unknown part with the default's", () => {
    const d = normalizeDesign({ ...DEFAULT_DESIGN, crown: "eiffel-tower" });
    expect(d.crown).toBe(DEFAULT_DESIGN.crown);
  });

  it("builds a whole design from nothing, without claiming a style name for it", () => {
    const d = normalizeDesign(null);
    expect(sameParts(d, DEFAULT_DESIGN)).toBe(true);
    expect(d.preset).toBeUndefined();
    expect(normalizeDesign("<script>")).toMatchObject({ v: 1, crown: DEFAULT_DESIGN.crown });
  });

  it("drops a style name that does not match the parts it came with", () => {
    const d = normalizeDesign({ ...presetById("nagara-classic")!.design, stone: "basalt" });
    expect(d.preset).toBeUndefined();
  });

  it("ignores anything it was not asked to keep", () => {
    const d = normalizeDesign({ ...DEFAULT_DESIGN, onload: "alert(1)" }) as unknown as Record<string, unknown>;
    expect(d.onload).toBeUndefined();
  });
});

describe("withPart", () => {
  it("changes just the one part", () => {
    const d = withPart(DEFAULT_DESIGN, "crown", "shikhara");
    expect(d.crown).toBe("shikhara");
    expect(d.stone).toBe(DEFAULT_DESIGN.stone);
  });

  it("stops calling it by its style's name once a part is changed", () => {
    expect(withPart(DEFAULT_DESIGN, "finish", "gold").preset).toBeUndefined();
  });

  it("calls it by the name again when the part is changed back", () => {
    const changed = withPart(DEFAULT_DESIGN, "finish", "gold");
    const back = withPart({ ...changed, preset: DEFAULT_DESIGN.preset }, "finish", DEFAULT_DESIGN.finish);
    expect(back.preset).toBe(DEFAULT_DESIGN.preset);
  });
});

describe("designLabel", () => {
  it("names a style by its name", () => {
    expect(designLabel(presetById("kerala-classic")!.design)).toBe("Kerala Srikovil");
  });

  it("names a changed design as custom, from where it began", () => {
    const d = withPart(presetById("kerala-classic")!.design, "crown", "vimana");
    expect(designLabel(d, "kerala-classic")).toBe("Custom · from Kerala Srikovil");
  });

  it("says custom when there is nothing to say it came from", () => {
    expect(designLabel({ ...DEFAULT_DESIGN, preset: undefined })).toBe("Custom design");
  });
});

describe("sameParts", () => {
  it("ignores the label and compares the building", () => {
    expect(sameParts({ ...DEFAULT_DESIGN, preset: undefined }, DEFAULT_DESIGN)).toBe(true);
    expect(sameParts({ ...DEFAULT_DESIGN, corners: "none" }, DEFAULT_DESIGN)).toBe(false);
  });
});
