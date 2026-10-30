// _shared/autoApprove.ts (owner, 2026-10-30): new Bhaktigram images are approved
// automatically, ONE a run, only when their image check passed (or had no facts
// to check) and they carry the watermark. Instagram posts first, then the oldest
// cover. A failed check is left for a person.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { approvalsPerRun, autoApproveMany, autoApproveOne, autoApproveRefusal, type Candidate, MAX_BULK_APPROVALS, MAX_MARK_CHECKS, orderCandidates, scopeTables } from "../supabase/functions/_shared/autoApprove.ts";

const row = (id: number, extra: Record<string, unknown> = {}) => ({
  id, status: "pending", image_path: `p-${id}.jpg`, image_url: `https://x/p-${id}.jpg`, created_at: `2026-10-${String(10 + (id % 20)).padStart(2, "0")}T00:00:00Z`,
  visual_check: { status: "pass" }, ...extra,
});
const cover = (id: number, extra: Record<string, unknown> = {}): Candidate => ({ table: "bhagavatam_chapter_art_review", row: row(id, extra) });
const ig = (id: number, extra: Record<string, unknown> = {}): Candidate => ({ table: "ig_pending_review", row: row(id, { reviewed_at: null, ...extra }) });
const marked = async () => true;

describe("autoApproveRefusal", () => {
  test("a waiting image whose check passed, or had no facts to check, may be approved", () => {
    assert.equal(autoApproveRefusal("bhagavatam_chapter_art_review", row(1)), null);
    assert.equal(autoApproveRefusal("chaitanya_chapter_art_review", row(1, { visual_check: { status: "skipped", reason: "no_facts" } })), null);
  });

  test("a failed, running or errored check, or none, is left for a person", () => {
    for (const vc of [{ status: "fail", reason: "max_attempts" }, { status: "running" }, { status: "error", reason: "timeout" }, { status: "skipped", reason: "disabled" }, null]) {
      const r = autoApproveRefusal("gita_chapter_art_review", row(1, { visual_check: vc }));
      assert.match(String(r), /left for a person to review/, JSON.stringify(vc));
    }
  });

  test("only waiting rows with an image; an Instagram post a reviewer has claimed is left alone", () => {
    assert.equal(autoApproveRefusal("gita_chapter_art_review", row(1, { status: "approved" })), "status approved");
    assert.equal(autoApproveRefusal("gita_chapter_art_review", row(1, { image_path: null })), "no image");
    assert.equal(autoApproveRefusal("ig_pending_review", row(1, { reviewed_at: "2026-10-30T10:00:00Z" })), "a reviewer is acting on it");
    assert.equal(autoApproveRefusal("gita_chapter_art_review", null), "not found");
  });
});

describe("orderCandidates", () => {
  test("Instagram posts first, then covers oldest first across the books", () => {
    const out = orderCandidates([
      { table: "gita_chapter_art_review", row: { id: 1, created_at: "2026-10-05" } },
      { table: "bhagavatam_chapter_art_review", row: { id: 2, created_at: "2026-10-01" } },
      { table: "ig_pending_review", row: { id: 3, created_at: "2026-10-29" } },
    ]);
    assert.deepEqual(out.map((c) => c.row.id), [3, 2, 1]);
  });
});

describe("autoApproveOne", () => {
  test("approves exactly one image a run: the first eligible one", async () => {
    // Arrange
    const approved: unknown[] = [];
    // Act
    const out = await autoApproveOne({ candidates: [cover(2), ig(5), cover(3)], hasMark: marked, approve: async (c) => (approved.push(c.row.id), { ok: true, detail: "approved" }) });
    // Assert
    assert.deepEqual(approved, [5], "one approval, the Instagram post first");
    assert.deepEqual(out.approved, { table: "ig_pending_review", id: 5, detail: "approved" });
  });

  test("an image without the watermark is not approved, and the next one is", async () => {
    const approved: unknown[] = [];
    const out = await autoApproveOne({
      candidates: [cover(1, { created_at: "2026-10-01" }), cover(2, { created_at: "2026-10-02" })],
      hasMark: async (c) => c.row.id !== 1,
      approve: async (c) => (approved.push(c.row.id), { ok: true, detail: "ok" }),
    });
    assert.deepEqual(approved, [2]);
    assert.deepEqual(out.skipped, [{ table: "bhagavatam_chapter_art_review", id: 1, reason: "no Bhaktigram watermark on the image" }]);
  });

  test("a watermark that cannot be checked counts as missing", async () => {
    const out = await autoApproveOne({ candidates: [cover(1)], hasMark: async () => null, approve: async () => { throw new Error("must not approve"); } });
    assert.equal(out.approved, null);
    assert.equal(out.skipped[0].reason, "could not check the watermark");
  });

  test("images left for a person are skipped without a watermark check", async () => {
    let checks = 0;
    const out = await autoApproveOne({
      candidates: [cover(1, { visual_check: { status: "fail", reason: "max_attempts" } })],
      hasMark: async () => (checks++, true), approve: async () => { throw new Error("must not approve"); },
    });
    assert.equal(checks, 0);
    assert.equal(out.approved, null);
  });

  test("a run makes no more than MAX_MARK_CHECKS watermark checks", async () => {
    let checks = 0;
    const candidates = Array.from({ length: 12 }, (_, i) => cover(i + 1, { created_at: `2026-09-${String(i + 1).padStart(2, "0")}` }));
    await autoApproveOne({ candidates, hasMark: async () => (checks++, false), approve: async () => ({ ok: true, detail: "" }) });
    assert.equal(checks, MAX_MARK_CHECKS);
  });

  test("an approval that fails moves on to the next image", async () => {
    const out = await autoApproveOne({
      candidates: [cover(1, { created_at: "2026-10-01" }), cover(2, { created_at: "2026-10-02" })],
      hasMark: marked,
      approve: async (c) => (c.row.id === 1 ? { ok: false, detail: "the row changed meanwhile" } : { ok: true, detail: "approved" }),
    });
    assert.equal(out.approved?.id, 2);
    assert.match(out.skipped[0].reason, /approval failed: the row changed meanwhile/);
  });

  test("an approval that throws is recorded and the run goes on", async () => {
    const out = await autoApproveOne({
      candidates: [cover(1, { created_at: "2026-10-01" }), cover(2, { created_at: "2026-10-02" })],
      hasMark: marked,
      approve: async (c) => { if (c.row.id === 1) throw new Error("down"); return { ok: true, detail: "approved" }; },
    });
    assert.equal(out.approved?.id, 2);
  });

  test("nothing waiting: nothing approved", async () => {
    const out = await autoApproveOne({ candidates: [], hasMark: marked, approve: async () => ({ ok: true, detail: "" }) });
    assert.deepEqual(out, { approved: null, skipped: [] });
  });
});

