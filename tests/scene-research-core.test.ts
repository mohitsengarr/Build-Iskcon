// Unit tests for the pure scene-research core.
// Run: node --experimental-strip-types --test tests/
// Source texts below are synthetic test fixtures, not quotations.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  assemblePrompt,
  buildResearchUserMessage,
  buildSearchQueries,
  extractEntities,
  filterSearchResults,
  focusEntities,
  gitaChapterKey,
  inlineKey,
  mergeCanon,
  normalizeForMatch,
  parseCount,
  PRODUCTION_EXTRA_SANITIZE_WORDS,
  readerKey,
  RESEARCH_SYSTEM_PROMPT,
  resolveFactConflicts,
  sanitizeForImageModel,
  sanitizeForImageModelWith,
  sceneKey,
  scopeForKey,
  selectFactsForScene,
  TTL_MS,
  ttlFor,
  unresearchedEntities,
  verifyFacts,
  VISUAL_FACTS_INPUT_SCHEMA,
} from "../supabase/functions/_shared/sceneResearchCore.ts";
import type { CanonRow, FetchedSource, VisualFact } from "../supabase/functions/_shared/sceneResearchCore.ts";
import { ANACHRONISM_RULES, ART_STYLE, GENDER_RULES } from "./fixtures/bulk-chapter-art-constants.ts";
import { seededCanon } from "./helpers/seed-canon.ts";

const SRC_URL = "https://vedabase.io/en/library/bg/1/14/";
const SOURCE: FetchedSource = {
  url: SRC_URL,
  title: "Synthetic fixture: the chariot at Kurukṣetra",
  description: "A test page about the chariot.",
  text: "In this fixture, Arjuna’s chariot was yoked to four white horses, and its flag bore Hanumān. " +
    "On the fourth day white horses were rested.",
};

function fact(overrides: Partial<VisualFact> = {}): VisualFact {
  return {
    subject: "Arjuna's chariot",
    attribute: "horses",
    kind: "count",
    value: "four",
    prompt_text: "drawn by exactly four white horses",
    triggers: ["Arjuna+chariot"],
    source_url: SRC_URL,
    quote: "Arjuna's chariot was yoked to four white horses",
    ...overrides,
  };
}

function reasons(result: { dropped: { reason: string }[] }): string[] {
  return result.dropped.map((d) => d.reason);
}

describe("normalizeForMatch", () => {
  test("folds IAST diacritics to plain Latin letters", () => {
    // Arrange
    const iast = "ā ś ṣ ṇ ṛ ṁ ṃ ḥ ī ū";
    // Act
    const out = normalizeForMatch(iast);
    // Assert
    assert.equal(out, "a s s n r m m h i u");
  });

  test("lowercases, drops apostrophes, turns punctuation into single spaces", () => {
    const out = normalizeForMatch("  Kṛṣṇa’s  RATHA, drawn by śveta-aśvas!  ");
    assert.equal(out, "krsnas ratha drawn by sveta asvas");
  });

  test("returns an empty string for null, undefined and whitespace", () => {
    assert.equal(normalizeForMatch(null), "");
    assert.equal(normalizeForMatch(undefined), "");
    assert.equal(normalizeForMatch("   \n\t "), "");
  });

  test("keeps different words different", () => {
    assert.notEqual(normalizeForMatch("four"), normalizeForMatch("fourth"));
  });
});

describe("verifyFacts", () => {
  test("keeps a fact whose quote differs from the source only in diacritics and punctuation", () => {
    // Arrange: source has a curly apostrophe, a comma and "Hanumān"; the quote has none of them
    const candidate = fact({
      kind: "object",
      attribute: "banner",
      value: "Hanumān",
      prompt_text: "a flag bearing Hanuman flies above the chariot",
      quote: "Arjuna's chariot was yoked to four white horses and its flag bore Hanuman",
    });
    // Act
    const result = verifyFacts([candidate], [SOURCE]);
    // Assert
    assert.equal(result.kept.length, 1);
    assert.deepEqual(result.dropped, []);
  });

  test("keeps a count fact whose number is in the quote and the prompt_text", () => {
    const result = verifyFacts([fact()], [SOURCE]);
    assert.equal(result.kept.length, 1);
    assert.equal(result.kept[0].value, "four");
  });

  test("drops a digit value when the quote spells the number as a word (value must be quoted)", () => {
    // Arrange: the count rule alone would accept 4 == four; the value rule does not
    const candidate = fact({ value: "4" });
    // Act
    const result = verifyFacts([candidate], [SOURCE]);
    // Assert
    assert.deepEqual(reasons(result), ["value_not_in_quote"]);
  });

  test("matches the source URL despite a fragment or missing trailing slash", () => {
    const result = verifyFacts([fact({ source_url: "https://VEDABASE.io/en/library/bg/1/14#purport" })], [SOURCE]);
    assert.equal(result.kept.length, 1);
  });

  test("drops a fact whose quote is not in the source", () => {
    const result = verifyFacts([fact({ quote: "the chariot was drawn by four black horses" })], [SOURCE]);
    assert.equal(result.kept.length, 0);
    assert.deepEqual(reasons(result), ["quote_not_in_source"]);
  });

  test("drops a fact whose quote matches only inside a word", () => {
    // "our white horses" is a substring of "four white horses" but not on a word boundary
    const result = verifyFacts([fact({ kind: "colour", value: "white", quote: "our white horses and its flag" })], [SOURCE]);
    assert.deepEqual(reasons(result), ["quote_not_in_source"]);
  });

  test("drops a fact whose source_url was never fetched", () => {
    const result = verifyFacts([fact({ source_url: "https://example.org/other-page" })], [SOURCE]);
    assert.deepEqual(reasons(result), ["source_not_fetched"]);
  });

  test("drops a count fact whose quote does not state the number", () => {
    const result = verifyFacts([fact({ quote: "white horses, and its flag bore Hanumān" })], [SOURCE]);
    assert.deepEqual(reasons(result), ["count_not_in_quote"]);
  });

  test("does not read 'fourth' as the count four", () => {
    const result = verifyFacts([fact({ quote: "On the fourth day white horses were rested" })], [SOURCE]);
    assert.deepEqual(reasons(result), ["count_not_in_quote"]);
  });

  test("drops a count fact whose prompt_text states a different number", () => {
    const result = verifyFacts([fact({ prompt_text: "drawn by seven white horses" })], [SOURCE]);
    assert.deepEqual(reasons(result), ["count_not_in_prompt_text"]);
  });

  test("drops a count fact whose value is not a number", () => {
    const result = verifyFacts([fact({ value: "several" })], [SOURCE]);
    assert.deepEqual(reasons(result), ["count_value_not_numeric"]);
  });

  test("drops a colour fact whose colour is not named in the quote", () => {
    const result = verifyFacts([fact({ kind: "colour", value: "golden", prompt_text: "golden horses" })], [SOURCE]);
    assert.deepEqual(reasons(result), ["colour_not_in_quote"]);
  });

  test("drops prompt_text longer than 90 characters", () => {
    const result = verifyFacts([fact({ prompt_text: `drawn by exactly four white horses ${"x".repeat(60)}` })], [SOURCE]);
    assert.deepEqual(reasons(result), ["prompt_text_too_long"]);
  });

  test("accepts prompt_text of exactly 90 characters", () => {
    // Arrange: every descriptive word comes from the quote, so only the length is under test
    const text = "Arjuna's chariot was yoked to four white horses and chariot was yoked to four white horses";
    assert.equal(text.length, 90);
    // Act
    const result = verifyFacts([fact({ prompt_text: text })], [SOURCE]);
    // Assert
    assert.equal(result.kept.length, 1);
  });

  test("drops prompt_text containing a sanitizer word", () => {
    const result = verifyFacts([fact({ prompt_text: "four white horses pulling the war chariot" })], [SOURCE]);
    assert.deepEqual(reasons(result), ["prompt_text_sanitizer_word"]);
  });

  test("strips object-only triggers and drops a fact left with none", () => {
    // Arrange
    const generic = fact({ triggers: ["chariot", "horse"] });
    const mixed = fact({ attribute: "horse colour", kind: "colour", value: "white", triggers: ["chariot", "Arjuna"] });
    // Act
    const result = verifyFacts([generic, mixed], [SOURCE]);
    // Assert
    assert.deepEqual(reasons(result), ["no_specific_triggers"]);
    assert.deepEqual(result.kept[0].triggers, ["Arjuna"]);
  });

  test("drops both facts when proven values conflict for the same subject and attribute", () => {
    const other: FetchedSource = { url: "https://example.org/five", title: "", text: "Arjuna's chariot had five white horses." };
    const five = fact({ value: "five", prompt_text: "drawn by five white horses", source_url: other.url, quote: "Arjuna's chariot had five white horses" });
    const result = verifyFacts([fact(), five], [SOURCE, other]);
    assert.equal(result.kept.length, 0);
    assert.deepEqual(reasons(result), ["conflict", "conflict"]);
  });

  test("keeps the first of two identical facts", () => {
    const result = verifyFacts([fact(), fact()], [SOURCE]);
    assert.equal(result.kept.length, 1);
    assert.deepEqual(reasons(result), ["duplicate"]);
  });

  test("drops malformed candidates and tolerates non-array input", () => {
    const result = verifyFacts([null, { subject: "x" }, fact({ kind: "size" as VisualFact["kind"] })], [SOURCE]);
    assert.deepEqual(reasons(result), ["malformed", "malformed", "bad_kind"]);
    assert.deepEqual(verifyFacts("nope", [SOURCE]), { kept: [], dropped: [] });
  });

  test("drops a quote too short to prove anything", () => {
    const result = verifyFacts([fact({ kind: "object", quote: "four" })], [SOURCE]);
    assert.deepEqual(reasons(result), ["quote_too_short"]);
  });
});

