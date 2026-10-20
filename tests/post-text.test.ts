// _shared/postText.ts: a Threads post carries the caption's story alone.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THREADS_MAX_CHARS, storyText, threadsText } from "../supabase/functions/_shared/postText.ts";

const STORY = "When love becomes motion, the Rasa dance spins eternal. In that moonlit circle, the gopis and Krishna move as one flame.";
const MANTRA = "🙏 Hare Krishna Hare Krishna Krishna Krishna Hare Hare\nHare Rama Hare Rama Rama Rama Hare Hare";
const NEW_STYLE = `${STORY}\n\n${MANTRA}\n\n📖 Srimad Bhagavatam — Canto 10, Chapter 33`;
const OLD_STYLE = `📖 Srimad Bhagavatam — Canto 11, Chapter 2\n\n${STORY}\n\n${MANTRA}`;

describe("storyText", () => {
  test("keeps the story of a caption that ends with the mantra and the book reference", () => {
    assert.equal(storyText(NEW_STYLE), STORY);
  });

  test("keeps the story of a caption that starts with the book reference", () => {
    assert.equal(storyText(OLD_STYLE), STORY);
  });

  test("drops a paragraph of hashtags, and keeps a story of two paragraphs whole", () => {
    assert.equal(storyText(`First part.\n\nSecond part.\n\n#ISKCON #Krishna`), "First part.\n\nSecond part.");
  });

  test("drops the mantra even without its emoji", () => {
    assert.equal(storyText(`${STORY}\n\nHare Krishna Hare Krishna Krishna Krishna Hare Hare`), STORY);
  });

  test("keeps a story that names Krishna", () => {
    assert.equal(storyText("Krishna lifts Govardhan Hill."), "Krishna lifts Govardhan Hill.");
  });

  test("gives nothing for no caption", () => {
    assert.equal(storyText(null), "");
  });
});

describe("threadsText", () => {
  test("is the story alone: no mantra, no reference, no hashtags", () => {
    const text = threadsText(NEW_STYLE);
    assert.equal(text, STORY);
    assert.doesNotMatch(text, /Hare Rama|Canto|#/);
  });

  test("falls back to the chapter title when the caption has no story", () => {
    assert.equal(threadsText(MANTRA, "Chapter Thirty-three"), "Chapter Thirty-three");
  });

  test("a long story is cut at the last sentence that fits Threads' limit", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} tells part of the pastime.`).join(" ");
    const text = threadsText(long);
    assert.ok(text.length <= THREADS_MAX_CHARS, String(text.length));
    assert.ok(text.endsWith("."), text.slice(-20));
  });

  test("a long run with no sentence end is cut at a word, with an ellipsis", () => {
    const text = threadsText("word ".repeat(200));
    assert.ok(text.length <= THREADS_MAX_CHARS);
    assert.ok(text.endsWith("…"));
  });
});

describe("the channels that post to Threads use it", () => {
  test("approve-instagram-post and daily-approved-art-post build their Threads text with threadsText", () => {
    for (const fn of ["approve-instagram-post", "daily-approved-art-post"]) {
      const src = readFileSync(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url), "utf8");
      assert.match(src, /import \{[^}]*threadsText[^}]*\} from "\.\.\/_shared\/postText\.ts";/, fn);
      assert.match(src, /threadsText\(/, fn);
    }
  });
});