describe("bulk approval (owner, 2026-10-31: 'auto approve all these' covers)", () => {
  test("scopeTables: all by default, covers only, or Instagram posts only; anything else is an error", () => {
    assert.deepEqual([...scopeTables(undefined)], ["ig_pending_review", "gita_chapter_art_review", "chaitanya_chapter_art_review", "bhagavatam_chapter_art_review"]);
    assert.deepEqual([...scopeTables("covers")], ["gita_chapter_art_review", "chaitanya_chapter_art_review", "bhagavatam_chapter_art_review"]);
    assert.deepEqual([...scopeTables("posts")], ["ig_pending_review"]);
    assert.throws(() => scopeTables("everything"), /unknown scope 'everything'/);
  });

  test("approvalsPerRun: one unless asked, never more than MAX_BULK_APPROVALS", () => {
    assert.equal(approvalsPerRun(undefined), 1);
    assert.equal(approvalsPerRun(0), 1);
    assert.equal(approvalsPerRun(7), 7);
    assert.equal(approvalsPerRun(1000), MAX_BULK_APPROVALS);
    assert.equal(approvalsPerRun("5"), 1);
  });

  test("autoApproveMany approves up to the limit, in order, skipping an image without the watermark", async () => {
    // Arrange: four covers, the second unmarked
    const approved: unknown[] = [];
    const candidates = [1, 2, 3, 4].map((id) => cover(id, { created_at: `2026-10-0${id}` }));
    // Act
    const out = await autoApproveMany({ candidates, hasMark: async (c) => c.row.id !== 2, approve: async (c) => (approved.push(c.row.id), { ok: true, detail: "approved" }), limit: 2 });
    // Assert
    assert.deepEqual(approved, [1, 3]);
    assert.deepEqual(out.approved.map((a) => a.id), [1, 3]);
    assert.deepEqual(out.skipped, [{ table: "bhagavatam_chapter_art_review", id: 2, reason: "no Bhaktigram watermark on the image" }]);
  });

  test("a bulk run still leaves a failed check for a person and goes on past a failed approval", async () => {
    const out = await autoApproveMany({
      candidates: [cover(1, { created_at: "2026-10-01", visual_check: { status: "fail", reason: "max_attempts" } }), cover(2, { created_at: "2026-10-02" }), cover(3, { created_at: "2026-10-03" })],
      hasMark: marked,
      approve: async (c) => (c.row.id === 2 ? { ok: false, detail: "the row changed meanwhile" } : { ok: true, detail: "approved" }),
      limit: 10,
    });
    assert.deepEqual(out.approved.map((a) => a.id), [3]);
    assert.equal(out.skipped.length, 2);
    assert.match(out.skipped[0].reason, /left for a person to review/);
    assert.match(out.skipped[1].reason, /approval failed/);
  });

  test("a bulk run makes no more than limit + MAX_MARK_CHECKS watermark checks", async () => {
    let checks = 0;
    const candidates = Array.from({ length: 40 }, (_, i) => cover(i + 1, { created_at: `2026-09-${String(i + 1).padStart(2, "0")}` }));
    await autoApproveMany({ candidates, hasMark: async () => (checks++, false), approve: async () => ({ ok: true, detail: "" }), limit: 10 });
    assert.equal(checks, 10 + MAX_MARK_CHECKS);
  });

  test("autoApproveOne is the one-image case of the same rules", async () => {
    const out = await autoApproveOne({ candidates: [cover(1), cover(2)], hasMark: marked, approve: async () => ({ ok: true, detail: "approved" }) });
    assert.equal(out.approved?.id, 1);
  });
});