describe("selectFactsForScene", () => {
  const arjunaScene = "Krishna drives Arjuna's chariot, drawn by white horses, onto the plain of Kurukshetra.";
  const suryaFact = fact({
    subject: "Surya's chariot",
    value: "seven",
    prompt_text: "Surya's chariot is drawn by seven horses",
    triggers: ["Surya", "sun god", "Vivasvan"],
  });
  const arjunaFact = fact({ triggers: ["Arjuna+chariot"] });

  test("does not select Surya's seven horses for an Arjuna chariot scene", () => {
    // Act
    const selected = selectFactsForScene([suryaFact, arjunaFact], arjunaScene);
    // Assert
    assert.deepEqual(selected, [arjunaFact]);
  });

  test("matches triggers case-insensitively, across diacritics and plurals", () => {
    const f = fact({ triggers: ["kṛṣṇa+horse"] });
    assert.equal(selectFactsForScene([f], "KRSNA and the HORSES").length, 1);
  });

  test("matches on word boundaries only", () => {
    const f = fact({ triggers: ["war"] });
    assert.equal(selectFactsForScene([f], "a warrior walks toward the forest").length, 0);
  });

  test("requires every term of a + group", () => {
    const f = fact({ triggers: ["Arjuna+chariot"] });
    assert.equal(selectFactsForScene([f], "Arjuna meditates in the forest").length, 0);
  });

  test("excludes a fact when a negative trigger appears", () => {
    const f = fact({ triggers: ["chariot", "!Rathayatra"] });
    assert.equal(selectFactsForScene([f], "Devotees pull the Rathayatra chariot").length, 0);
  });

  test("returns an empty list for non-array input or facts without triggers", () => {
    assert.deepEqual(selectFactsForScene(null as unknown as VisualFact[], arjunaScene), []);
    assert.deepEqual(selectFactsForScene([fact({ triggers: [] })], arjunaScene), []);
  });
});

describe("mergeCanon", () => {
  const scene = "Arjuna stands in his chariot at Kurukshetra while Krishna holds the reins.";
  const canonHorses: CanonRow = {
    id: 1,
    subject: "Arjuna's chariot",
    attribute: "horses",
    prompt_text: "Arjuna's chariot is drawn by exactly four white horses",
    triggers: ["arjuna+chariot", "!surya"],
    book: null,
    source: "editor: test",
  };

  test("puts matching canon first and lets it override a web fact about the same subject and attribute", () => {
    // Arrange
    const webTwo = fact({ value: "two", prompt_text: "drawn by two white horses", triggers: ["Arjuna"] });
    const webBanner = fact({ attribute: "banner", kind: "object", value: "Hanuman", prompt_text: "a Hanuman banner", triggers: ["Arjuna"] });
    // Act
    const merged = mergeCanon([canonHorses], [webTwo, webBanner], scene, { book: "gita" });
    // Assert
    assert.deepEqual(merged.map((m) => [m.origin, m.prompt_text]), [
      ["canon", "Arjuna's chariot is drawn by exactly four white horses"],
      ["web", "a Hanuman banner"],
    ]);
  });

  test("does not let canon that fails its triggers override a web fact", () => {
    const webTwo = fact({ value: "two", prompt_text: "drawn by two white horses", triggers: ["Arjuna"] });
    const merged = mergeCanon([canonHorses], [webTwo], "Arjuna meditates alone", { book: "gita" });
    assert.deepEqual(merged.map((m) => m.origin), ["web"]);
  });

  test("applies book-specific canon only to that book and skips inactive rows", () => {
    const gitaOnly: CanonRow = { ...canonHorses, id: 2, attribute: "banner", prompt_text: "Hanuman banner", book: "gita" };
    const inactive: CanonRow = { ...canonHorses, id: 3, attribute: "charioteer", prompt_text: "Krishna drives", active: false };
    assert.equal(mergeCanon([gitaOnly, inactive], [], scene, { book: "bhagavatam" }).length, 0);
    assert.equal(mergeCanon([gitaOnly, inactive], [], scene, { book: "gita" }).length, 1);
  });

  test("orders canon by id and emits identical prompt_text once", () => {
    const later: CanonRow = { ...canonHorses, id: 9, attribute: "banner", prompt_text: "Hanuman banner" };
    const dupWeb = fact({ attribute: "flag", kind: "object", prompt_text: "Hanuman banner", triggers: ["Arjuna"] });
    const merged = mergeCanon([later, canonHorses], [dupWeb], scene);
    assert.deepEqual(merged.map((m) => m.prompt_text), [canonHorses.prompt_text, "Hanuman banner"]);
  });
});

describe("sanitizeForImageModel", () => {
  test("keeps words that merely contain a sanitizer word", () => {
    const keep = "warrior warriors warm battlefield toward forward skill narrow";
    assert.equal(sanitizeForImageModel(keep), keep);
  });

  test("replaces whole sanitizer words and their simple endings", () => {
    assert.equal(
      sanitizeForImageModel("war, battles, arrows, killed, burning"),
      "blessing, blessing, blessing, blessing, blessing",
    );
  });

  test("returns an empty string for null and undefined", () => {
    assert.equal(sanitizeForImageModel(null), "");
    assert.equal(sanitizeForImageModel(undefined), "");
  });
});

