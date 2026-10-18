import { describe, expect, it } from "vitest";
import { APPROVED_TABLES, KEPT_PREFIX, bareUrl, redrawConfirmText, redrawOutcome, redrawRequest, repostsOnSocial } from "./approvedRedraw";

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

  it("says a published Instagram post is posted again straight away", () => {
    expect(redrawConfirmText("instagram")).toMatch(/posted to Instagram and Threads again straight away/);
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

describe("redrawRequest", () => {
  it("sends a chapter cover to regenerate-chapter-art with its book", () => {
    expect(redrawRequest({ book: "gita", id: 7 })).toEqual({ fn: "regenerate-chapter-art", body: { book: "gita", id: 7, replace_approved: true } });
  });

  it("sends an Instagram post to regenerate-pending-image", () => {
    expect(redrawRequest({ book: "instagram", id: 731 })).toEqual({ fn: "regenerate-pending-image", body: { id: 731, replace_approved: true } });
  });

  it("reads an Instagram post back from its own table", () => {
    expect(APPROVED_TABLES.instagram).toBe("ig_pending_review");
  });
});

describe("an older static image", () => {
  it("is sent to regenerate-chapter-art by its manifest file name, to be adopted as a Bhagavatam cover", () => {
    expect(redrawRequest({ legacyImage: "chapter-010.jpg" })).toEqual({
      fn: "regenerate-chapter-art",
      body: { book: "bhagavatam", legacy_image: "chapter-010.jpg", replace_approved: true },
    });
  });

  it("asks first, saying it becomes the chapter's cover and is replaced only on a passing check, and posted nowhere", () => {
    const text = redrawConfirmText("bhagavatam", { legacy: true });
    expect(text).toMatch(/becomes this chapter's approved cover/);
    expect(text).toMatch(/only if the check passes/);
    expect(text).not.toMatch(/posted/);
  });
});
