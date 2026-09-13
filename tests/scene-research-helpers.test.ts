// Unit tests for the pure helpers the edge functions keep in their own
// directories: the research network policy (generate-gita-chapter-art and the
// two bulk cover functions), the FLUX attempt loop with its SAFE_FALLBACK log
// line, and the instagram-post inline image prompt. No Deno, no network.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gitaResearchOptions, isMultiChapterRun } from "../supabase/functions/generate-gita-chapter-art/researchMode.ts";
import { inlineImagePrompt } from "../supabase/functions/instagram-post/inlinePrompt.ts";

const FUNCTIONS = new URL("../supabase/functions/", import.meta.url);
const source = (path: string): string => readFileSync(new URL(path, FUNCTIONS), "utf8");

const BULK_COVER_FNS = ["bulk-generate-chapter-art", "bulk-generate-chaitanya-art"];
const SAFE_FALLBACK_FNS = ["bulk-generate-chapter-art", "bulk-generate-chaitanya-art", "bulk-generate-images", "instagram-post"];

// deno-lint-ignore no-explicit-any
const researchModes: Record<string, any> = {};
for (const fn of BULK_COVER_FNS) researchModes[fn] = await import(new URL(`${fn}/researchMode.ts`, FUNCTIONS).href);
// deno-lint-ignore no-explicit-any
const fluxModules: Record<string, any> = {};
for (const fn of SAFE_FALLBACK_FNS) fluxModules[fn] = await import(new URL(`${fn}/fluxAttempts.ts`, FUNCTIONS).href);

describe("gitaResearchOptions (generate-gita-chapter-art)", () => {
  test("a { chapter } run keeps network research", () => {
    // Arrange
    const run = { missingPath: false, limit: undefined, targetCount: 1 };
    // Act
    const opts = gitaResearchOptions(run);
    // Assert
    assert.deepEqual(opts, { allowNetwork: true });
  });

  test("{ missing: true } with no limit renders one chapter and keeps network research", () => {
    const opts = gitaResearchOptions({ missingPath: true, limit: undefined, targetCount: 1 });
    assert.deepEqual(opts, { allowNetwork: true });
  });

  test("{ missing: true, limit: 1 } keeps network research", () => {
    const opts = gitaResearchOptions({ missingPath: true, limit: 1, targetCount: 1 });
    assert.deepEqual(opts, { allowNetwork: true });
  });

  test("{ missing: true, limit: 2 } reads the cache only, even when one chapter is left", () => {
    const opts = gitaResearchOptions({ missingPath: true, limit: 2, targetCount: 1 });
    assert.deepEqual(opts, { allowNetwork: false });
  });

  test("{ missing: true, limit: 18 } over the 13 chapters missing today reads the cache only", () => {
    const opts = gitaResearchOptions({ missingPath: true, limit: 18, targetCount: 13 });
    assert.deepEqual(opts, { allowNetwork: false });
  });

  test("a limit sent as the string '5' counts as a batch", () => {
    const opts = gitaResearchOptions({ missingPath: true, limit: "5", targetCount: 1 });
    assert.deepEqual(opts, { allowNetwork: false });
  });

  test("more than one target chapter reads the cache only whichever path it came from", () => {
    const opts = gitaResearchOptions({ missingPath: false, limit: undefined, targetCount: 2 });
    assert.deepEqual(opts, { allowNetwork: false });
  });

  test("a { chapter } request with a stray limit still keeps network research", () => {
    const opts = gitaResearchOptions({ missingPath: false, limit: 5, targetCount: 1 });
    assert.deepEqual(opts, { allowNetwork: true });
  });

  test("a limit of 0, a negative, non-numeric text or null is not a batch", () => {
    for (const limit of [0, -3, "abc", null, true]) {
      const opts = gitaResearchOptions({ missingPath: true, limit, targetCount: 1 });
      assert.deepEqual(opts, { allowNetwork: true }, `limit ${String(limit)}`);
    }
  });

  test("a malformed run never throws and is treated as a single chapter", () => {
    // deno-lint-ignore no-explicit-any
    assert.equal(isMultiChapterRun(undefined as any), false);
    // deno-lint-ignore no-explicit-any
    assert.deepEqual(gitaResearchOptions(null as any), { allowNetwork: true });
  });

  test("the handler computes the options once per run and passes them to every chapter's research call", () => {
    const src = source("generate-gita-chapter-art/index.ts");
    assert.match(src, /gitaResearchOptions\(\{\s*missingPath: !body\.chapter && !!body\.missing,\s*limit: body\.limit,\s*targetCount: targets\.length\s*\}\)/);
    assert.match(src, /buildOne\(ch, researchOptions\)/);
    assert.match(src, /researchChapter\(ch, brief, researchOptions\)/);
    assert.match(src, /\}, researchOptions\);/);
  });
});