describe("assemblePrompt", () => {
  const parts = {
    scene: "Krishna speaks to Arjuna in the chariot",
    facts: ["drawn by exactly four white horses", "a banner bearing Hanuman"],
    personas: ["Krishna: blue-skinned youth with a peacock feather"],
    rules: ["RULE: men look masculine."],
    stylePositives: "oil painting, warm saffron palette, golden light",
    styleNegatives: "NOT cartoon, NOT anime, NOT CGI",
  };

  test("emits scene, facts, personas, rules, style positives, style negatives in that order", () => {
    // Act
    const { prompt, report } = assemblePrompt(parts, { maxLen: 2000 });
    // Assert
    const positions = [
      prompt.indexOf("Krishna speaks"),
      prompt.indexOf("Canonical details:"),
      prompt.indexOf("Characters:"),
      prompt.indexOf("RULE:"),
      prompt.indexOf("oil painting"),
      prompt.indexOf("NOT cartoon"),
    ];
    assert.ok(positions.every((p) => p >= 0), `missing part in: ${prompt}`);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
    assert.deepEqual(report.droppedParts, []);
    assert.equal(report.sentChars, prompt.length);
  });

  test("drops style negatives first under pressure", () => {
    // Arrange
    const full = assemblePrompt(parts, { maxLen: 2000 }).prompt;
    // Act: remove a little more than the negatives' last item
    const { prompt, report } = assemblePrompt(parts, { maxLen: full.length - 12 });
    // Assert
    assert.ok(prompt.length <= full.length - 12);
    assert.deepEqual(report.droppedParts, ["styleNegatives (partial)"]);
    assert.ok(prompt.includes("golden light"));
  });

  test("drops style entirely before touching rules, personas or facts", () => {
    const full = assemblePrompt(parts, { maxLen: 2000 }).prompt;
    // Everything up to and including the rules sentence (the space before style is not needed)
    const cut = full.indexOf("oil painting") - 1;
    const { prompt, report } = assemblePrompt(parts, { maxLen: cut });
    assert.deepEqual(report.droppedParts, ["stylePositives", "styleNegatives"]);
    assert.ok(prompt.includes("RULE:") && prompt.includes("Characters:") && prompt.includes("Canonical details:"));
  });

  test("sanitizes every part before measuring, so the result never exceeds maxLen", () => {
    // Arrange: each "war" grows by 5 characters when replaced
    const scene = "war ".repeat(60).trim();
    // Act
    const { prompt, report } = assemblePrompt({ scene, stylePositives: "warm light" }, { maxLen: 300 });
    // Assert
    assert.ok(prompt.length <= 300);
    assert.equal(/\bwar\b/i.test(prompt), false);
    assert.equal(report.truncatedScene, true);
  });

  test("never cuts an authorEdited scene that fits, even when facts and style must go", () => {
    // Arrange
    const scene = `A reviewer wrote this long scene ${"word ".repeat(70)}end`.trim();
    const maxLen = scene.length + 30;
    // Act
    const { prompt, report } = assemblePrompt({ ...parts, scene }, { maxLen, authorEdited: true });
    // Assert
    assert.ok(prompt.startsWith(scene));
    assert.equal(report.truncatedScene, false);
    assert.ok(report.droppedParts.includes("facts[0]"));
    assert.ok(report.droppedParts.includes("styleNegatives"));
    assert.ok(prompt.length <= maxLen);
  });

  test("cuts an authorEdited scene only when it alone exceeds maxLen, at a word boundary, and reports it", () => {
    const scene = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const { prompt, report } = assemblePrompt({ ...parts, scene }, { maxLen: 23, authorEdited: true });
    assert.equal(prompt, "alpha beta gamma delta");
    assert.equal(report.truncatedScene, true);
    assert.equal(report.maxLen, 23);
  });

  test("reserves room for facts by shortening a long generated scene", () => {
    // Arrange
    const scene = "generated ".repeat(40).trim();
    const maxLen = scene.length + 10;
    // Act
    const { prompt, report } = assemblePrompt({ scene, facts: parts.facts }, { maxLen, factsMax: 450 });
    // Assert
    assert.equal(report.truncatedScene, true);
    assert.ok(prompt.includes("Canonical details: drawn by exactly four white horses; a banner bearing Hanuman."));
    assert.ok(prompt.length <= maxLen);
  });

  test("keeps facts within factsMax, dropping whole facts from the end", () => {
    const facts = ["a".repeat(40), "b".repeat(40), "c".repeat(40)];
    const { prompt, report } = assemblePrompt({ scene: "scene", facts }, { maxLen: 2000, factsMax: 110 });
    assert.ok(prompt.includes("a".repeat(40)) && prompt.includes("b".repeat(40)));
    assert.equal(prompt.includes("c".repeat(40)), false);
    assert.deepEqual(report.droppedParts, ["facts[2]"]);
  });

  test("uses the caller's maxLen rather than a hardcoded limit", () => {
    const { prompt, report } = assemblePrompt({ ...parts, scene: "x ".repeat(1500) }, { maxLen: 2600 });
    assert.equal(report.maxLen, 2600);
    assert.ok(prompt.length > 2000 && prompt.length <= 2600);
  });

  test("emits everything when maxLen is unusable instead of throwing", () => {
    const { report } = assemblePrompt(parts, { maxLen: Number.NaN });
    assert.deepEqual(report.droppedParts, []);
    assert.equal(report.maxLen, report.sentChars);
  });
});

describe("research keys", () => {
  test("format each key exactly", () => {
    assert.equal(readerKey("bhagavatam", "0123456789abcdef"), "reader:bhagavatam:0123456789abcdef");
    assert.equal(gitaChapterKey(4), "gita:ch4");
    assert.equal(sceneKey("chaitanya", 1112, 3), "chaitanya:g1112:s3");
    assert.equal(sceneKey("bhagavatam", 254, 0), "bhagavatam:g254:s0");
    assert.equal(inlineKey("bhagavatam", 254), "bhagavatam:g254:inline");
  });

  test("normalise book case and whitespace so the same scene shares one key", () => {
    assert.equal(sceneKey(" Bhagavatam ", 1, 2), "bhagavatam:g1:s2");
  });

  test("map each key to its scope", () => {
    assert.equal(scopeForKey("reader:bhagavatam:0123456789abcdef"), "reader");
    assert.equal(scopeForKey("gita:ch18"), "chapter");
    assert.equal(scopeForKey("chaitanya:g1112:s3"), "scene");
    assert.equal(scopeForKey("bhagavatam:g254:inline"), "inline");
    assert.equal(scopeForKey("bhagavatam:g254:cover"), "chapter");
  });
});

describe("ttlFor", () => {
  const now = Date.UTC(2026, 8, 13, 12, 0, 0);

  test("keeps ok rows for 180 days", () => {
    assert.equal(ttlFor("ok", now), now + 180 * 24 * 60 * 60 * 1000);
  });

  test("keeps empty rows for 30 days", () => {
    assert.equal(ttlFor("empty", now), now + 30 * 24 * 60 * 60 * 1000);
  });

  test("keeps failed rows for 6 hours", () => {
    assert.equal(ttlFor("failed", now), now + 6 * 60 * 60 * 1000);
  });

  test("gives an unknown status the short failed TTL", () => {
    assert.equal(ttlFor("bogus" as "ok", now), now + TTL_MS.failed);
  });
});

describe("extractEntities", () => {
  test("finds chariot, horse and Arjuna in a Gita scene", () => {
    // Arrange
    const scene = "Krishna, the blue-skinned charioteer, holds the reins of Arjuna's chariot while four white horses stand on the plain of Kurukshetra.";
    // Act
    const e = extractEntities(scene);
    // Assert
    assert.deepEqual(e.characters, ["Krishna", "Arjuna"]);
    assert.ok(e.objects.includes("chariot") && e.objects.includes("horse") && e.objects.includes("reins"));
    assert.deepEqual(e.settings, ["Kurukshetra"]);
    assert.deepEqual(e.all.slice(0, 2), ["Krishna", "Arjuna"]);
  });

  test("lists scene JSON characters first and does not repeat them", () => {
    const e = extractEntities("Arjuna speaks with Sri Krishna", ["Sri Krishna", "Arjuna"]);
    assert.deepEqual(e.characters, ["Sri Krishna", "Arjuna"]);
  });

  test("matches persona patterns and skips unsafe ones without hanging", () => {
    const personas = [
      { name: "Achyuta", patterns: ["\\bAchyuta\\b"] },
      { name: "Evil", patterns: ["(a+)+$"] },
    ];
    const e = extractEntities(`Achyuta smiles ${"a".repeat(40)}!`, null, personas);
    assert.deepEqual(e.characters, ["Achyuta"]);
  });

  test("treats 'bow down' as a verb but 'his bow' as an object", () => {
    assert.equal(extractEntities("The sages bow down before Krishna").objects.includes("bow"), false);
    assert.equal(extractEntities("Arjuna lifts his bow").objects.includes("bow"), true);
  });

  test("returns empty lists for empty text", () => {
    assert.deepEqual(extractEntities(""), { characters: [], objects: [], settings: [], all: [] });
  });
});

describe("buildSearchQueries", () => {
  test("builds at most three queries, including a vaniquotes site query", () => {
    const e = extractEntities("Krishna drives Arjuna's chariot with white horses at Kurukshetra");
    const queries = buildSearchQueries(e, { book: "gita" });
    assert.ok(queries.length >= 2 && queries.length <= 3);
    assert.ok(queries[0].startsWith("Bhagavad-gita Krishna Arjuna chariot"));
    assert.ok(queries.some((q) => q.startsWith("site:vaniquotes.org ")));
  });

  test("returns no queries when there are no entities", () => {
    assert.deepEqual(buildSearchQueries(extractEntities("a quiet morning"), { book: "gita" }), []);
  });
});

describe("filterSearchResults", () => {
  test("removes blocked domains and duplicates, orders by source tier", () => {
    const results = [
      { url: "https://example.org/a", title: "A" },
      { url: "https://www.quora.com/q", title: "Q" },
      { url: "https://en.wikipedia.org/wiki/Arjuna", title: "W" },
      { url: "https://vedabase.io/en/library/bg/1/14/", title: "V" },
      { url: "https://vedabase.io/en/library/bg/1/14", title: "V dup" },
      { url: "ftp://nope", title: "bad" },
      null,
    ];
    const out = filterSearchResults(results);
    assert.deepEqual(out.map((s) => s.title), ["V", "W", "A"]);
  });

  test("caps the number of sources", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ url: `https://example.org/${i}` }));
    assert.equal(filterSearchResults(many, 10).length, 10);
    assert.deepEqual(filterSearchResults("nope"), []);
  });
});

