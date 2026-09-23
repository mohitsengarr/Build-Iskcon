// Unit tests for the scene-object fact filter (generate-gita-chapter-art/sceneFacts.ts).
//
// The bug: research is cached per chapter and outlives the scene. Chapter 5's row
// was filled when its cover was the chariot, so "chariot drawn by four white
// horses" was still appended to the prompt after the chapter's subject became the
// unattached worker at the lotus pond — and the render came back with a chariot
// and three horses in a farmer's field.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { factsAboutSceneObjects } from "../supabase/functions/generate-gita-chapter-art/sceneFacts.ts";

const KRISHNA = "Krishna has blue skin, a peacock feather in his crown and yellow silk pitambara";
const HORSES = "chariot drawn by four white horses";
const HORSES_AGAIN = "four white horses pulling the chariot";
const GANDIVA = "Arjuna holding his bow known as Gandiva";
const LOTUS_POND = "A serene MALE farmer kneels by a still lotus pond at daybreak, his hands in soil, sowing seeds";
const CHARIOT_SCENE = "Krishna stands at the front of the chariot holding the reins, Arjuna behind him with the Gandiva bow";

describe("factsAboutSceneObjects", () => {
  test("drops the chariot facts when the scene has no chariot", () => {
    // Arrange / Act
    const { kept, absent } = factsAboutSceneObjects([KRISHNA, HORSES, HORSES_AGAIN], LOTUS_POND);
    // Assert
    assert.deepEqual(kept, [KRISHNA]);
    assert.equal(absent, 2);
  });

  test("leaves a fact about Arjuna's bow alone: it tells the painter what to put in his hands, and the people filter drops it when Arjuna is absent", () => {
    const { kept } = factsAboutSceneObjects([GANDIVA], LOTUS_POND);
    assert.deepEqual(kept, [GANDIVA]);
  });

  test("keeps every fact when the scene does show the chariot", () => {
    const facts = [KRISHNA, HORSES, HORSES_AGAIN, GANDIVA];
    const { kept, absent } = factsAboutSceneObjects(facts, CHARIOT_SCENE);
    assert.deepEqual(kept, facts);
    assert.equal(absent, 0);
  });

  test("a fact naming no object survives any scene", () => {
    for (const scene of [LOTUS_POND, CHARIOT_SCENE, "", "a banyan tree with its roots in the sky"]) {
      assert.deepEqual(factsAboutSceneObjects([KRISHNA], scene).kept, [KRISHNA]);
    }
  });

  test("an archer's scene with no chariot keeps the Gandiva and still drops the horses", () => {
    const archer = "Arjuna stands alone drawing his bow at a target, a quiver of arrows on his back";
    const { kept } = factsAboutSceneObjects([HORSES, GANDIVA, KRISHNA], archer);
    assert.deepEqual(kept, [GANDIVA, KRISHNA]);
  });

  test("a scene that names only the horses keeps the horse facts", () => {
    const { kept } = factsAboutSceneObjects([HORSES], "four white horses graze on the plain");
    assert.deepEqual(kept, [HORSES]);
  });

  test("the banner belongs to the chariot group", () => {
    const banner = "a banner bearing Hanuman flies above Arjuna's chariot";
    assert.deepEqual(factsAboutSceneObjects([banner], LOTUS_POND).kept, []);
    assert.deepEqual(factsAboutSceneObjects([banner], "a banner flies above the tent").kept, [banner]);
  });

  test("matching is on whole words, so a horseradish stall is not a horse", () => {
    const stall = "a stall of horseradish and roots stands at the edge of the market";
    const kept = factsAboutSceneObjects([stall], LOTUS_POND).kept;
    assert.deepEqual(kept, [stall], "horseradish must not be read as a horse");
  });

  test("boundary: no facts, and facts that are not strings", () => {
    assert.deepEqual(factsAboutSceneObjects([], LOTUS_POND), { kept: [], absent: 0 });
    const mixed = factsAboutSceneObjects([null, 7, KRISHNA], LOTUS_POND);
    assert.deepEqual(mixed.kept, [KRISHNA]);
    assert.equal(mixed.absent, 2);
  });

  test("negative: anything but an array of facts keeps nothing", () => {
    assert.deepEqual(factsAboutSceneObjects(null, LOTUS_POND), { kept: [], absent: 0 });
    assert.deepEqual(factsAboutSceneObjects("chariot" as unknown, LOTUS_POND), { kept: [], absent: 0 });
  });

  test("an empty scene keeps only the facts that name no object", () => {
    const { kept } = factsAboutSceneObjects([KRISHNA, HORSES], "");
    assert.deepEqual(kept, [KRISHNA]);
  });
});
