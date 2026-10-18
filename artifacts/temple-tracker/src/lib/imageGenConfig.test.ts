import { describe, expect, it } from "vitest";
import { PRODUCTION_SIZES, approvalRow, type GenConfigDraft } from "./imageGenConfig";

const base: GenConfigDraft = {
  label: "Tuned", model: "openai/gpt-image-2", width: 1088, height: 1344, steps: null,
  style_positives: "oil painting", style_negatives: "NOT cartoon", extra_rules: "rules", prompt_max_len: 2000,
  fallback_model: "black-forest-labs/FLUX.1.1-pro", fallback_width: 768, fallback_height: 1024, notes: null,
};

describe("approvalRow", () => {
  it("keeps the Instagram and cover sizes of the configuration being approved", () => {
    const row = approvalRow({ ...base, ig_width: 1200, ig_height: 900, cover_width: 1400, cover_height: 1000 });
    expect([row.ig_width, row.ig_height, row.cover_width, row.cover_height]).toEqual([1200, 900, 1400, 1000]);
  });

  it("gives a configuration without them the production shapes, never null", () => {
    // The approval that turned every feed post and cover portrait.
    const row = approvalRow({ ...base, ig_width: null, ig_height: null, cover_width: null, cover_height: null });
    expect([row.ig_width, row.ig_height]).toEqual([PRODUCTION_SIZES.instagram.w, PRODUCTION_SIZES.instagram.h]);
    expect([row.cover_width, row.cover_height]).toEqual([PRODUCTION_SIZES.cover.w, PRODUCTION_SIZES.cover.h]);
  });

  it("never saves half a size", () => {
    const row = approvalRow({ ...base, ig_width: 1200, ig_height: null, cover_width: 0, cover_height: 1000 });
    expect([row.ig_width, row.ig_height]).toEqual([1088, 1344]);
    expect([row.cover_width, row.cover_height]).toEqual([1344, 1088]);
  });

  it("makes Instagram posts portrait, no taller than the 4:5 the feed shows uncropped", () => {
    const { w, h } = PRODUCTION_SIZES.instagram;
    expect(h).toBeGreaterThan(w);
    expect(h / w).toBeLessThanOrEqual(5 / 4 + 0.01);
  });

  it("keeps book covers landscape", () => {
    const { w, h } = PRODUCTION_SIZES.cover;
    expect(w).toBeGreaterThan(h);
  });

  it("carries everything else as it is, and makes the row the active one", () => {
    const row = approvalRow(base);
    expect(row).toMatchObject({
      model: "openai/gpt-image-2", width: 1088, height: 1344, style_positives: "oil painting",
      style_negatives: "NOT cartoon", extra_rules: "rules", prompt_max_len: 2000,
      fallback_model: "black-forest-labs/FLUX.1.1-pro", fallback_width: 768, fallback_height: 1024, is_active: true,
    });
  });

  it("names an unnamed configuration by when it was tuned", () => {
    expect(approvalRow({ ...base, label: "" }, new Date("2026-10-18T19:20:00Z")).label).toBe("Tuned 2026-10-18 19:20");
  });
});