describe("Claude request content", () => {
  test("tool schema is strict-compatible: every object closed, every property required", () => {
    const item = VISUAL_FACTS_INPUT_SCHEMA.properties.facts.items;
    assert.equal(VISUAL_FACTS_INPUT_SCHEMA.additionalProperties, false);
    assert.equal(item.additionalProperties, false);
    assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
    assert.equal(JSON.stringify(VISUAL_FACTS_INPUT_SCHEMA).includes("maxLength"), false);
  });

  test("user message carries the scene, source URLs and canon naming", () => {
    const msg = buildResearchUserMessage({
      book: "gita",
      title: "Chapter 1",
      sceneText: "Krishna and Arjuna in the chariot",
      entities: extractEntities("Krishna and Arjuna in the chariot"),
      sources: [SOURCE],
      canonPairs: [{ subject: "Arjuna's chariot", attribute: "horses" }],
    });
    assert.ok(msg.includes("Book: Bhagavad-gita"));
    assert.ok(msg.includes(`url: ${SRC_URL}`));
    assert.ok(msg.includes("- Arjuna's chariot / horses"));
  });
});

// ── Core fixes: prompt_text tied to the quote ────────────────────────────────

const ADV_URL = "https://example-blog.net/gita";
const ADV_SOURCE: FetchedSource = {
  url: ADV_URL,
  title: "Synthetic fixture",
  description: "",
  text: "Arjuna's chariot was yoked to four white horses and carried the flag of Hanuman. " +
    "Surya's chariot is drawn by seven horses. The five Pandavas stood by. One chariot had 1,000 bells. " +
    "The chariot had 1,000 bells. Arjuna's chariot had 1,000 bells. Arjuna's chariot was pulled by four steeds.",
};

function advFact(overrides: Partial<VisualFact> = {}): VisualFact {
  return fact({ source_url: ADV_URL, ...overrides });
}

describe("parseCount", () => {
  test("reads digit groups as one number, never the first group", () => {
    assert.equal(parseCount("1,000"), 1000);
  });

  test("reads compound number words", () => {
    assert.equal(parseCount("one hundred and eight"), 108);
    assert.equal(parseCount("twenty-four"), 24);
    assert.equal(parseCount("exactly 4"), 4);
  });

  test("does not read an ordinal as a number", () => {
    assert.equal(parseCount("fourth"), null);
  });
});

describe("verifyFacts ties prompt_text to the quote", () => {
  test("drops an object fact whose prompt_text states a number the quote does not", () => {
    const result = verifyFacts(
      [advFact({ kind: "object", value: "horses", prompt_text: "Arjuna's chariot drawn by two black horses" })],
      [ADV_SOURCE],
    );
    assert.deepEqual(reasons(result), ["prompt_number_not_in_quote"]);
  });

  test("drops a colour fact whose prompt_text names a colour the quote does not", () => {
    // Arrange: the value "white" is in the quote, but the prompt says golden
    const golden = advFact({ kind: "colour", value: "white", prompt_text: "drawn by golden horses" });
    const sevenGolden = advFact({ kind: "colour", value: "white", prompt_text: "drawn by seven golden horses" });
    // Act
    const result = verifyFacts([golden, sevenGolden], [ADV_SOURCE]);
    // Assert
    assert.deepEqual(reasons(result), ["prompt_colour_not_in_quote", "prompt_number_not_in_quote"]);
  });

  test("drops an attribute fact whose prompt_text says things the quote never says", () => {
    const base = { kind: "attribute" as const, value: "crown", quote: "The five Pandavas stood by" };
    const result = verifyFacts(
      [
        advFact({ ...base, prompt_text: "Arjuna wears a black crown with nine jewels" }),
        advFact({ ...base, prompt_text: "Arjuna wears a crown of jewels" }),
      ],
      [ADV_SOURCE],
    );
    assert.deepEqual(reasons(result), ["prompt_number_not_in_quote", "prompt_text_not_in_quote"]);
  });

  test("drops a count fact whose quote counts a different owner's horses", () => {
    const result = verifyFacts(
      [advFact({ value: "seven", quote: "Surya's chariot is drawn by seven horses", prompt_text: "drawn by seven horses" })],
      [ADV_SOURCE],
    );
    assert.deepEqual(reasons(result), ["count_owner_not_in_quote"]);
  });

  test("drops a count fact whose quote counts something other than the counted thing", () => {
    const result = verifyFacts(
      [advFact({ value: "five", quote: "The five Pandavas stood by", prompt_text: "drawn by five horses" })],
      [ADV_SOURCE],
    );
    assert.deepEqual(reasons(result), ["count_noun_not_in_quote"]);
  });

  test("never reads '1,000 bells' as the count one", () => {
    const result = verifyFacts(
      [advFact({ value: "one", quote: "The chariot had 1,000 bells", prompt_text: "drawn by one horse" })],
      [ADV_SOURCE],
    );
    assert.deepEqual(reasons(result), ["count_not_in_quote"]);
  });

  test("does not let an unrelated 'One chariot' prove one horse", () => {
    const result = verifyFacts(
      [advFact({ value: "one", quote: "One chariot had 1,000 bells", prompt_text: "drawn by one horse" })],
      [ADV_SOURCE],
    );
    assert.deepEqual(reasons(result), ["count_noun_not_in_quote"]);
  });

  test("keeps a thousand when the quote counts the owner's bells", () => {
    const result = verifyFacts(
      [advFact({ attribute: "bells", value: "1,000", quote: "Arjuna's chariot had 1,000 bells", prompt_text: "1,000 bells" })],
      [ADV_SOURCE],
    );
    assert.equal(result.kept.length, 1);
  });

  test("accepts a synonym for the counted thing", () => {
    const result = verifyFacts(
      [advFact({ quote: "Arjuna's chariot was pulled by four steeds", prompt_text: "pulled by four horses" })],
      [ADV_SOURCE],
    );
    assert.equal(result.kept.length, 1);
  });

  test("drops prompt_text containing a word any production function rewrites", () => {
    const result = verifyFacts([fact({ prompt_text: "four white horses before the sacred fire" })], [SOURCE]);
    assert.deepEqual(reasons(result), ["prompt_text_sanitizer_word"]);
  });
});

describe("conflicts and canon override", () => {
  const other: FetchedSource = {
    url: "https://example.org/other",
    title: "",
    text: "Arjuna's chariot had five white horses. Arjuna's chariot had golden horses.",
  };

  test("treats '4' and 'four' as the same value and keeps the first", () => {
    // Arrange: a cached fact with a digit value (verifyFacts now drops "4" earlier, as value_not_in_quote)
    const four = fact();
    const digit = fact({ value: "4", prompt_text: "four white horses yoked to the chariot" });
    // Act
    const result = resolveFactConflicts([four, digit]);
    // Assert
    assert.deepEqual(result.kept, [four]);
    assert.deepEqual(reasons(result), ["duplicate"]);
  });

  test("drops both counts when they differ, however the attribute is worded", () => {
    const five = fact({
      attribute: "number of horses",
      value: "five",
      prompt_text: "drawn by five white horses",
      source_url: other.url,
      quote: "Arjuna's chariot had five white horses",
    });
    const result = verifyFacts([fact(), five], [SOURCE, other]);
    assert.equal(result.kept.length, 0);
    assert.deepEqual(reasons(result), ["conflict", "conflict"]);
  });

  test("drops both facts when they name different colours for the same noun", () => {
    const golden = fact({
      attribute: "horse colour",
      kind: "colour",
      value: "golden",
      prompt_text: "golden horses",
      source_url: other.url,
      quote: "Arjuna's chariot had golden horses",
    });
    const result = verifyFacts([fact(), golden], [SOURCE, other]);
    assert.deepEqual(reasons(result), ["conflict", "conflict"]);
  });

  test("keeps a count fact and a colour fact about the same attribute when they agree", () => {
    const colour = fact({ kind: "colour", value: "white", prompt_text: "white horses" });
    const result = verifyFacts([fact(), colour], [SOURCE]);
    assert.equal(result.kept.length, 2);
  });

  test("resolveFactConflicts drops a cached fact and a new fact that disagree", () => {
    const cached = fact();
    const fresh = fact({ attribute: "horse count", value: "five", prompt_text: "drawn by five white horses" });
    const result = resolveFactConflicts([cached, fresh]);
    assert.deepEqual(result.kept, []);
    assert.deepEqual(reasons(result), ["conflict", "conflict"]);
  });

  const canonFour: CanonRow = {
    id: 1,
    subject: "Arjuna's chariot",
    attribute: "horses",
    prompt_text: "Arjuna's chariot is drawn by exactly four white horses, no more and no fewer",
    triggers: ["arjuna+chariot", "!surya"],
    book: null,
    source: "editor: test",
  };
  const scene = "Krishna drives Arjuna's chariot at Kurukshetra while Karna's chariot waits";

  test("canon removes a web count worded under a different attribute", () => {
    // Arrange
    const webFive = fact({ attribute: "number of horses", value: "five", prompt_text: "drawn by five white horses", triggers: ["Arjuna"] });
    // Act
    const merged = mergeCanon([canonFour], [webFive], scene, { book: "gita" });
    // Assert
    assert.deepEqual(merged.map((m) => m.origin), ["canon"]);
  });

  test("canon removes a web colour for a noun it covers", () => {
    const webGolden = fact({ attribute: "horse colour", kind: "colour", value: "golden", prompt_text: "drawn by golden horses", triggers: ["Arjuna"] });
    const merged = mergeCanon([canonFour], [webGolden], scene, { book: "gita" });
    assert.deepEqual(merged.map((m) => m.origin), ["canon"]);
  });

  test("canon keeps a web count about a different named owner", () => {
    const karna = fact({ subject: "Karna's chariot", value: "five", prompt_text: "Karna's chariot drawn by five horses", triggers: ["Karna"] });
    const merged = mergeCanon([canonFour], [karna], scene, { book: "gita" });
    assert.deepEqual(merged.map((m) => m.origin), ["canon", "web"]);
  });
});

