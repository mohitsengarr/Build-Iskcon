import { describe, expect, it } from "vitest";
import {
  APPROVED_TABLES, KEPT_PREFIX, redrawConfirmText, redrawNote, redrawRequest, replacementLabel, replacementWaitPath, sourceNotePath,
} from "./approvedRedraw";

describe("redrawConfirmText", () => {
  it("says the new image goes to pending review and nothing changes until it is approved", () => {
    const text = redrawConfirmText("bhagavatam");
    expect(text).toMatch(/added to pending review/);
    expect(text).toMatch(/until then nothing changes/);
    expect(text).not.toMatch(/posted|post goes|cover goes/);
  });

  it("says an Instagram post goes out again with the re-post queue once approved", () => {
    expect(redrawConfirmText("instagram")).toMatch(/re-post queue/);
  });

  it("says a Gita or Chaitanya cover goes out again with the daily post once approved", () => {
    expect(redrawConfirmText("gita")).toMatch(/daily post/);
    expect(redrawConfirmText("chaitanya")).toMatch(/daily post/);
  });

  it("names an older image as such", () => {
    expect(redrawConfirmText("bhagavatam", { legacy: true })).toMatch(/this older image/);
  });
});

describe("redrawRequest", () => {
  it("sends a chapter cover to regenerate-chapter-art with its book", () => {
    expect(redrawRequest({ book: "gita", id: 7 })).toEqual({ fn: "regenerate-chapter-art", body: { book: "gita", id: 7, replace_approved: true } });
  });

  it("sends an Instagram post to regenerate-pending-image", () => {
    expect(redrawRequest({ book: "instagram", id: 731 })).toEqual({ fn: "regenerate-pending-image", body: { id: 731, replace_approved: true } });
  });

  it("sends an older static image by its manifest file name, as a Bhagavatam cover", () => {
    expect(redrawRequest({ legacyImage: "chapter-010.jpg" })).toEqual({
      fn: "regenerate-chapter-art",
      body: { book: "bhagavatam", legacy_image: "chapter-010.jpg", replace_approved: true },
    });
  });
});

describe("replacementWaitPath", () => {
  it("looks for a pending row that replaces the approved one, in its own table", () => {
    expect(replacementWaitPath({ book: "instagram", id: 731 })).toBe("ig_pending_review?replaces_id=eq.731&status=eq.pending&select=id&limit=1");
    expect(replacementWaitPath({ book: "gita", id: 7 })).toBe("gita_chapter_art_review?replaces_id=eq.7&status=eq.pending&select=id&limit=1");
  });

  it("looks for an older image's replacement by its file name", () => {
    expect(replacementWaitPath({ legacyImage: "chapter-010.jpg" })).toBe(
      "bhagavatam_chapter_art_review?replaces_legacy->>image=eq.chapter-010.jpg&status=eq.pending&select=id&limit=1",
    );
  });
});

describe("redrawNote", () => {
  it("reads the note left when nothing could be drawn", () => {
    const message = `${KEPT_PREFIX}: every image attempt failed.`;
    expect(redrawNote([{ error_message: message }])).toBe(message);
  });

  it("ignores any other note, and no rows", () => {
    expect(redrawNote([{ error_message: "threads: media rejected" }])).toBeNull();
    expect(redrawNote([])).toBeNull();
    expect(redrawNote(null)).toBeNull();
  });

  it("reads it from the approved row", () => {
    expect(sourceNotePath({ book: "chaitanya", id: 3 })).toBe("chaitanya_chapter_art_review?id=eq.3&select=error_message");
    expect(APPROVED_TABLES.instagram).toBe("ig_pending_review");
  });
});

describe("replacementLabel", () => {
  it("says which approved image a pending card would replace", () => {
    expect(replacementLabel({ replaces_id: 41 })).toBe("Replacement for approved #41: approving swaps its image in");
  });

  it("names the older static file it would replace", () => {
    expect(replacementLabel({ replaces_legacy: { image: "chapter-010.jpg" } })).toBe("Replacement for the older image chapter-010.jpg: approving swaps it in");
  });

  it("says nothing for an ordinary pending card", () => {
    expect(replacementLabel({ replaces_id: null, replaces_legacy: null })).toBeNull();
    expect(replacementLabel(null)).toBeNull();
  });
});
