// _shared/replacements.ts: a regenerated image waits for review as a pending
// replacement, and approving it copies its image onto the original.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  approveReplacement, candidateRow, hasPendingReplacement, isReplacement, mergeFields, promptColumn,
} from "../supabase/functions/_shared/replacements.ts";

const NOW = new Date("2026-10-19T09:00:00.000Z");

/** A database of plain rows: update/select apply every .eq filter, as PostgREST does. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  const upserts: Array<{ table: string; values: unknown; opts: unknown }> = [];
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: Array<[string, unknown]> = [];
    let op: "select" | "update" = "select";
    let values: Record<string, unknown> = {};
    const matching = () => rows.filter((r) => filters.every(([c, v]) => (r[c] ?? null) === v));
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push([c, v]), q),
      limit: () => q,
      update: (v: Record<string, unknown>) => ((op = "update"), (values = v), q),
      upsert: async (v: unknown, opts: unknown) => (upserts.push({ table, values: v, opts }), { error: null }),
      then: (res: (v: unknown) => unknown) => {
        const hit = matching();
        if (op === "update") for (const r of hit) Object.assign(r, values);
        return Promise.resolve({ data: hit.map((r) => (op === "update" ? { id: r.id } : { ...r })), error: null }).then(res);
      },
    };
    return q;
  };
  return { from, upserts, tables };
}

describe("candidateRow", () => {
  const POST = {
    id: 41, status: "approved", chapter_global_number: 211, chapter_canto: 10, chapter_in_canto: 10, chapter_title: "Ch",
    caption: "Narada's wisdom", hashtags: "#Narada", mahajan_key: "narada", image_url: "old-url", image_path: "old.jpg",
    image_prompt: "old prompt", visual_check: { status: "pass" }, buffer_post_ids: [{ service: "instagram" }],
    posted_at: null, reviewed_at: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z", error_message: "x",
    publish_started_at: "2026-09-01T00:00:00Z",
  };

  test("carries the original's own fields, with the new image, its record and its prompt, pending and naming the original", () => {
    const row = candidateRow("ig_pending_review", POST, { url: "new-url", path: "new.jpg" }, { status: "pass" }, "new prompt");
    assert.deepEqual(row, {
      chapter_global_number: 211, chapter_canto: 10, chapter_in_canto: 10, chapter_title: "Ch",
      caption: "Narada's wisdom", hashtags: "#Narada", mahajan_key: "narada",
      image_url: "new-url", image_path: "new.jpg", visual_check: { status: "pass" }, image_prompt: "new prompt",
      status: "pending", error_message: null, replaces_id: 41,
    });
  });

  test("never copies what belongs to the original alone: id, review, publishing and its old image", () => {
    const row = candidateRow("ig_pending_review", POST, { url: "u", path: "p" }, null, "d");
    for (const k of ["id", "created_at", "reviewed_at", "buffer_post_ids", "publish_started_at", "posted_at"]) assert.equal(k in row, false, k);
  });

  test("a cover keeps its prompt in prompt", () => {
    const row = candidateRow("gita_chapter_art_review", { id: 3, chapter_number: 6, prompt: "old" }, { url: "u", path: "p" }, null, "scene");
    assert.equal(row.prompt, "scene");
    assert.equal("image_prompt" in row, false);
    assert.equal(promptColumn("ig_pending_review"), "image_prompt");
  });
});

describe("mergeFields", () => {
  const CANDIDATE = { image_url: "new-url", image_path: "new.jpg", visual_check: { status: "pass" }, prompt: "scene", image_prompt: "post" };

  test("an Instagram post takes the new image and joins the re-post queue", () => {
    assert.deepEqual(mergeFields("ig_pending_review", CANDIDATE, NOW), {
      image_url: "new-url", image_path: "new.jpg", visual_check: { status: "pass" }, image_prompt: "post", error_message: null,
      repost_requested_at: "2026-10-19T09:00:00.000Z",
    });
  });

  test("a Gita or Chaitanya cover rejoins the daily poster's queue", () => {
    assert.equal(mergeFields("gita_chapter_art_review", CANDIDATE, NOW).posted_at, null);
    assert.equal(mergeFields("chaitanya_chapter_art_review", CANDIDATE, NOW).posted_at, null);
  });

  test("a Bhagavatam cover is posted nowhere: nothing about posting changes", () => {
    const f = mergeFields("bhagavatam_chapter_art_review", CANDIDATE, NOW);
    assert.equal("posted_at" in f, false);
    assert.equal("repost_requested_at" in f, false);
    assert.equal(f.prompt, "scene");
  });
});

describe("isReplacement", () => {
  test("names a row that replaces another, or a static image", () => {
    assert.equal(isReplacement({ replaces_id: 4 }), true);
    assert.equal(isReplacement({ replaces_legacy: { image: "chapter-001.jpg" } }), true);
    assert.equal(isReplacement({ replaces_id: null, replaces_legacy: null }), false);
    assert.equal(isReplacement(null), false);
  });
});

describe("approveReplacement", () => {
  const original = () => ({ id: 41, status: "approved", image_url: "old-url", image_path: "old.jpg", image_prompt: "old", repost_requested_at: null });
  const candidate = () => ({ id: 90, status: "pending", replaces_id: 41, image_url: "new-url", image_path: "new.jpg", image_prompt: "new", visual_check: { status: "pass" } });

  test("copies the image onto the original, which keeps its id, and marks the replacement replaced", async () => {
    // Arrange
    const db = fakeDb({ ig_pending_review: [original(), candidate()] });
    const [orig, cand] = db.tables.ig_pending_review;
    // Act
    const result = await approveReplacement(db, "ig_pending_review", { ...cand }, NOW);
    // Assert
    assert.deepEqual(result, { merged: 41 });
    assert.equal(orig.image_path, "new.jpg");
    assert.equal(orig.image_prompt, "new");
    assert.equal(orig.status, "approved");
    assert.equal(orig.repost_requested_at, "2026-10-19T09:00:00.000Z");
    assert.equal(cand.status, "replaced");
  });

  test("when the original is no longer approved, the replacement is approved in its place and queued", async () => {
    // Arrange
    const db = fakeDb({ ig_pending_review: [{ ...original(), status: "rejected" }, candidate()] });
    const [orig, cand] = db.tables.ig_pending_review;
    // Act
    const result = await approveReplacement(db, "ig_pending_review", { ...cand }, NOW);
    // Assert
    assert.deepEqual(result, { approved: true });
    assert.equal(orig.image_path, "old.jpg", "a rejected original is left alone");
    assert.equal(cand.status, "approved");
    assert.equal(cand.repost_requested_at, "2026-10-19T09:00:00.000Z");
  });

  test("a static image's replacement is approved itself and the static copy hidden", async () => {
    // Arrange
    const legacy = { id: 95, status: "pending", replaces_id: null, replaces_legacy: { image: "chapter-010.jpg", chapter_number: 10, scene_index: 0 } };
    const db = fakeDb({ bhagavatam_chapter_art_review: [legacy] });
    // Act
    const result = await approveReplacement(db, "bhagavatam_chapter_art_review", { ...legacy }, NOW);
    // Assert
    assert.deepEqual(result, { approved: true, hidden: true });
    assert.equal(db.tables.bhagavatam_chapter_art_review[0].status, "approved");
    assert.deepEqual(db.upserts, [{
      table: "bhagavatam_image_deletes",
      values: { chapter_number: 10, scene_index: 0, requested_by: "approved replacement #95" },
      opts: { onConflict: "chapter_number,scene_index", ignoreDuplicates: true },
    }]);
  });

  test("a replacement already reviewed is not approved twice", async () => {
    // Arrange: the original is gone and the replacement was approved by another click
    const db = fakeDb({ ig_pending_review: [{ ...candidate(), status: "approved" }] });
    // Act
    const result = await approveReplacement(db, "ig_pending_review", candidate(), NOW);
    // Assert
    assert.deepEqual(result, { error: "Already reviewed", status: 409 });
  });
});

describe("hasPendingReplacement", () => {
  test("finds a replacement already waiting for this row, and nothing else", async () => {
    const db = fakeDb({ gita_chapter_art_review: [{ id: 7, replaces_id: 3, status: "pending" }, { id: 8, replaces_id: 4, status: "rejected" }] });
    assert.equal(await hasPendingReplacement(db, "gita_chapter_art_review", 3), true);
    assert.equal(await hasPendingReplacement(db, "gita_chapter_art_review", 4), false);
  });
});
