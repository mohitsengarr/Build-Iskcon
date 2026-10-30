// _shared/coverResend.ts (owner, 2026-10-30): a cover whose last attempt failed
// on a channel is re-sent there, ONE a run, oldest posted first, Krishna covers
// only, never twice (Gita covers #51, #53, #54, #55 missed Instagram 24-27 Oct).
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { errorParts, failedOn, orderResends, pickResend, type ResendCandidate, resendRefusal, withoutChannelError } from "../supabase/functions/_shared/coverResend.ts";

const gita = { key: "gita", table: "gita_chapter_art_review", label: "Bhagavad-gita" };
const chaitanya = { key: "chaitanya", table: "chaitanya_chapter_art_review", label: "Caitanya-caritamrta" };
const IG_FAIL = "instagram: Error: Channel not found";
const row = (id: number, extra: Record<string, unknown> = {}) => ({
  id, status: "approved", posted_at: `2026-10-${String(id).padStart(2, "0")}T06:00:00Z`, image_url: `https://x/${id}.jpg`, error_message: IG_FAIL, ...extra,
});
const cand = (id: number, extra: Record<string, unknown> = {}, book = gita): ResendCandidate => ({ book, row: row(id, extra) });
const notSent = async () => false;
const allow = async () => ({ allowed: true, reason: "" });

describe("error parts", () => {
  test("a per-channel error is recognised whatever else failed", () => {
    assert.deepEqual(errorParts("instagram: Error: Channel not found | threads: HTTP 500"), ["instagram: Error: Channel not found", "threads: HTTP 500"]);
    assert.equal(failedOn(IG_FAIL, "instagram"), true);
    assert.equal(failedOn("threads: HTTP 500", "instagram"), false);
    assert.equal(failedOn(null, "instagram"), false);
  });

  test("clearing a channel's error leaves the other channels' errors, or nothing", () => {
    assert.equal(withoutChannelError("instagram: Error: Channel not found | threads: HTTP 500", "instagram"), "threads: HTTP 500");
    assert.equal(withoutChannelError(IG_FAIL, "instagram"), null);
    assert.equal(withoutChannelError(null, "instagram"), null);
  });
});

describe("resendRefusal", () => {
  test("an approved, posted cover whose last attempt failed on the channel may be re-sent", () => {
    assert.equal(resendRefusal(row(51), "instagram"), null);
  });

  test("anything else is refused with the reason", () => {
    assert.equal(resendRefusal(row(1, { status: "pending" }), "instagram"), "status pending");
    assert.equal(resendRefusal(row(1, { posted_at: null }), "instagram"), "never posted");
    assert.equal(resendRefusal(row(1, { image_url: "" }), "instagram"), "no image");
    assert.equal(resendRefusal(row(1, { error_message: null }), "instagram"), "did not fail on instagram");
    assert.equal(resendRefusal(row(1), "threads"), "did not fail on threads");
    assert.equal(resendRefusal(null, "instagram"), "not found");
  });
});

describe("orderResends", () => {
  test("oldest posted first", () => {
    assert.deepEqual(orderResends([row(27), row(24), row(25)]).map((r) => r.id), [24, 25, 27]);
  });
});

describe("pickResend", () => {
  test("picks the oldest-posted cover that failed on the channel, across books", async () => {
    // Arrange: Gita #53 and #51 failed on Instagram, a Chaitanya cover posted earlier did not
    const candidates = [cand(53), cand(51), cand(20, { error_message: null }, chaitanya)];
    // Act
    const out = await pickResend({ candidates, service: "instagram", alreadySent: notSent, gate: allow });
    // Assert
    assert.equal(out.pick?.row.id, 51);
    assert.deepEqual(out.held, [{ book: "chaitanya", id: 20, reason: "did not fail on instagram" }]);
  });

  test("a cover already re-sent since it was posted is skipped, and the next one goes", async () => {
    const out = await pickResend({
      candidates: [cand(51), cand(53)],
      service: "instagram",
      alreadySent: async (c) => c.row.id === 51,
      gate: allow,
    });
    assert.equal(out.pick?.row.id, 53);
    assert.deepEqual(out.held, [{ book: "gita", id: 51, reason: "already sent to instagram since it was posted" }]);
  });

  test("a post log that cannot be read holds the cover back: never a double post", async () => {
    const out = await pickResend({ candidates: [cand(51)], service: "instagram", alreadySent: async () => null, gate: allow });
    assert.equal(out.pick, null);
    assert.equal(out.held[0].reason, "could not read the post log");
    const thrown = await pickResend({ candidates: [cand(51)], service: "instagram", alreadySent: async () => { throw new Error("down"); }, gate: allow });
    assert.equal(thrown.pick, null);
  });

  test("a cover the Krishna gate holds back is skipped with its reason", async () => {
    const out = await pickResend({
      candidates: [cand(51), cand(53)],
      service: "instagram",
      alreadySent: notSent,
      gate: async (c) => c.row.id === 51 ? { allowed: false, reason: "no Krishna in the picture" } : { allowed: true, reason: "" },
    });
    assert.equal(out.pick?.row.id, 53);
    assert.deepEqual(out.held, [{ book: "gita", id: 51, reason: "no Krishna in the picture" }]);
  });

  test("a gate that throws holds the cover back and the run goes on", async () => {
    const out = await pickResend({
      candidates: [cand(51), cand(53)],
      service: "instagram",
      alreadySent: notSent,
      gate: async (c) => { if (c.row.id === 51) throw new Error("timeout"); return { allowed: true, reason: "" }; },
    });
    assert.equal(out.pick?.row.id, 53);
    assert.match(out.held[0].reason, /the Krishna check failed: Error: timeout/);
  });

  test("exactly one pick: the covers behind it are untouched", async () => {
    let gated = 0;
    const out = await pickResend({ candidates: [cand(51), cand(53), cand(54), cand(55)], service: "instagram", alreadySent: notSent, gate: async () => (gated++, { allowed: true, reason: "" }) });
    assert.equal(out.pick?.row.id, 51);
    assert.equal(gated, 1);
    assert.deepEqual(out.held, []);
  });

  test("nothing waiting: no pick", async () => {
    assert.deepEqual(await pickResend({ candidates: [], service: "instagram", alreadySent: notSent, gate: allow }), { pick: null, held: [] });
  });
});
