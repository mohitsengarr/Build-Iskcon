// Unit tests for the Gita chapter subjects and the artwork brief built from them
// (generate-gita-chapter-art/chapterScenes.ts).
//
// The bug these guard: every chapter's cover came back as the same painting —
// Krishna at the reins of a chariot drawn by four white horses, Arjuna behind
// him — because the brief asked for "this chapter's central moment" and the whole
// Gita is spoken in one place. Chapters 4 to 8 were four identical chariots.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAPTERS,
  MAX_REJECTED,
  MAX_USED_ELSEWHERE,
  briefSystemPrompt,
  briefUserMessage,
  type GitaChapter,
} from "../supabase/functions/generate-gita-chapter-art/chapterScenes.ts";

const chapter = (n: number): GitaChapter => {
  const c = CHAPTERS.find((x) => x.n === n);
  assert.ok(c, `chapter ${n} is missing`);
  return c as GitaChapter;
};

const CHARIOT_WORDS = /chariot|horse|rein|banner|armies/i;

describe("CHAPTERS", () => {
  test("holds all 18 chapters once each, in order", () => {
    // Arrange / Act
    const numbers = CHAPTERS.map((c) => c.n);
    // Assert
    assert.equal(CHAPTERS.length, 18);
    assert.deepEqual(numbers, Array.from({ length: 18 }, (_, i) => i + 1));
  });

  test("every chapter carries a subject, the verse it rests on and that verse's words", () => {
    for (const c of CHAPTERS) {
      assert.ok(c.subject.trim().length > 40, `chapter ${c.n} has no real subject`);
      assert.match(c.verse, /^Bhagavad-gita \d{1,2}\.\d/, `chapter ${c.n} cites no verse`);
      assert.ok(c.quote.trim().length > 20, `chapter ${c.n} quotes nothing`);
      assert.equal(c.verse.split(" ")[1].split(".")[0], String(c.n), `chapter ${c.n} cites another chapter's verse`);
    }
  });

  test("no two chapters share a subject", () => {
    const subjects = new Set(CHAPTERS.map((c) => c.subject.trim().toLowerCase()));
    assert.equal(subjects.size, CHAPTERS.length);
  });

  test("the chariot belongs to chapters 1, 2, 11 and 18 only", () => {
    const withChariot = CHAPTERS.filter((c) => c.chariot).map((c) => c.n);
    assert.deepEqual(withChariot, [1, 2, 11, 18]);
  });

  test("a chapter without the chariot does not smuggle one into its subject", () => {
    for (const c of CHAPTERS.filter((x) => !x.chariot)) {
      assert.doesNotMatch(c.subject, CHARIOT_WORDS, `chapter ${c.n} still paints the chariot`);
    }
  });

  test("the chapters that keep the chariot are the ones whose own verse is set at it", () => {
    assert.match(chapter(1).quote, /chariot/i);
    assert.match(chapter(11).subject, /universal form/i);
    assert.match(chapter(18).subject, /Gandiva/i);
  });
});