describe("seeded canon triggers (migration)", () => {
  const seed = seededCanon();
  const chariotRows = seed.filter((r) => (r.id ?? 99) <= 4);

  test("parses the five seeded rows", () => {
    assert.equal(seed.length, 5);
    assert.equal(chariotRows.length, 4);
  });

  for (const other of [
    "Bhishma stands on his chariot at Kurukshetra, blowing his conch",
    "Karna's chariot wheel sinks into the earth at Kurukshetra",
    "Kartavirya Arjuna rides out on his golden chariot to meet Parashurama",
    "Sahasrarjuna drives his chariot to the hermitage of Jamadagni",
    "Arjuna follows the sacrificial horse of Yudhishthira's Ashvamedha across kingdoms",
  ]) {
    test(`keeps Arjuna's chariot canon off: ${other}`, () => {
      assert.deepEqual(selectFactsForScene(chariotRows, other), []);
    });
  }

  test("applies every chariot row to a Gita chariot scene", () => {
    const gita = "Krishna drives Arjuna's chariot between the two armies at Kurukshetra";
    assert.equal(selectFactsForScene(chariotRows, gita).length, 4);
  });

  test("seeded horse canon removes a web fact claiming five horses", () => {
    const gita = "Krishna drives Arjuna's chariot between the two armies at Kurukshetra";
    const webFive = fact({ attribute: "horse count", value: "five", prompt_text: "drawn by five white horses", triggers: ["Arjuna"] });
    const merged = mergeCanon(seed, [webFive], gita, { book: "gita" });
    assert.equal(merged.some((m) => /five/.test(m.prompt_text)), false);
    assert.equal(merged.filter((m) => m.origin === "canon").length, 5);
  });
});

describe("sanitizer word lists", () => {
  test("rewrites a function's extra words as whole words only", () => {
    const text = "fire sacrifice, defeated foes, tattered cloth, shocking disorder, humiliating; firearms and warm light";
    const out = sanitizeForImageModelWith(text, PRODUCTION_EXTRA_SANITIZE_WORDS["bulk-generate-chapter-art"]);
    assert.equal(out, "blessing sacrifice, blessing foes, blessing cloth, blessing blessing, blessing; firearms and warm light");
  });

  test("leaves the base sanitizer unchanged", () => {
    assert.equal(sanitizeForImageModel("fire sacrifice"), "fire sacrifice");
    assert.equal(sanitizeForImageModelWith("fire sacrifice", null), "fire sacrifice");
  });

  test("assemblePrompt rewrites extra words before measuring, so it stays within maxLen", () => {
    // Arrange: each "fire" grows by 4 characters when rewritten
    const scene = "fire ".repeat(80).trim();
    // Act
    const { prompt, report } = assemblePrompt(
      { scene, stylePositives: "firelight glow" },
      { maxLen: 300, extraSanitizeWords: ["fire"] },
    );
    // Assert
    assert.ok(prompt.length <= 300);
    assert.equal(/\bfire\b/i.test(prompt), false);
    assert.equal(report.truncatedScene, true);
  });

  test("tells Claude every rewritten word", () => {
    assert.ok(RESEARCH_SYSTEM_PROMPT.includes("fire") && RESEARCH_SYSTEM_PROMPT.includes("defeat"));
  });
});

describe("assemblePrompt budget options", () => {
  const canonFacts = seededCanon().map((r) => r.prompt_text);
  const bulkScene = "Prahlada Maharaja stands calmly in the palace courtyard while the demon king raises his hand in anger. "
    .repeat(9).slice(0, 828);
  const persona = (name: string) =>
    `${name}: a serene devotee with a calm face and folded palms. `.repeat(8).slice(0, 450);

  test("without budget options the real bulk rules are cut down to nothing useful", () => {
    const { report } = assemblePrompt(
      { scene: bulkScene, facts: canonFacts, personas: [persona("Prahlada"), persona("Narada")], rules: [GENDER_RULES, ANACHRONISM_RULES], stylePositives: ART_STYLE },
      { maxLen: 2000 },
    );
    assert.ok(report.droppedParts.includes("rules[1]"));
  });

  test("with the real bulk constants, reserves keep rules and style while every fact still fits", () => {
    // Arrange: today's compressed branch keeps GENDER_RULES[0,200] and ANACHRONISM_RULES[0,540]
    const parts = {
      scene: bulkScene,
      facts: canonFacts,
      personas: [persona("Prahlada"), persona("Narada")],
      rules: [GENDER_RULES, ANACHRONISM_RULES],
      stylePositives: ART_STYLE,
    };
    // Act
    const { prompt, report } = assemblePrompt(parts, { maxLen: 2000, rulesMin: 740, styleMin: 190, ruleCaps: [200, 540] });
    // Assert
    assert.ok(prompt.length <= 2000);
    for (const f of canonFacts) assert.ok(prompt.includes(f), `missing fact: ${f}`);
    assert.equal(report.droppedParts.some((d) => d.startsWith("facts[")), false);
    assert.equal(report.droppedParts.includes("rules[0]") || report.droppedParts.includes("rules[1]"), false);
    assert.ok(prompt.includes("ABSOLUTE GENDER RULES") && prompt.includes("ABSOLUTE ANACHRONISM RULES"));
    assert.ok(prompt.includes("museum-quality 19th-century Indian devotional OIL PAINTING on canvas"));
    const tail = prompt.length - prompt.indexOf("ABSOLUTE GENDER RULES");
    assert.ok(tail >= 700, `rules + style kept only ${tail} chars`);
  });

  test("cuts a persona at a sentence boundary to fit personasMax", () => {
    const { prompt, report } = assemblePrompt(
      { scene: "Krishna plays", personas: ["Krishna: a blue-skinned youth. He wears yellow silk and a peacock feather. He holds a flute."] },
      { maxLen: 2000, personasMax: 70 },
    );
    assert.equal(prompt, "Krishna plays. Characters: Krishna: a blue-skinned youth.");
    assert.deepEqual(report.droppedParts, ["personas[0] (partial)"]);
  });

  test("cuts a rule at a sentence boundary instead of dropping it", () => {
    const expected = "scene. RULE ONE: men look masculine. RULE TWO: no watches.";
    const { prompt, report } = assemblePrompt(
      { scene: "scene", rules: ["RULE ONE: men look masculine. RULE TWO: no watches. RULE THREE: no glasses."] },
      { maxLen: expected.length + 3 },
    );
    assert.equal(prompt, expected);
    assert.deepEqual(report.droppedParts, ["rules[0] (partial)"]);
  });

  test("never cuts an authorEdited scene to honour a reserve", () => {
    const scene = "reviewer words ".repeat(10).trim();
    const { prompt, report } = assemblePrompt(
      { scene, rules: ["Rule one is here. Rule two is here."] },
      { maxLen: 170, rulesMin: 100, authorEdited: true },
    );
    assert.equal(prompt, `${scene}. Rule one is here.`);
    assert.equal(report.truncatedScene, false);
    assert.deepEqual(report.droppedParts, ["rules[0] (partial)"]);
  });

  test("caps reserves at half of maxLen so the scene keeps room", () => {
    const { prompt, report } = assemblePrompt(
      {
        scene: "word ".repeat(120).trim(),
        rules: ["Keep this rule sentence. ".repeat(16).trim()],
        stylePositives: "oil, ".repeat(80),
      },
      { maxLen: 600, rulesMin: 400, styleMin: 400 },
    );
    assert.ok(prompt.length <= 600);
    assert.equal(report.truncatedScene, true);
    assert.ok(prompt.indexOf("Keep this rule sentence.") >= 295);
  });
});

