// regenerate-chapter-art's decisions for an approved cover: the scene it redraws from, when a new
// image may silently replace an approved one, and what changes on the row.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { KEPT_PREFIX, keptMessage, mayReplace, replacementFields, sceneDraft } from "../supabase/functions/regenerate-chapter-art/approved.ts";

describe("sceneDraft", () => {
  test("keeps a scene stored on its own as it is", () => {
    assert.equal(sceneDraft("Krishna drives Arjuna's chariot between the armies."), "Krishna drives Arjuna's chariot between the armies.");
  });

  test("cuts a whole sent prompt back to its scene: details and style come again from the approved configuration", () => {
    const sent = "A villager sweeps temple steps by a lotus pond. Canonical details: four white horses. ABSOLUTE GENDER RULES (NEVER VIOLATE): 1) ... museum-quality 19th-century OIL PAINTING";
    assert.equal(sceneDraft(sent), "A villager sweeps temple steps by a lotus pond.");
  });

  test("drops a correction lead an earlier redraw put in front", () => {
    const sent = "CORRECTION — the painting must clearly show: four white horses. The previous attempt was wrong: three horses. Krishna holds the reins.";
    assert.equal(sceneDraft(sent), "Krishna holds the reins.");
  });

  test("gives nothing for no prompt", () => {
    assert.equal(sceneDraft(null), "");
    assert.equal(sceneDraft("   "), "");
  });
});

describe("mayReplace", () => {
  test("a passed check may replace the approved image", () => {
    assert.equal(mayReplace({ status: "pass" }), true);
  });

  test("a cover with nothing to check, or the check switched off, may replace it like any new cover", () => {
    assert.equal(mayReplace({ status: "skipped", reason: "no_facts" }), true);
    assert.equal(mayReplace({ status: "skipped", reason: "disabled" }), true);
  });

  test("a detail still wrong keeps the approved image", () => {
    assert.equal(mayReplace({ status: "fail" }), false);
  });

  test("a check that could not run keeps the approved image: an unchecked image never replaces a chosen one", () => {
    assert.equal(mayReplace({ status: "error", reason: "api_error_529" }), false);
    assert.equal(mayReplace({ status: "skipped", reason: "deadline" }), false);
    assert.equal(mayReplace({ status: "skipped", reason: "aborted" }), false);
    assert.equal(mayReplace(null), false);
  });
});

describe("replacementFields", () => {
  test("a book that posts its covers is posted again: posted_at is cleared", () => {
    const f = replacementFields(true, "https://x/new.jpg", "new.jpg", { status: "pass" });
    assert.equal(f.posted_at, null);
    assert.equal(f.image_url, "https://x/new.jpg");
    assert.equal(f.image_path, "new.jpg");
    assert.deepEqual(f.visual_check, { status: "pass" });
    assert.equal(f.error_message, null);
  });

  test("a book that posts nothing changes nothing about posting", () => {
    const f = replacementFields(false, "https://x/new.jpg", "new.jpg", { status: "pass" });
    assert.equal("posted_at" in f, false);
  });
});

describe("keptMessage", () => {
  test("says how many details were still wrong and after how many attempts", () => {
    assert.equal(keptMessage({ status: "fail", failed: [{}, {}], attempts: 3 }, true), "Regenerate kept the approved image: 2 details still wrong after 3 attempts.");
    assert.equal(keptMessage({ status: "fail", failed: [{}], attempts: 1 }, true), "Regenerate kept the approved image: 1 detail still wrong after 1 attempt.");
  });

  test("says when the check could not run, and why", () => {
    assert.equal(keptMessage({ status: "error", reason: "timeout" }, true), "Regenerate kept the approved image: the new image could not be checked (timeout).");
    assert.equal(keptMessage({ status: "skipped", reason: "deadline" }, true), "Regenerate kept the approved image: the new image could not be checked (deadline).");
  });

  test("every note begins the way the gallery waits for", () => {
    for (const m of [keptMessage(null, false), keptMessage({ status: "fail", failed: [] }, true), keptMessage({ status: "error" }, true)]) {
      assert.ok(m.startsWith(`${KEPT_PREFIX}: `), m);
    }
  });

  test("says when no image could be drawn at all", () => {
    assert.equal(keptMessage(null, false), "Regenerate kept the approved image: every image attempt failed.");
  });
});
