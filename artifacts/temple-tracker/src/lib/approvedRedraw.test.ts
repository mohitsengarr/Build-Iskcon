import { describe, expect, it } from "vitest";
import { KEPT_PREFIX, bareUrl, redrawConfirmText, redrawOutcome, repostsOnSocial } from "./approvedRedraw";

const START = "https://x.test/storage/v1/object/public/chapter-art-images/art-1.jpg";

describe("redrawOutcome", () => {
  it("reports a new image once the row holds one", () => {
    const url = "https://x.test/storage/v1/object/public/chapter-art-images/art-approved-1-9.jpg";
    expect(redrawOutcome(START, { status: "approved", image_url: url })).toEqual({ kind: "replaced", url });
  });

  it("ignores a cache-busting query on the image it started from", () => {
    expect(redrawOutcome(`${START}?t=123`, { status: "approved", image_url: START })).toEqual({ kind: "waiting" });
  });

  it("reports the note when the redraw kept the approved image", () => {
    const message = `${KEPT_PREFIX}: 1 detail still wrong after 3 attempts.`;
    expect(redrawOutcome(START, { status: "approved", image_url: START, error_message: message })).toEqual({ kind: "kept", message });
  });

  it("keeps waiting while the image and note are unchanged, whatever else the note says", () => {
    expect(redrawOutcome(START, { status: "approved", image_url: START, error_message: null })).toEqual({ kind: "waiting" });
    expect(redrawOutcome(START, { status: "approved", image_url: START, error_message: "threads: media rejected" })).toEqual({ kind: "waiting" });
  });

  it("stops when the row is no longer approved, or is gone", () => {
    expect(redrawOutcome(START, { status: "rejected", image_url: START })).toEqual({ kind: "gone" });
    expect(redrawOutcome(START, null)).toEqual({ kind: "gone" });
  });
});

describe("redrawConfirmText", () => {
  it("says a Gita or Chaitanya cover is posted again", () => {
    expect(redrawConfirmText("chaitanya")).toMatch(/posted to Instagram and Threads again/);
    expect(redrawConfirmText("gita")).toMatch(/posted to Instagram and Threads again/);
  });

  it("says nothing about posting for a Bhagavatam cover, which is posted nowhere", () => {
    expect(repostsOnSocial("bhagavatam")).toBe(false);
    expect(redrawConfirmText("bhagavatam")).not.toMatch(/posted/);
  });

  it("says the image is replaced only if the check passes", () => {
    expect(redrawConfirmText("bhagavatam")).toMatch(/only if the check passes/);
  });
});

describe("bareUrl", () => {
  it("drops the query and copes with nothing", () => {
    expect(bareUrl(`${START}?t=1`)).toBe(START);
    expect(bareUrl(null)).toBe("");
  });
});