describe("entity delta helpers", () => {
  const scene = "Krishna's chariot with four horses and a Garuda banner leaves Hastinapura";

  test("lists the characters and objects a cached row has not researched", () => {
    const missing = unresearchedEntities(extractEntities(scene), ["Sri Krishna", "flute"]);
    assert.deepEqual(missing, ["Garuda", "chariot", "horse", "banner"]);
  });

  test("does not let a shorter researched name cover a longer one", () => {
    const missing = unresearchedEntities(extractEntities("", ["Kartavirya Arjuna"]), ["Arjuna"]);
    assert.deepEqual(missing, ["Kartavirya Arjuna"]);
  });

  test("returns nothing when every entity was researched", () => {
    const e = extractEntities(scene);
    assert.deepEqual(unresearchedEntities(e, e.all), []);
  });

  test("focusEntities moves the given entities to the front", () => {
    const e = focusEntities(extractEntities("Krishna and Arjuna in the chariot with a flute"), ["flute", "Arjuna"]);
    assert.equal(e.characters[0], "Arjuna");
    assert.equal(e.objects[0], "flute");
  });
});

// ── Fix round: canon precision (context_triggers / negative_triggers) ────────

const { MEASURED_SCENES, ORIGINAL_SEED, GITA_BRIEFS } = await import("./fixtures/measured-scenes.ts");

const firedIds = (rows: CanonRow[], text: string) => selectFactsForScene(rows, text).map((r) => r.id);

describe("canon context_triggers and negative_triggers", () => {
  const base: CanonRow = {
    id: 1,
    subject: "Arjuna's chariot",
    attribute: "charioteer",
    prompt_text: "Krishna stands at the front of the chariot holding the reins as charioteer",
    triggers: ["arjuna+chariot"],
    context_triggers: ["kurukshetra", "gita"],
    negative_triggers: ["dwarka"],
    book: null,
    source: "editor: test",
  };

  test("selects a row when a trigger AND a context trigger match", () => {
    // Arrange
    const scene = "Krishna drives Arjuna's chariot onto the plain of Kurukshetra";
    // Act
    const selected = selectFactsForScene([base], scene);
    // Assert
    assert.deepEqual(selected, [base]);
  });

  test("does not select a row whose trigger matches without any context trigger", () => {
    const scene = "Arjuna holds a parasol over Krishna's chariot at Hastinapura";
    assert.deepEqual(selectFactsForScene([base], scene), []);
  });

  test("an empty, null or missing context list does not restrict the row", () => {
    const scene = "Arjuna's chariot waits at Hastinapura";
    for (const context_triggers of [[], null, undefined]) {
      assert.equal(selectFactsForScene([{ ...base, context_triggers }], scene).length, 1, `context ${String(context_triggers)}`);
    }
  });

  test("a '+' context group needs every word", () => {
    const row = { ...base, context_triggers: ["krishna+charioteer"] };
    assert.equal(selectFactsForScene([row], "Arjuna's chariot with Krishna as charioteer").length, 1);
    assert.equal(selectFactsForScene([row], "Arjuna's chariot with Krishna beside him").length, 0);
  });

  test("any negative trigger suppresses the row, even with trigger and context matching", () => {
    const scene = "Arjuna's chariot leaves Kurukshetra for Dwarka";
    assert.deepEqual(selectFactsForScene([base], scene), []);
  });

  test("a '+' negative group suppresses only when every word appears; a leading '!' is tolerated", () => {
    const row = { ...base, negative_triggers: ["!solar+eclipse"] };
    assert.equal(selectFactsForScene([row], "Arjuna's chariot at Kurukshetra during the solar eclipse").length, 0);
    assert.equal(selectFactsForScene([row], "Arjuna's chariot at Kurukshetra, the solar dynasty's field").length, 1);
  });

  test("context and negatives match whole words, case-insensitively, across diacritics", () => {
    const row = { ...base, context_triggers: ["Kurukṣetra"], negative_triggers: ["Caitanya"] };
    assert.equal(selectFactsForScene([row], "ARJUNA'S CHARIOT AT KURUKSETRA").length, 1);
    assert.equal(selectFactsForScene([row], "Arjuna's chariot at Kuruksetra, as Śrī Caitanya remembers it").length, 0);
    assert.equal(selectFactsForScene([{ ...base, context_triggers: ["gita"] }], "Arjuna's chariot and the Gitanjali").length, 0);
    assert.equal(selectFactsForScene([{ ...base, negative_triggers: ["gaura"] }], "Arjuna's chariot at Kurukshetra, Gauranga's vision").length, 1);
  });

  test("fails closed when a list is not an array or has no usable entry", () => {
    const scene = "Krishna drives Arjuna's chariot onto the plain of Kurukshetra";
    const bad = [
      { ...base, context_triggers: "kurukshetra" as unknown as string[] },
      { ...base, negative_triggers: { dwarka: true } as unknown as string[] },
      { ...base, context_triggers: ["", "+", 7 as unknown as string] },
    ];
    for (const row of bad) assert.deepEqual(selectFactsForScene([row], scene), []);
  });

  test("mergeCanon: a row held back by its context neither enters the prompt nor overrides a web fact", () => {
    // Arrange
    const webReins = fact({ attribute: "charioteer", kind: "position", value: "reins", prompt_text: "Arjuna holds the reins", triggers: ["Arjuna"] });
    const scene = "Arjuna holds the reins of his chariot as he carries Subhadra away";
    // Act
    const merged = mergeCanon([base], [webReins], scene);
    // Assert
    assert.deepEqual(merged.map((m) => m.origin), ["web"]);
    assert.equal(mergeCanon([base], [webReins], `${scene} across Kurukshetra`).map((m) => m.origin)[0], "canon");
  });
});

describe("seeded canon on real measured scenes", () => {
  const seed = seededCanon();

  test("seeds context for every chariot row and Chaitanya negatives for Krishna's appearance", () => {
    const byId = new Map(seed.map((r) => [r.id, r]));
    for (const id of [1, 2, 3, 4]) {
      assert.ok((byId.get(id)?.context_triggers ?? []).includes("kurukshetra"), `row ${id} context`);
      assert.ok((byId.get(id)?.negative_triggers ?? []).includes("eclipse"), `row ${id} negatives`);
    }
    const krishna = byId.get(5) as CanonRow;
    assert.deepEqual(krishna.context_triggers, []);
    for (const name of ["chaitanya", "caitanya", "mahaprabhu", "gauranga", "gauranja", "gaura", "gaurhari", "nimai", "vishvambhara"]) {
      assert.ok((krishna.negative_triggers ?? []).includes(name), `row 5 negative ${name}`);
    }
  });

  for (const s of MEASURED_SCENES) {
    test(`${s.key}: ${s.why}`, () => {
      // Act
      const before = firedIds(ORIGINAL_SEED, s.text);
      const after = firedIds(seed, s.text);
      // Assert: the old seed reproduces the SQL sweep; the new seed fires only where true
      assert.deepEqual(before, s.before, "original seed");
      assert.deepEqual(after, s.after, "current seed");
    });
  }

  test("chariot, reins, banner and Gandiva rows fire only on the Arjuna-chariot scene with Krishna driving", () => {
    const chariotRows = seed.filter((r) => (r.id ?? 99) <= 4);
    const firing = MEASURED_SCENES.filter((s) => selectFactsForScene(chariotRows, s.text).length > 0).map((s) => s.key);
    const firingBefore = MEASURED_SCENES.filter((s) => selectFactsForScene(ORIGINAL_SEED.slice(0, 4), s.text).length > 0);
    assert.deepEqual(firing, ["bhagavatam:g7:s3"]);
    // SQL sweep: the original rows 1-4 fired on 10 distinct scenes, 9 of them wrong
    assert.equal(firingBefore.length, 10);
  });

  test("the Krishna and Balarama eclipse procession no longer gets 'Krishna holds the reins'", () => {
    const eclipse = MEASURED_SCENES.find((s) => s.key === "bhagavatam:g283:s0");
    const merged = mergeCanon(seed, [], eclipse?.text ?? "", { book: "bhagavatam" });
    assert.equal(merged.some((m) => /holding the reins/.test(m.prompt_text)), false);
    assert.equal(merged.some((m) => /Arjuna/.test(m.prompt_text)), false);
  });

  for (const brief of GITA_BRIEFS) {
    test(`keeps all five rows on the stored Gita brief: ${brief.chapter}`, () => {
      assert.deepEqual(firedIds(seed, brief.text), [1, 2, 3, 4, 5]);
    });
  }

  for (const name of ["Chaitanya", "Caitanya", "Śrī Caitanya", "Mahaprabhu", "Gauranga", "Gauranja", "Gaura", "Gaurahari", "Gaurhari", "Nimai", "Vishvambhara", "Viśvambhara"]) {
    test(`no seeded row fires on a Sri Chaitanya scene naming him '${name}'`, () => {
      // Arrange: every trigger and context word is present, so only the negatives can hold the rows back
      const scene = `${name} weeps, seeing Krishna drive Arjuna's chariot at Kurukshetra as the Gita is recited`;
      // Act + Assert
      assert.deepEqual(firedIds(seed, scene), []);
    });
  }

  test("the same scene without Sri Chaitanya's name keeps every row (the negatives are what suppress)", () => {
    assert.deepEqual(firedIds(seed, "A devotee weeps, seeing Krishna drive Arjuna's chariot at Kurukshetra as the Gita is recited"), [1, 2, 3, 4, 5]);
  });

  test("a different person's name that merely starts like Gaura does not suppress Krishna's appearance", () => {
    assert.deepEqual(firedIds(seed, "Gauridas Pandita hears how Krishna's chariot left Vrindavan"), [5]);
  });

  test("keeps Arjuna's chariot canon off Abhimanyu's chariot at Kurukshetra", () => {
    assert.deepEqual(firedIds(seed, "Abhimanyu, son of Arjuna, drives his chariot into the formation at Kurukshetra").filter((id) => (id ?? 9) <= 4), []);
  });
});