describe("briefSystemPrompt", () => {
  const sys = briefSystemPrompt();

  test("tells the writer that painting the setting of the dialogue gives identical covers", () => {
    assert.match(sys, /eighteen identical covers/i);
    assert.match(sys, /Paint the chapter's own subject instead/i);
  });

  test("holds the chariot back until the subject asks for it", () => {
    assert.match(sys, /Do NOT show Arjuna's chariot[^\n]*unless the subject below asks for them/i);
    assert.match(sys, /WHEN THE SUBJECT DOES SHOW THE CHARIOT/);
  });

  test("keeps the four-horse count and the charioteer's place for when the chariot is shown", () => {
    assert.match(sys, /EXACTLY FOUR WHITE HORSES/);
    assert.match(sys, /Never two, never three/);
    assert.match(sys, /Krishna stands at the FRONT of the chariot holding the reins/);
    assert.match(sys, /banner bearing HANUMAN/);
  });

  test("keeps Krishna's appearance for every chapter, not only the chariot ones", () => {
    assert.match(sys, /WHEREVER KRISHNA APPEARS, in any chapter: blue skin, a peacock feather/);
  });

  test("still asks for peaceful imagery and the same JSON shape", () => {
    assert.match(sys, /PEACEFUL imagery only/);
    assert.match(sys, /Never combat/);
    assert.match(sys, /\{"moment":"\.\.\.","imagePrompt":"\.\.\.","caption":"\.\.\.","hashtags":"\.\.\."\}/);
  });
});

describe("briefUserMessage", () => {
  test("names the chapter, its subject and the verse the subject rests on", () => {
    // Arrange / Act
    const msg = briefUserMessage(chapter(15));
    // Assert
    assert.match(msg, /Chapter 15: /);
    assert.match(msg, /SUBJECT TO PAINT: the imperishable banyan tree growing upside down/);
    assert.match(msg, /It rests on Bhagavad-gita 15\.1: "It is said that there is an imperishable banyan tree/);
  });

  test("forbids the chariot for a chapter that does not have one", () => {
    const msg = briefUserMessage(chapter(6));
    assert.match(msg, /does NOT include the chariot: paint no chariot, no horses, no banner and no armies/);
    assert.doesNotMatch(msg, /apply the chariot rules/);
  });

  test("applies the chariot rules for a chapter that does have one", () => {
    const msg = briefUserMessage(chapter(1));
    assert.match(msg, /DOES include Arjuna's chariot: apply the chariot rules above/);
    assert.doesNotMatch(msg, /paint no chariot/);
  });

  test("carries the moments the editor rejected for this chapter", () => {
    const msg = briefUserMessage(chapter(6), { rejected: ["Krishna explains meditation in the chariot"] });
    assert.match(msg, /The editor rejected these moments for this chapter/);
    assert.match(msg, /- Krishna explains meditation in the chariot/);
  });

  test("carries the other chapters' moments so two covers do not converge", () => {
    const msg = briefUserMessage(chapter(7), { usedElsewhere: ["Chapter 6: A yogi meditates on a kusa seat"] });
    assert.match(msg, /Other chapters' covers already show these moments/);
    assert.match(msg, /- Chapter 6: A yogi meditates on a kusa seat/);
  });

  test("leaves both lists out entirely when there is nothing to list", () => {
    const empty = briefUserMessage(chapter(3), { rejected: [], usedElsewhere: [] });
    assert.doesNotMatch(empty, /rejected these moments/);
    assert.doesNotMatch(empty, /already show these moments/);
    assert.equal(empty, briefUserMessage(chapter(3)));
  });

  test("drops blanks and repeats, and caps each list", () => {
    // Arrange
    const rejected = ["  A moment  ", "a moment", "", "   ", "Another", "Third", "Fourth", "Fifth", "Sixth", "Seventh"];
    const used = Array.from({ length: 25 }, (_, i) => `Chapter ${i + 1}: moment ${i + 1}`);
    // Act
    const msg = briefUserMessage(chapter(9), { rejected, usedElsewhere: used });
    // Assert
    assert.equal((msg.match(/^- A moment$/gm) || []).length, 1);
    assert.doesNotMatch(msg, /^- $/m);
    const lines = msg.split("\n").filter((l) => l.startsWith("- "));
    assert.equal(lines.length, MAX_REJECTED + MAX_USED_ELSEWHERE);
    assert.match(msg, /- Chapter 17: moment 17/);
    assert.doesNotMatch(msg, /- Chapter 18: moment 18/);
  });

  test("a non-string in either list cannot break the brief", () => {
    const msg = briefUserMessage(chapter(9), {
      rejected: [null as unknown as string, 7 as unknown as string, "A real one"],
      usedElsewhere: [undefined as unknown as string],
    });
    assert.match(msg, /- A real one/);
    assert.doesNotMatch(msg, /already show these moments/);
  });

  test("every chapter produces a brief that names its own subject and settles the chariot question", () => {
    for (const c of CHAPTERS) {
      const msg = briefUserMessage(c);
      assert.ok(msg.includes(c.subject), `chapter ${c.n} lost its subject`);
      assert.ok(msg.includes(c.quote), `chapter ${c.n} lost its evidence`);
      assert.match(msg, c.chariot ? /apply the chariot rules above/ : /paint no chariot/);
    }
  });
});
