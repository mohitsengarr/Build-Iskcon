// The decisions made when an approved image is redrawn: the scene it redraws
// from, the note left when nothing could be drawn, and where an older static
// image's replacement comes from.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  KEPT_PREFIX, isLegacyImageName, keptMessage, legacyHideKey, legacyReplacementBase, sceneDraft,
} from "../supabase/functions/_shared/approvedRedraw.ts";

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

  test("a prompt that opens with the style keeps its scene: only a marker after the scene cuts", () => {
    const sent = "Museum-quality classical Indian devotional oil painting, the teaching at dawn on the battlefield.\n\nCenter-left: MALE Krishna at the reins. ABSOLUTE GENDER RULES: 1) ...";
    assert.equal(sceneDraft(sent), "Museum-quality classical Indian devotional oil painting, the teaching at dawn on the battlefield.\n\nCenter-left: MALE Krishna at the reins.");
  });

  test("a prompt that is all style and no later marker is kept whole rather than emptied", () => {
    assert.equal(sceneDraft("museum-quality oil painting of Arjuna's chariot at dawn"), "museum-quality oil painting of Arjuna's chariot at dawn");
  });

  test("gives nothing for no prompt", () => {
    assert.equal(sceneDraft(null), "");
    assert.equal(sceneDraft("   "), "");
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

describe("older static images", () => {
  const ENTRY = {
    chapterNumber: 206, cantoNumber: 10, chapterTitle: "अध्याय एक", imagePath: "chapter-206.jpg",
    prompt: "Vasudeva carries the infant Krishna across the Yamuna", descriptionHi: "विवरण", sceneIndex: 0,
  };
  const CHAPTER = { globalNumber: 206, number: 1, skandh: 10, title: "Chapter One" };

  test("a manifest file name is one plain image name, never a path", () => {
    assert.equal(isLegacyImageName("chapter-001.jpg"), true);
    assert.equal(isLegacyImageName("chapter-010-s1.webp"), true);
    assert.equal(isLegacyImageName("../secrets.jpg"), false);
    assert.equal(isLegacyImageName("a/b.jpg"), false);
    assert.equal(isLegacyImageName("chapter-001.svg"), false);
    assert.equal(isLegacyImageName(42), false);
  });

  test("its replacement starts from the chapter's fields, placed by the chapter index", () => {
    assert.deepEqual(legacyReplacementBase(ENTRY, CHAPTER), {
      chapter_global_number: 206,
      chapter_canto: 10,
      chapter_in_canto: 1,
      chapter_title: "अध्याय एक",
      description_hi: "विवरण",
      scene_index: null,
      error_message: null,
    });
  });

  test("the chapter index's title stands in when the manifest has none", () => {
    assert.equal(legacyReplacementBase({ ...ENTRY, chapterTitle: "" }, CHAPTER)?.chapter_title, "Chapter One");
  });

  test("cannot be placed without its chapter in the index", () => {
    assert.equal(legacyReplacementBase(ENTRY, null), null);
    assert.equal(legacyReplacementBase({ ...ENTRY, chapterNumber: "206" }, CHAPTER), null);
  });

  test("is hidden by its chapter and scene, scene 0 when the manifest names none", () => {
    assert.deepEqual(legacyHideKey(ENTRY), { chapter_number: 206, scene_index: 0 });
    assert.deepEqual(legacyHideKey({ chapterNumber: 5, sceneIndex: 1 }), { chapter_number: 5, scene_index: 1 });
    assert.deepEqual(legacyHideKey({ chapterNumber: 5 }), { chapter_number: 5, scene_index: 0 });
    assert.equal(legacyHideKey({}), null);
  });
});