// ── Fix round: value must match its quote and prompt_text ────────────────────

describe("verifyFacts: value must be stated by the quote and by prompt_text", () => {
  const URL_B = "https://vedabase.io/en/library/sb/1/7/";
  const SRC_B: FetchedSource = {
    url: URL_B,
    title: "Synthetic fixture",
    description: "",
    text: "Arjuna's golden chariot was yoked to four white horses. Krishna wears yellow silk and a crown of peacock feathers. " +
      "Arjuna's chariot was yoked to four white horses and five bells. The sacred chariot of Arjuna was yoked to four white horses.",
  };
  const bFact = (overrides: Partial<VisualFact>) => fact({ source_url: URL_B, ...overrides });

  test("keeps a fact whose value appears in both the quote and prompt_text", () => {
    // Arrange
    const candidate = bFact({ kind: "attribute", attribute: "horses", value: "four white horses", prompt_text: "drawn by four white horses" });
    // Act
    const result = verifyFacts([candidate], [SRC_B]);
    // Assert
    assert.equal(result.kept.length, 1);
    assert.deepEqual(result.dropped, []);
  });

  test("mismatched colour: value 'golden' is quoted, but prompt_text renders white horses", () => {
    const candidate = bFact({
      attribute: "horse colour",
      kind: "colour",
      value: "golden",
      prompt_text: "four white horses",
      quote: "Arjuna's golden chariot was yoked to four white horses",
    });
    assert.deepEqual(reasons(verifyFacts([candidate], [SRC_B])), ["value_not_in_prompt_text"]);
  });

  test("mismatched colour: a real quote with a value it never states", () => {
    const candidate = bFact({
      subject: "Krishna",
      attribute: "garment",
      kind: "garment",
      value: "red turban",
      prompt_text: "Krishna wears yellow silk",
      triggers: ["Krishna"],
      quote: "Krishna wears yellow silk",
    });
    assert.deepEqual(reasons(verifyFacts([candidate], [SRC_B])), ["value_not_in_quote"]);
  });

  test("a real quote with prompt_text 'Krishna has pale golden skin and wears a red turban' is dropped", () => {
    const candidate = bFact({
      subject: "Krishna",
      attribute: "skin",
      kind: "attribute",
      value: "yellow silk",
      prompt_text: "Krishna has pale golden skin and wears a red turban",
      triggers: ["Krishna"],
      quote: "Krishna wears yellow silk and a crown of peacock feathers",
    });
    const result = verifyFacts([candidate], [SRC_B]);
    assert.equal(result.kept.length, 0);
  });

  test("swapped count: value 'five horses' where the quote says four horses and five bells", () => {
    const candidate = bFact({
      kind: "object",
      value: "five horses",
      prompt_text: "four white horses",
      quote: "Arjuna's chariot was yoked to four white horses and five bells",
    });
    assert.deepEqual(reasons(verifyFacts([candidate], [SRC_B])), ["value_not_in_quote"]);
  });

  test("value absent from prompt_text: a count written as a digit in the prompt", () => {
    const candidate = bFact({ value: "four", prompt_text: "drawn by 4 white horses", quote: "Arjuna's golden chariot was yoked to four white horses" });
    assert.deepEqual(reasons(verifyFacts([candidate], [SRC_B])), ["value_not_in_prompt_text"]);
  });

  test("value absent from prompt_text: an attribute the prompt leaves out", () => {
    const candidate = bFact({ kind: "attribute", value: "white horses", prompt_text: "yoked to four horses", quote: "Arjuna's golden chariot was yoked to four white horses" });
    assert.deepEqual(reasons(verifyFacts([candidate], [SRC_B])), ["value_not_in_prompt_text"]);
  });

  test("matches value on word boundaries only: 'red' is not inside 'sacred'", () => {
    const candidate = bFact({ kind: "attribute", value: "red", prompt_text: "four white horses", quote: "The sacred chariot of Arjuna was yoked to four white horses" });
    assert.deepEqual(reasons(verifyFacts([candidate], [SRC_B])), ["value_not_in_quote"]);
  });

  test("folds case, diacritics and punctuation in value", () => {
    const candidate = bFact({ kind: "attribute", value: "FOUR WHITE-HORSES", prompt_text: "drawn by four white horses" });
    assert.equal(verifyFacts([candidate], [SRC_B]).kept.length, 1);
  });

  test("drops a value made only of punctuation", () => {
    const candidate = bFact({ kind: "attribute", value: "—", prompt_text: "drawn by four white horses" });
    assert.deepEqual(reasons(verifyFacts([candidate], [SRC_B])), ["value_not_in_quote"]);
  });

  test("tells Claude to copy value from the quote into prompt_text", () => {
    assert.ok(RESEARCH_SYSTEM_PROMPT.includes("value: copied word for word from the quote"));
  });
});

describe("assemblePrompt style-negatives join", () => {
  test("joins negatives with '. ' when style positives were dropped", () => {
    // Arrange: positives have no comma, so no part of them fits; the rule ends without a period
    const parts = { scene: "scene", rules: ["Keep painted or mode"], stylePositives: "museum-quality-oil-painting-with-no-commas", styleNegatives: "NOT cartoon, NOT anime" };
    // Act
    const { prompt, report } = assemblePrompt(parts, { maxLen: 40 });
    // Assert
    assert.equal(prompt, "scene. Keep painted or mode. NOT cartoon");
    assert.deepEqual(report.droppedParts, ["stylePositives", "styleNegatives (partial)"]);
  });

  test("joins negatives with '. ' when there are no style positives", () => {
    const { prompt } = assemblePrompt({ scene: "scene", rules: ["Keep painted or mode"], styleNegatives: "NOT cartoon" }, { maxLen: 2000 });
    assert.equal(prompt, "scene. Keep painted or mode. NOT cartoon");
  });

  test("keeps ', ' after style positives that fit", () => {
    const { prompt } = assemblePrompt({ scene: "scene", stylePositives: "oil painting", styleNegatives: "NOT cartoon" }, { maxLen: 2000 });
    assert.equal(prompt, "scene. oil painting, NOT cartoon");
  });
});

// ── Fix round: the quote must give THIS value to THIS owner ──────────────────