for (const fn of BULK_COVER_FNS) {
  describe(`researchScene (${fn})`, () => {
    const { researchScene, researchOptionsFor } = researchModes[fn];
    const input = { key: "bhagavatam:g10:s0", book: "bhagavatam", sceneText: "Narada plays his vina", title: "Narada", characters: ["Narada"] };
    const result = { facts: ["a Tulasi plant grows in a raised clay planter"], status: "hit", sources: ["https://vaniquotes.org/wiki/Tulasi"], key: input.key, ms: 3 };

    test("chapter and sample modes call research exactly as before: the real key and no options", async () => {
      // Arrange
      const calls: unknown[][] = [];
      const research = async (...args: unknown[]) => {
        calls.push(args);
        return result;
      };
      // Act
      const r = await researchScene(research, input, true);
      // Assert
      assert.equal(r, result);
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], input);
      assert.equal(calls[0][1], undefined);
    });

    test("bulk mode keeps the real key (cached rows can be served) and asks for { allowNetwork: false }", async () => {
      const calls: unknown[][] = [];
      const research = async (...args: unknown[]) => {
        calls.push(args);
        return result;
      };
      const r = await researchScene(research, input, false);
      assert.equal(r, result);
      assert.equal((calls[0][0] as { key: string }).key, "bhagavatam:g10:s0");
      assert.deepEqual(calls[0][1], { allowNetwork: false });
    });

    test("a rejected research call resolves null instead of rejecting", async () => {
      const r = await researchScene(async () => {
        throw new Error("db down");
      }, input, false);
      assert.equal(r, null);
    });

    test("a research function that throws synchronously resolves null", async () => {
      const r = await researchScene(() => {
        throw new Error("boom");
      }, input, true);
      assert.equal(r, null);
    });

    test("researchOptionsFor: only an explicit false turns the network off", () => {
      assert.equal(researchOptionsFor(true), undefined);
      assert.deepEqual(researchOptionsFor(false), { allowNetwork: false });
    });
  });
}