describe("verifyFacts: owner and value in the same sentence of one source field", () => {
  const URL_C = "https://example.org/owners";
  const SRC_C: FetchedSource = {
    url: URL_C,
    title: "The banner of Arjuna",
    description: "Five horses draw the chariot of Surya",
    text: "The flag of Arjuna bore Hanuman. Seven horses pull the chariot of Surya. " +
      "In one telling the chariot of Surya with seven horses, the chariot of Arjuna had four horses. " +
      "Krishna wore yellow garments and Balarama wore blue garments. " +
      "The chariot of Duryodhana was yoked with black horses. " +
      "Arjuna's chariot was never drawn by five horses. " +
      "Arjuna's chariot was yoked to four white horses and its flag bore Hanuman. " +
      "Krishna drove Arjuna's chariot, which was yoked to four white horses. " +
      "Arjuna's chariot, driven by Krishna, had four white horses. " +
      "The chariot of Karna had five horses and the chariot of Arjuna had four horses. " +
      "Arjuna's chariot, never mind the dust, was yoked to four white horses. " +
      "Arjuna's chariot was not yoked to four white horses. Arjuna's chariot wasn't yoked to four white horses. " +
      "Surya's chariot had seven horses.\n" +
      "Arjuna's banner\nSeven horses pull the chariot of Surya; Arjuna's flag bore Hanuman",
  };
  const cFact = (overrides: Partial<VisualFact>) => fact({ source_url: URL_C, ...overrides });

  // The six facts a review kept with dropped=[] (each quote is real; each gives the value to the wrong owner).
  const ADVERSARIAL: Record<string, { fact: VisualFact; reason: string }> = {
    "count in a different sentence from its owner": {
      fact: cFact({ value: "seven", prompt_text: "Arjuna's chariot pulled by seven horses", quote: "Arjuna bore Hanuman. Seven horses pull the chariot" }),
      reason: "owner_not_in_value_sentence",
    },
    "count stated for a second owner earlier in the sentence": {
      fact: cFact({
        value: "seven",
        prompt_text: "Arjuna's chariot with seven horses",
        quote: "the chariot of Surya with seven horses, the chariot of Arjuna had four horses",
      }),
      reason: "value_belongs_to_other_owner",
    },
    "colour stated for another person": {
      fact: cFact({
        subject: "Krishna",
        attribute: "garment colour",
        kind: "colour",
        value: "blue",
        prompt_text: "Krishna wore blue garments",
        triggers: ["Krishna"],
        quote: "Krishna wore yellow garments and Balarama wore blue garments",
      }),
      reason: "value_belongs_to_other_owner",
    },
    "colour fact whose quote never names the owner": {
      fact: cFact({
        attribute: "horse colour",
        kind: "colour",
        value: "black",
        prompt_text: "Arjuna's chariot yoked with black horses",
        quote: "chariot of Duryodhana was yoked with black horses",
      }),
      reason: "owner_not_in_quote",
    },
    "quote spanning the title and the description": {
      fact: cFact({ value: "Five", prompt_text: "Arjuna's chariot drawn by five horses", quote: "The banner of Arjuna Five horses draw the chariot" }),
      reason: "quote_not_in_source",
    },
    "negated value": {
      fact: cFact({ value: "five", prompt_text: "Arjuna's chariot drawn by five horses", quote: "Arjuna's chariot was never drawn by five horses" }),
      reason: "value_negated",
    },
  };

  for (const [name, { fact: candidate, reason }] of Object.entries(ADVERSARIAL)) {
    test(`drops a ${name} (${reason})`, () => {
      // Arrange: candidate built above
      // Act
      const result = verifyFacts([candidate], [SRC_C]);
      // Assert
      assert.deepEqual(result.kept, []);
      assert.deepEqual(reasons(result), [reason]);
    });
  }

  test("keeps the control fact whose owner and value share a sentence", () => {
    // Arrange
    const control = cFact({});
    // Act
    const result = verifyFacts([control], [SRC_C]);
    // Assert
    assert.equal(result.kept.length, 1);
    assert.deepEqual(result.dropped, []);
  });

  test("the six together with the control: only the control is kept, and mergeCanon emits none of the six", () => {
    // Arrange
    const candidates = [...Object.values(ADVERSARIAL).map((a) => a.fact), cFact({})];
    const seed = seededCanon();
    const kurukshetra = "Krishna, a youthful MALE charioteer with blue skin, holds the reins of Arjuna's chariot on the plain of Kurukshetra while Arjuna listens";
    const procession = "Arjuna rides his chariot in a royal procession through the streets of Hastinapura";
    // Act
    const { kept } = verifyFacts(candidates, [SRC_C]);
    const atKurukshetra = mergeCanon(seed, kept, kurukshetra).filter((m) => m.origin === "web").map((m) => m.prompt_text);
    const inProcession = mergeCanon(seed, kept, procession).filter((m) => m.origin === "web").map((m) => m.prompt_text);
    // Assert
    assert.deepEqual(kept.map((f) => f.quote), ["Arjuna's chariot was yoked to four white horses"]);
    assert.ok(!atKurukshetra.some((t) => /blue garments|black horses|seven|five/i.test(t)), atKurukshetra.join(" | "));
    assert.deepEqual(inProcession, ["drawn by exactly four white horses"]);
  });

  test("keeps a quote spanning two sentences when the owner and value share one of them", () => {
    const candidate = cFact({
      subject: "Arjuna's flag",
      attribute: "emblem",
      kind: "object",
      value: "Hanuman",
      prompt_text: "the flag of Arjuna bore Hanuman",
      triggers: ["Arjuna"],
      quote: "The flag of Arjuna bore Hanuman. Seven horses pull the chariot",
    });
    const result = verifyFacts([candidate], [SRC_C]);
    assert.equal(result.kept.length, 1, JSON.stringify(result.dropped));
  });

  test("keeps a value whose owner is nearer to it than another named person", () => {
    const result = verifyFacts([cFact({ quote: "Krishna drove Arjuna's chariot, which was yoked to four white horses" })], [SRC_C]);
    assert.equal(result.kept.length, 1, JSON.stringify(result.dropped));
  });

  test("drops a value when another named person sits between the owner and the value", () => {
    const result = verifyFacts([cFact({ quote: "Arjuna's chariot, driven by Krishna, had four white horses" })], [SRC_C]);
    assert.deepEqual(reasons(result), ["value_belongs_to_other_owner"]);
  });

  test("treats a person outside the entity lexicon (Karna) as another owner", () => {
    const candidate = cFact({
      value: "five",
      prompt_text: "Arjuna's chariot drawn by five horses",
      quote: "The chariot of Karna had five horses and the chariot of Arjuna had four horses",
    });
    assert.deepEqual(reasons(verifyFacts([candidate], [SRC_C])), ["value_belongs_to_other_owner"]);
  });

  test("a subject naming no owner is dropped when its sentence names someone, even outside the quote", () => {
    // Arrange: the quote stops before "of Surya"; the source sentence does not
    const cut = cFact({ subject: "the chariot", value: "Seven", prompt_text: "the chariot pulled by seven horses", quote: "Seven horses pull the chariot" });
    const named = cFact({ subject: "the chariot", value: "seven", prompt_text: "the chariot pulled by seven horses", quote: "Surya's chariot had seven horses" });
    // Act
    const result = verifyFacts([cut, named], [SRC_C]);
    // Assert
    assert.deepEqual(reasons(result), ["value_belongs_to_other_owner", "value_belongs_to_other_owner"]);
  });

  test("negation: 'not' and a contraction right before the value drop it; 'never' four content words back does not", () => {
    // Arrange
    const not = cFact({ quote: "Arjuna's chariot was not yoked to four white horses" });
    const wasnt = cFact({ quote: "Arjuna's chariot wasn't yoked to four white horses" });
    const far = cFact({ quote: "Arjuna's chariot, never mind the dust, was yoked to four white horses" });
    // Act
    const result = verifyFacts([not, wasnt, far], [SRC_C]);
    // Assert
    assert.deepEqual(reasons(result), ["value_negated", "value_negated"]);
    assert.deepEqual(result.kept.map((f) => f.quote), [far.quote]);
  });

  test("a line break or ';' in the source is a sentence break even when the quote leaves it out", () => {
    // Arrange: "Arjuna's banner" is a heading line; the count is on the next line
    const heading = cFact({ value: "Seven", prompt_text: "Arjuna's chariot pulled by seven horses", quote: "Arjuna's banner Seven horses pull the chariot" });
    const semicolon = cFact({
      subject: "Arjuna's flag",
      attribute: "emblem",
      kind: "object",
      value: "Hanuman",
      prompt_text: "the flag of Arjuna bore Hanuman",
      triggers: ["Arjuna"],
      quote: "Seven horses pull the chariot of Surya Arjuna's flag bore Hanuman",
    });
    // Act
    const result = verifyFacts([heading, semicolon], [SRC_C]);
    // Assert: the semicolon case keeps Hanuman (owner in its own sentence); the heading case is dropped
    assert.deepEqual(reasons(result), ["owner_not_in_value_sentence"]);
    assert.deepEqual(result.kept.map((f) => f.value), ["Hanuman"]);
  });

  test("matches the quote inside a single field, including a second entry for the same URL", () => {
    // Arrange: a search result (title + snippet) and a scraped page share one URL
    const url = "https://vaniquotes.org/wiki/Arjuna";
    const searchResult: FetchedSource = { url, title: "Arjuna's chariot", description: "was yoked to four white horses" };
    const scraped: FetchedSource = { url, text: "Synthetic page. Arjuna's chariot was yoked to four white horses." };
    const inDescription: FetchedSource = { url: "https://example.org/desc", title: "", description: "Arjuna's chariot was yoked to four white horses" };
    // Act
    const split = verifyFacts([fact({ source_url: url })], [searchResult]);
    const joined = verifyFacts([fact({ source_url: url })], [searchResult, scraped]);
    const snippet = verifyFacts([fact({ source_url: inDescription.url })], [inDescription]);
    // Assert
    assert.deepEqual(reasons(split), ["quote_not_in_source"]);
    assert.equal(joined.kept.length, 1);
    assert.equal(snippet.kept.length, 1);
  });

  test("tells Claude to quote one field and name the owner in the value's sentence", () => {
    assert.ok(RESEARCH_SYSTEM_PROMPT.includes("never joined across them"));
    assert.ok(RESEARCH_SYSTEM_PROMPT.includes("in the same sentence as value"));
  });
});