describe("bulk cover functions: research wiring in index.ts", () => {
  test("both functions keep byte-identical copies of researchMode.ts", () => {
    assert.equal(source("bulk-generate-chaitanya-art/researchMode.ts"), source("bulk-generate-chapter-art/researchMode.ts"));
  });

  test("bulk mode no longer withholds the research key and reports cache-only research", () => {
    for (const fn of BULK_COVER_FNS) {
      const src = source(`${fn}/index.ts`);
      assert.doesNotMatch(src, /key: ""/, fn);
      assert.doesNotMatch(src, /research: "canon-only"/, fn);
      assert.match(src, /research: "cache-only"/, fn);
      assert.match(src, /researchScene\(runSceneResearch, \{/, fn);
      assert.match(src, /generateOne\(c, \{ networkResearch: false \}\)/, fn);
    }
  });
});

const ATTEMPTS = [
  { model: "flux-2", prompt: "scene, facts, style", w: 1344, h: 1088, seed: 7 },
  { model: "flux-1", prompt: "scene, facts, style", w: 1024, h: 832, seed: 7 },
  { model: "flux-1", prompt: "SAFE", w: 1024, h: 832, safeFallback: true },
];

function plannedGenerate(images: Array<string | null>) {
  const seen: string[] = [];
  const generate = async (a: { model: string; prompt: string }) => {
    seen.push(`${a.model}|${a.prompt}`);
    return images[seen.length - 1] ?? null;
  };
  return { generate, seen };
}

for (const fn of SAFE_FALLBACK_FNS) {
  describe(`runFluxAttempts (${fn})`, () => {
    const { runFluxAttempts, safeFallbackFactsNote } = fluxModules[fn];

    test("the first image wins: one call and no log line", async () => {
      // Arrange
      const { generate, seen } = plannedGenerate(["img1"]);
      const lines: string[] = [];
      // Act
      const b64 = await runFluxAttempts(ATTEMPTS, generate, { tag: fn, factsInPrompt: 4, log: (l: string) => lines.push(l) });
      // Assert
      assert.equal(b64, "img1");
      assert.deepEqual(seen, ["flux-2|scene, facts, style"]);
      assert.deepEqual(lines, []);
    });

    test("an image from the second attempt never logs, even with facts in the prompt", async () => {
      const { generate, seen } = plannedGenerate([null, "img2"]);
      const lines: string[] = [];
      const b64 = await runFluxAttempts(ATTEMPTS, generate, { tag: fn, factsInPrompt: 4, log: (l: string) => lines.push(l) });
      assert.equal(b64, "img2");
      assert.equal(seen.length, 2);
      assert.deepEqual(lines, []);
    });

    test("reaching SAFE_FALLBACK with facts in the prompt logs exactly one line with the count, before that attempt", async () => {
      const order: string[] = [];
      const lines: string[] = [];
      const generate = async (a: { model: string; prompt: string }) => {
        order.push(`call ${a.prompt}`);
        return a.prompt === "SAFE" ? "img3" : null;
      };
      const b64 = await runFluxAttempts(ATTEMPTS, generate, {
        tag: fn,
        factsInPrompt: 4,
        log: (l: string) => {
          lines.push(l);
          order.push("log");
        },
      });
      assert.equal(b64, "img3");
      assert.deepEqual(lines, [`[${fn}] FLUX attempt 3 uses SAFE_FALLBACK: 4 research facts dropped for this attempt`]);
      assert.deepEqual(order, ["call scene, facts, style", "call scene, facts, style", "log", "call SAFE"]);
    });

    test("one fact is worded 'fact', not 'facts'", () => {
      assert.equal(safeFallbackFactsNote(fn, 3, 1), `[${fn}] FLUX attempt 3 uses SAFE_FALLBACK: 1 research fact dropped for this attempt`);
    });

    test("reaching SAFE_FALLBACK with no facts in the prompt logs nothing", async () => {
      const { generate } = plannedGenerate([null, null, "img3"]);
      const lines: string[] = [];
      const b64 = await runFluxAttempts(ATTEMPTS, generate, { tag: fn, factsInPrompt: 0, log: (l: string) => lines.push(l) });
      assert.equal(b64, "img3");
      assert.deepEqual(lines, []);
    });

    test("every attempt failing resolves null after logging the dropped facts once", async () => {
      const { generate, seen } = plannedGenerate([null, null, null]);
      const lines: string[] = [];
      const b64 = await runFluxAttempts(ATTEMPTS, generate, { tag: fn, factsInPrompt: 2, log: (l: string) => lines.push(l) });
      assert.equal(b64, null);
      assert.equal(seen.length, 3);
      assert.equal(lines.length, 1);
    });

    test("a malformed or fractional fact count below one logs nothing", () => {
      for (const n of [Number.NaN, -2, 0, 0.9, undefined]) {
        assert.equal(safeFallbackFactsNote(fn, 3, n), null, `count ${String(n)}`);
      }
    });

    test("an empty attempt list resolves null without calling generate", async () => {
      const { generate, seen } = plannedGenerate(["img"]);
      const b64 = await runFluxAttempts([], generate, { tag: fn, factsInPrompt: 3, log: () => {} });
      assert.equal(b64, null);
      assert.equal(seen.length, 0);
    });

    test("a generate call that throws still rejects, as the old loop did", async () => {
      await assert.rejects(
        runFluxAttempts(ATTEMPTS, async () => {
          throw new Error("socket hang up");
        }, { tag: fn, factsInPrompt: 1, log: () => {} }),
        /socket hang up/,
      );
    });

    test("without a log option the line goes to console.log", async () => {
      const realLog = console.log;
      const lines: string[] = [];
      console.log = (...a: unknown[]) => {
        lines.push(a.join(" "));
      };
      try {
        await runFluxAttempts(ATTEMPTS, plannedGenerate([null, null, "img3"]).generate, { tag: fn, factsInPrompt: 2 });
      } finally {
        console.log = realLog;
      }
      assert.deepEqual(lines, [`[${fn}] FLUX attempt 3 uses SAFE_FALLBACK: 2 research facts dropped for this attempt`]);
    });
  });
}

describe("SAFE_FALLBACK wiring in index.ts", () => {
  test("the four copies of fluxAttempts.ts are byte-identical", () => {
    const first = source(`${SAFE_FALLBACK_FNS[0]}/fluxAttempts.ts`);
    for (const fn of SAFE_FALLBACK_FNS.slice(1)) assert.equal(source(`${fn}/fluxAttempts.ts`), first, fn);
  });

  test("every SAFE_FALLBACK attempt is flagged and every attempt list runs through runFluxAttempts with the function's tag", () => {
    for (const fn of SAFE_FALLBACK_FNS) {
      const src = source(`${fn}/index.ts`);
      const fallbackLines = src.split("\n").filter((l) => /prompt: SAFE_FALLBACK\b/.test(l));
      assert.ok(fallbackLines.length >= 1, `${fn}: no SAFE_FALLBACK attempt found`);
      for (const line of fallbackLines) assert.match(line, /safeFallback: true/, `${fn}: ${line.trim()}`);
      assert.match(src, /runFluxAttempts\(attempts, /, fn);
      assert.doesNotMatch(src, /for \(const a of attempts\)/, fn);
      assert.match(src, new RegExp(`tag: "${fn}"`), fn);
    }
  });
});

describe("inlineImagePrompt (instagram-post)", () => {
  const SCENE = "Wide shot of Dhruva, a young MALE prince, meditating in the forest of Madhuvana";
  const TITLE = "ध्रुव महाराज का वन गमन";

  test("reads the imagePrompt key Claude is asked for", () => {
    // Arrange
    const reply = { imagePrompt: SCENE, caption: "c", hashtags: "#h" };
    // Act
    const prompt = inlineImagePrompt(reply, TITLE);
    // Assert
    assert.equal(prompt, SCENE);
  });

  test("accepts a prompt key when imagePrompt is absent", () => {
    assert.equal(inlineImagePrompt({ prompt: SCENE }, TITLE), SCENE);
  });

  test("prefers imagePrompt when both keys are present", () => {
    assert.equal(inlineImagePrompt({ imagePrompt: SCENE, prompt: "other scene" }, TITLE), SCENE);
  });

  test("trims whitespace around the prompt", () => {
    assert.equal(inlineImagePrompt({ imagePrompt: `  ${SCENE}\n` }, TITLE), SCENE);
  });

  test("with neither key it falls back to a scene naming the chapter title, never 'undefined'", () => {
    const prompt = inlineImagePrompt({ caption: "c", hashtags: "#h" }, TITLE);
    assert.ok(prompt.includes(TITLE));
    assert.doesNotMatch(prompt, /undefined|null/i);
  });

  test("a placeholder 'undefined', 'null' or blank imagePrompt falls through to prompt, then to the fallback", () => {
    for (const bad of ["undefined", " NULL ", "", "   "]) {
      assert.equal(inlineImagePrompt({ imagePrompt: bad, prompt: SCENE }, TITLE), SCENE, `imagePrompt ${JSON.stringify(bad)}`);
      assert.doesNotMatch(inlineImagePrompt({ imagePrompt: bad, prompt: "undefined" }, TITLE), /undefined|null/i);
    }
  });

  test("a non-string imagePrompt (number, object, array) is ignored", () => {
    for (const bad of [42, { text: SCENE }, [SCENE]]) {
      const prompt = inlineImagePrompt({ imagePrompt: bad }, TITLE);
      assert.ok(prompt.includes(TITLE), JSON.stringify(bad));
    }
  });

  test("a non-object reply (null, undefined, a string, an array) gives the fallback without 'undefined'", () => {
    for (const reply of [null, undefined, SCENE, [SCENE]]) {
      const prompt = inlineImagePrompt(reply, TITLE);
      assert.ok(prompt.includes(TITLE), String(reply));
      assert.doesNotMatch(prompt, /undefined|null/i);
    }
  });

  test("with no usable title the fallback is a generic Srimad Bhagavatam scene", () => {
    for (const title of [undefined, "", "  ", 42, "undefined"]) {
      const prompt = inlineImagePrompt({}, title);
      assert.match(prompt, /^A wide establishing shot of a scene from Srimad Bhagavatam/, String(title));
      assert.doesNotMatch(prompt, /undefined|null/i);
    }
  });

  test("the handler builds the inline scene with inlineImagePrompt, not inline.prompt", () => {
    const src = source("instagram-post/index.ts");
    assert.doesNotMatch(src, /inline\.prompt\b/);
    assert.match(src, /imagePrompt = inlineImagePrompt\(inline, chapter\.title\);/);
  });
});
